# Pokémon TCG Collector & Card Shop Simulator

A desktop game (Tauri 2 + React + TypeScript + Rust/SQLite) for Windows and macOS. Start with $40, work small jobs, buy real-priced packs, open them, sell, buy singles, grade cards, and hunt garage-sale deals. All money is simulated.

## Install
- **Windows:** run the `...x64-setup.exe` from the latest Release. Unsigned: SmartScreen > *More info* > *Run anyway*. Installs per-user, no admin.
- **macOS:** open the universal `.dmg`, drag to Applications. Unsigned: right-click the app > *Open* (or System Settings > Privacy & Security > *Open Anyway*).
- Built by GitHub Actions; **never launched on real Windows/macOS hardware by the author**, only built and unit-tested in CI.

## Features
Shop (Retail at MSRP with limited daily stock, Discontinued, Secondary-market, Specials), animated pack opening, inventory/collection/binder, singles market with daily deals, instant buylist or marketplace listings (12.55% + $0.30 fee), PSA/BGS/CGC grading with turnaround, 4 low-pay jobs, garage sales and private listings with haggling, deterministic market simulation with events, trends charts, achievements, ranks, SQLite autosave, backups, export/import, CSV price import, themes, sound effects and music.

## Data sources and limits
- Cards, art, set logos/symbols, raw prices (TCGplayer snapshot): pokemontcg.io. Sealed products, images, prices: tcgcsv.com (TCGplayer). Snapshot date is shown in Settings; prices go stale.
- Card images load from images.pokemontcg.io (needs internet; browser caches them). Sealed-product images and logos are bundled.
- MSRP: US list prices for current products from published retailer/Pokémon Center data; discontinued items use market price. Older products without a known MSRP have none.
- Pull rates are **estimates** from community aggregate research, not official; editable in `public/data/odds.json`.
- Prices after day 1 are simulated (anchored to the sourced value). Graded prices come from a labeled model unless you import real ones by CSV.
- Some promo groups could not be matched to a set and their products are omitted.

## Music
Tracks are downloaded at runtime from archive.org into the app data `music` folder (Settings > Music), for personal local use; no audio is in this repo. You can also drop your own MP3/OGG/M4A files there. Without any, a chiptune fallback plays.

## Backup / restore
Settings > Saves: backup now, list/restore backups, export to `Documents/PokemonTCGSim`, import. Auto-backup option available. Save file: `savegame.sqlite` in the app data folder.

## Updating data
Settings > Data: refresh from sources, or import CSV (`card_id,price[,company,grade]`), or edit prices manually. To rebuild the bundle: `python3 tools/fetch.py`, `tools/fetch_sealed.py`, `tools/build_data.py --img`.

## Dev
`npm install && npm test && npx tauri dev`. Pokémon and card art are property of their owners; this is a fan project, non-commercial.
