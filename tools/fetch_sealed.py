import json,urllib.request,time
from concurrent.futures import ThreadPoolExecutor
def get(u):
    for i in range(5):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"pokesim"}),timeout=60))
        except Exception as e: time.sleep(2+i*2)
    return {"results":[]}
groups=get("https://tcgcsv.com/tcgplayer/3/groups")["results"]
def one(g):
    gid=g["groupId"]
    pr=get(f"https://tcgcsv.com/tcgplayer/3/{gid}/products")["results"]
    pc=get(f"https://tcgcsv.com/tcgplayer/3/{gid}/prices")["results"]
    price={}
    for p in pc:
        if p.get("marketPrice") is not None: price.setdefault(p["productId"],p)
    out=[]
    for p in pr:
        if any(e["name"]=="Number" for e in p.get("extendedData",[])): continue
        pp=price.get(p["productId"])
        out.append({"id":p["productId"],"name":p["name"],"img":p["imageUrl"],"market":pp["marketPrice"] if pp else None,"low":pp["lowPrice"] if pp else None})
    return {"group":g,"products":out}
with ThreadPoolExecutor(8) as ex: res=list(ex.map(one,groups))
json.dump(res,open("../data_raw/sealed_all.json","w"))
print(len(res),sum(len(r["products"]) for r in res))
