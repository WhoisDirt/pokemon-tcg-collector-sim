export const cents = (d: number) => Math.round(d * 100);
export const usd = (c: number) => (c < 0 ? "-" : "") + "$" + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const usd0 = (c: number) => (c < 0 ? "-" : "") + "$" + Math.round(Math.abs(c) / 100).toLocaleString("en-US");
export class GameError extends Error {}
export function fail(msg: string): never { throw new GameError(msg); }
export function rnd(s: { rng: number }): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return h >>> 0;
}
export const hrand = (str: string) => hash(str) / 4294967296;
export function pick<T>(s: { rng: number }, arr: T[]): T { return arr[Math.floor(rnd(s) * arr.length)]; }
export function weighted<T extends string>(s: { rng: number }, w: Record<T, number>): T {
  const keys = Object.keys(w) as T[];
  let tot = 0; for (const k of keys) tot += w[k];
  let r = rnd(s) * tot;
  for (const k of keys) { r -= w[k]; if (r <= 0) return k; }
  return keys[keys.length - 1];
}
export function randn(s: { rng: number }): number {
  const u = Math.max(1e-9, rnd(s)), v = rnd(s);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function addDays(date: string, n: number): string {
  const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function dayDiff(a: string, b: string): number {
  return Math.round((new Date(a + "T12:00:00Z").getTime() - new Date(b + "T12:00:00Z").getTime()) / 86400000);
}
export function fmtDate(date: string): string {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
export function weekday(date: string): number { return new Date(date + "T12:00:00Z").getUTCDay(); }
