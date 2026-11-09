import json,glob,os,re,difflib,sys,urllib.request
from concurrent.futures import ThreadPoolExecutor
RAW="../data_raw"; OUT="../public/data"; IMG="../public/img"
os.makedirs(OUT+"/cards",exist_ok=True); os.makedirs(IMG+"/sets",exist_ok=True); os.makedirs(IMG+"/sealed",exist_ok=True)
sets=json.load(open(RAW+"/sets.json"))
sealed_all=json.load(open(RAW+"/sealed_all.json"))
def tier(r,st):
    if st=="Energy" and (r in (None,"Common","Uncommon")): return "e"
    if r is None: return "c"
    x=r.lower()
    if x=="common": return "c"
    if x=="uncommon": return "u"
    if x=="rare": return "r"
    if x=="promo": return "promo"
    if "special illustration" in x: return "sir"
    if "illustration" in x: return "ir"
    if "hyper" in x or "secret" in x or "rainbow" in x or "gold" in x or "mega attack" in x: return "hr"
    if "double rare" in x: return "dr"
    if x in("rare holo ex","rare holo gx","rare holo v","rare holo vmax","rare holo vstar","rare holo lv.x","legend","rare break","rare prime","rare prism star","rare holo star","rare ace","ace spec rare","rare shining","amazing rare","radiant rare","shiny rare","classic collection","trainer gallery rare holo"): return "dr" if x in("rare holo ex","rare holo gx","rare holo v","rare holo lv.x","legend","rare break","rare prime","rare prism star","rare holo star","ace spec rare","rare ace","classic collection") else "sh"
    if "ultra" in x or "vmax" in x or "vstar" in x: return "ur"
    if "shiny" in x or "shining" in x or "radiant" in x or "amazing" in x: return "sh"
    if "holo" in x: return "h"
    return "r"
def era(s):
    y=int(s["releaseDate"][:4]); se=s["series"]
    if se in("Base","Gym","Neo","E-Card") or (se=="Other" and y<2003): return "vintage"
    if se in("EX","POP","NP","Diamond & Pearl","Platinum","HeartGold & SoulSilver","Black & White") or (se=="Other" and y<2012): return "classic"
    if se in("XY","Sun & Moon","Sword & Shield") or (se=="Other" and y<2023): return "mid"
    return "modern"
def can_open(s):
    n=s["name"].lower()
    return not any(k in n for k in["promo","mcdonald","trainer kit","jumbo","deck","trainer gallery","galarian gallery","shiny vault"]) and s["total"]>=20
SV_SMALL=("Celebrations","Pokémon GO","Shining Fates","Crown Zenith","Hidden Fates","Detective Pikachu","Dragon Majesty","Champion's Path")
def norm(n):
    n=n.lower().replace("&","and").replace("é","e").replace("—"," ").replace("–"," ").replace(":"," ").replace("-"," ")
    n=re.sub(r"^(sv\d*|swsh\d*(\.\d+)?|sm\d*|xy\d*|bw\d*|dp\d*|hgss\d*|me\d*|mee|pl\d*|ex\d*|sm|xy|bw)\s*[ -]+(?=[a-z])","",n.strip()) if re.match(r"^(sv\d*|swsh\d*|sm\d*|xy\d*|bw\d*|me\d*|sm|xy|bw)\s*[: -]",n) else n
    n=re.sub(r"\b(mega evolution|scarlet and violet|sword and shield|sun and moon)\s+(?=\w)","",n) if False else n
    return re.sub(r"[^a-z0-9]","",n)
def norm2(n):
    n=n.lower().replace("&","and").replace("é","e")
    n=re.sub(r"^[a-z0-9]{1,6}\s*[:\-]\s*","",n)           # SV08: / SM - 
    n=re.sub(r"[^a-z0-9 ]"," ",n)
    for pre in("mega evolution","scarlet and violet","sword and shield","sun and moon","xy","black and white","diamond and pearl","heartgold soulsilver","ex"):
        if n.startswith(pre+" ") and len(n)>len(pre)+3: n=n[len(pre)+1:]
    return re.sub(r"[^a-z0-9]","",n)
setkeys={}
for s in sets:
    setkeys[norm2(s["name"])]=s["id"]
    setkeys.setdefault(re.sub(r"[^a-z0-9]","",s["name"].lower().replace("&","and")),s["id"])
def match_group(g):
    nm=g["name"]
    cands=[norm2(nm),re.sub(r"[^a-z0-9]","",nm.lower().replace("&","and"))]
    for c in cands:
        if c in setkeys: return setkeys[c]
    ab=g.get("abbreviation")
    for s in sets:
        if ab and s.get("ptcgoCode")==ab and difflib.SequenceMatcher(None,norm2(nm),norm2(s["name"])).ratio()>.6: return s["id"]
    best=difflib.get_close_matches(cands[0],list(setkeys),1,.84)
    return setkeys[best[0]] if best else None
ODDS={
 "vintage":{"slots":[{"n":1,"t":{"h":.34,"r":.66}},{"n":3,"t":{"u":1}},{"n":6,"t":{"c":1}},{"n":1,"t":{"e":1,"c":.0}}]},
 "classic":{"slots":[{"n":1,"t":{"r":.52,"h":.30,"dr":.10,"ur":.045,"hr":.02,"sh":.015}},{"n":3,"t":{"u":1}},{"n":4,"t":{"c":1}},{"n":1,"t":{"rev":1}},{"n":1,"t":{"e":1}}]},
 "mid":{"slots":[{"n":1,"t":{"r":.46,"h":.28,"dr":.14,"ur":.07,"hr":.025,"sh":.025}},{"n":3,"t":{"u":1}},{"n":4,"t":{"c":1}},{"n":1,"t":{"rev":1}},{"n":1,"t":{"e":.7,"c":.3}}]},
 "modern":{"slots":[{"n":1,"t":{"r":.55,"dr":.17,"ur":.055,"sir":.012,"hr":.012,"h":.17,"ir":.0,"sh":.005}},{"n":3,"t":{"u":1}},{"n":4,"t":{"c":1}},{"n":1,"t":{"rev":.80,"ir":.15,"sir":.0,"sh":.05}},{"n":1,"t":{"e":1}}]},
}
SRC="Era-template estimate from community aggregate pull-rate research (not official Pokemon Company data). Editable in data/odds.json."
out_sets=[];odds={}
for s in sets:
    cf=f"{RAW}/cards_{s['id']}.json"
    if not os.path.exists(cf): continue
    raw=json.load(open(cf))
    cards=[]
    for c in raw:
        im=c.get("images",{}).get("small","")
        tp=(c.get("tcgplayer") or {}).get("prices") or {}
        pref=["normal","holofoil","1stEditionHolofoil","1stEditionNormal","unlimitedHolofoil","unlimitedNormal","reverseHolofoil","1stEdition"]
        p=v=None
        for k in pref+list(tp.keys()):
            if k in tp and tp[k].get("market"):
                p=tp[k]["market"];v=k;break
        # if holo-type variants exist and also reverse, price "normal/holofoil" first
        pr=tp.get("reverseHolofoil",{}).get("market") if "reverseHolofoil" in tp else None
        t=tier(c.get("rarity"),c["supertype"])
        row={"n":c["name"],"c":c["number"],"r":c.get("rarity") or "None","t":t,"s":c["supertype"][0]}
        if p: row["p"]=round(p,2);row["v"]=v;row["u"]=(c.get("tcgplayer") or {}).get("updatedAt","")
        if pr: row["pr"]=round(pr,2)
        if c.get("subtypes"): row["st"]=c["subtypes"][:3]
        if c.get("types"): row["ty"]=c["types"][0]
        exp=f"https://images.pokemontcg.io/{s['id']}/{c['number']}.png"
        if im!=exp: row["im"]=im
        cards.append(row)
    json.dump(cards,open(f"{OUT}/cards/{s['id']}.json","w"),separators=(",",":"))
    e=era(s); op=can_open(s)
    tiers={}
    for r in cards: tiers[r["t"]]=tiers.get(r["t"],0)+1
    size=11 if e=="vintage" else 10
    out_sets.append({"id":s["id"],"name":s["name"],"series":s["series"],"rel":s["releaseDate"].replace("/","-"),"total":s["total"],"printed":s.get("printedTotal",s["total"]),"ptcgo":s.get("ptcgoCode"),"era":e,"open":op,"packSize":size,"tiers":tiers,"symbolUrl":s["images"]["symbol"],"logoUrl":s["images"]["logo"]})
    if op: odds[s["id"]]={"source":SRC,"era":e,"slots":ODDS[e]["slots"]}
out_sets.sort(key=lambda s:s["rel"])
sid={s["id"] for s in out_sets}
# sealed
def ptype(n):
    l=n.lower()
    if any(k in l for k in["case","code card","display","set of","sleeved booster pack art","art bundle","(sam's","sam's club","(costco","(bundle"]) and "booster box" not in l: return None
    if "booster bundle" in l: return "bundle"
    if "elite trainer box" in l: return "etb"
    if "booster box" in l or "booster display box" in l: return "box"
    if "build & battle" in l or "build and battle" in l: return "bb"
    if re.search(r"booster pack$",l) or l.endswith("sleeved booster pack"): return "pack"
    if "mini tin" in l: return "minitin"
    if "tin" in l.split() or "tin]" in l or " tin " in l or l.endswith(" tin"): return "tin"
    if "blister" in l: return "blister"
    if any(k in l for k in["collection","box","bundle","deck","battle","chest","calendar","pouch","binder","figure","stadium","tournament","kit"]): return "collection"
    return None
PACKS={"pack":1,"bundle":6,"etb":9,"box":36,"bb":4,"minitin":2,"tin":4,"blister":3,"collection":None}
sealed=[];unmatched=set()
for r in sealed_all:
    g=r["group"];sidm=match_group(g)
    for p in r["products"]:
        t=ptype(p["name"])
        if not t or p["market"] is None: continue
        l=p["name"].lower()
        pk=PACKS[t]
        if t=="blister":
            m=re.search(r"(\d)[- ]pack",l); pk=int(m.group(1)) if m else 3
        if "pokemon center" in l and t=="etb": pk=11
        if t=="collection":
            m=re.search(r"(\d+) (booster )?packs?",l); pk=int(m.group(1)) if m else (4 if any(k in l for k in["ex box","premium","collection box","ultra"]) else 0)
            if any(k in l for k in["poster"]): pk=3
            if any(k in l for k in["binder"]): pk=5
            if "ultra-premium" in l or "ultra premium" in l: pk=16
            if any(k in l for k in["pin","figure","calendar","pouch","stadium","deck","kit","sticker"]) and "poster" not in l: pk=0 if "calendar" not in l else 24
        if sidm is None: pk=0 if t!="pack" else 0
        if t in("tin",) and "mini" in l: t="minitin";pk=2
        sealed.append({"id":p["id"],"n":p["name"],"set":sidm,"grp":g["name"],"pub":g["publishedOn"][:10],"t":t,"packs":pk or 0,"m":round(p["market"],2),"lo":p["low"],"exc":bool(re.search(r"exclusive|pokemon center|costco|walmart|target|gamestop|best buy|sam's|dollar general|barnes|amazon",l))})
        if sidm is None: unmatched.add(g["name"])
json.dump(out_sets,open(OUT+"/sets.json","w"),separators=(",",":"))
json.dump(odds,open(OUT+"/odds.json","w"),indent=0)
json.dump(sealed,open(OUT+"/sealed.json","w"),separators=(",",":"))
print("sets",len(out_sets),"cards",sum(sum(s["tiers"].values()) for s in out_sets),"sealed",len(sealed),"unmatched groups",len(unmatched))
print(sorted(unmatched)[:40])
json.dump({"sets":len(out_sets)},open(OUT+"/_stamp.json","w"))
if "--img" in sys.argv:
    def dl(a):
        u,fn=a
        if os.path.exists(fn) and os.path.getsize(fn)>200: return
        for i in range(3):
            try: open(fn,"wb").write(urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"pokesim"}),timeout=30).read()); return
            except Exception: pass
    jobs=[]
    for s in out_sets:
        jobs.append((s["logoUrl"],f"{IMG}/sets/{s['id']}_logo.png"));jobs.append((s["symbolUrl"],f"{IMG}/sets/{s['id']}_symbol.png"))
    for p in sealed: jobs.append((f"https://tcgplayer-cdn.tcgplayer.com/product/{p['id']}_200w.jpg",f"{IMG}/sealed/{p['id']}.jpg"))
    with ThreadPoolExecutor(16) as ex: list(ex.map(dl,jobs))
    print("images done",len(jobs))
