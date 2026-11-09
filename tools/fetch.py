import json,urllib.request,time,os,sys
H={"User-Agent":"pokesim-data/1.0"}
def get(u):
    for i in range(40):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(u,headers=H),timeout=120))
        except Exception as e:
            print("retry",u[-60:],e,flush=True);time.sleep(min(30,3+i*2))
    raise SystemExit("fail "+u)
out="../data_raw"
sets=json.load(open(out+"/sets.json"))
print(len(sets),"sets",flush=True)
W=int(sys.argv[1]);N=int(sys.argv[2])
for i,s in enumerate(sets):
    if i%N!=W: continue
    fn=f"{out}/cards_{s['id']}.json"
    if os.path.exists(fn): continue
    cards=[];p=1
    while True:
        r=get(f"https://api.pokemontcg.io/v2/cards?q=set.id:{s['id']}&pageSize=60&page={p}&select=id,name,number,rarity,supertype,subtypes,types,artist,images,tcgplayer,nationalPokedexNumbers")
        cards+=r["data"]
        if len(cards)>=r["totalCount"] or not r["data"]: break
        p+=1
    json.dump(cards,open(fn,"w"))
    print(s["id"],len(cards),flush=True)
print("DONE")
