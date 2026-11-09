//! Plain SQLite save-game store. No Tauri dependency so it can be unit tested anywhere.
use rusqlite::{params, Connection};

pub struct Store {
    conn: Connection,
}

fn e<T: std::fmt::Display>(x: T) -> String { x.to_string() }

impl Store {
    pub fn open(path: &str) -> Result<Store, String> {
        let conn = Connection::open(path).map_err(e)?;
        Self::init(conn)
    }
    pub fn open_memory() -> Result<Store, String> {
        Self::init(Connection::open_in_memory().map_err(e)?)
    }
    fn init(conn: Connection) -> Result<Store, String> {
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
             CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated INTEGER NOT NULL DEFAULT 0);",
        ).map_err(e)?;
        Ok(Store { conn })
    }
    pub fn get_all(&self) -> Result<Vec<(String, String)>, String> {
        let mut st = self.conn.prepare("SELECT key, value FROM kv ORDER BY key").map_err(e)?;
        let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(e)?;
        let mut out = vec![];
        for r in rows { out.push(r.map_err(e)?); }
        Ok(out)
    }
    pub fn get(&self, key: &str) -> Result<Option<String>, String> {
        let mut st = self.conn.prepare("SELECT value FROM kv WHERE key=?1").map_err(e)?;
        let mut rows = st.query(params![key]).map_err(e)?;
        match rows.next().map_err(e)? { Some(r) => Ok(Some(r.get(0).map_err(e)?)), None => Ok(None) }
    }
    /// All items are written in ONE transaction: either every slice of the save is stored or none is.
    pub fn set_many(&mut self, items: &[(String, String)]) -> Result<(), String> {
        let tx = self.conn.transaction().map_err(e)?;
        {
            let mut st = tx.prepare("INSERT INTO kv(key,value,updated) VALUES(?1,?2,strftime('%s','now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated=excluded.updated").map_err(e)?;
            for (k, v) in items { st.execute(params![k, v]).map_err(e)?; }
        }
        tx.commit().map_err(e)
    }
    pub fn backup_to(&self, dest: &str) -> Result<(), String> {
        let _ = std::fs::remove_file(dest);
        self.conn.execute("VACUUM INTO ?1", params![dest]).map_err(e)?;
        Ok(())
    }
    /// Replace the whole save with the contents of another save file (atomic).
    pub fn restore_from(&mut self, src: &str) -> Result<usize, String> {
        let other = Store::open(src)?;
        let rows = other.get_all()?;
        if rows.is_empty() { return Err("Backup file contains no save data".into()); }
        let tx = self.conn.transaction().map_err(e)?;
        tx.execute("DELETE FROM kv", []).map_err(e)?;
        {
            let mut st = tx.prepare("INSERT INTO kv(key,value,updated) VALUES(?1,?2,strftime('%s','now'))").map_err(e)?;
            for (k, v) in &rows { st.execute(params![k, v]).map_err(e)?; }
        }
        tx.commit().map_err(e)?;
        Ok(rows.len())
    }
    pub fn wipe(&mut self) -> Result<(), String> {
        self.conn.execute("DELETE FROM kv", []).map_err(e)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_and_atomic() {
        let mut s = Store::open_memory().unwrap();
        s.set_many(&[("a".into(), "1".into()), ("b".into(), "2".into())]).unwrap();
        s.set_many(&[("a".into(), "3".into())]).unwrap();
        assert_eq!(s.get("a").unwrap().unwrap(), "3");
        assert_eq!(s.get_all().unwrap().len(), 2);
        s.wipe().unwrap();
        assert!(s.get_all().unwrap().is_empty());
    }
    #[test]
    fn backup_restore() {
        let dir = std::env::temp_dir().join(format!("pokesim_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("a.sqlite"); let b = dir.join("b.sqlite");
        let mut s = Store::open(p.to_str().unwrap()).unwrap();
        s.set_many(&[("cash".into(), "4000".into())]).unwrap();
        s.backup_to(b.to_str().unwrap()).unwrap();
        s.set_many(&[("cash".into(), "1".into()), ("x".into(), "y".into())]).unwrap();
        let n = s.restore_from(b.to_str().unwrap()).unwrap();
        assert_eq!(n, 1);
        assert_eq!(s.get("cash").unwrap().unwrap(), "4000");
        assert!(s.get("x").unwrap().is_none());
        let _ = std::fs::remove_dir_all(dir);
    }
}
