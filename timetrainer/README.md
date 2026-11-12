# ⏳ TimeTrainer

Picture-based training for **TimeGuessr** (1900–today), made for practising 2v2 ranked with a teammate.

## Modes

| Mode | What you see | What you answer |
|---|---|---|
| 🚗 Cars | Photo of a car model (155 models, 1901–2024, incl. Eastern Bloc, Latin America, India) | Launch year (slider) or model name (4 choices) |
| 👗 Outfits | Photos from the Wikipedia *fashion by decade* articles | Year (slider) |
| 🔤 Languages | Street signs in 54 languages: Spain vs Latin America, Portugal vs Brazil, Nordic, Baltic, Cyrillic, Central/Eastern Europe, East/South/Southeast Asia, Middle East | Language (4 choices from the same family) |
| 🚘 Plates | Current and historic plates for 59 countries | Country (4 choices from the same region) |
| 🥤 Logos | Historic logo files (Coca-Cola, Pepsi, Shell, BP, VW, Apple, Nokia, …) | Years the design was in use (slider) |
| 🏆 Gauntlet | Mix of all of the above | — |

* **Learn galleries:** every mode has a browsable gallery with the tells.
* **Cheat sheets:** every mode has a sheet of its most important tells, viewable on the site and downloadable as CSV.
  Everything is also in [`TimeTrainer_Cheatsheets.xlsx`](TimeTrainer_Cheatsheets.xlsx) (one sheet per mode).
* **Era tells:** baseline clues for any photo (photo quality, phones, streetlights, landmarks, events).
* **Weak spots:** items you miss come back more often (stored in your browser).
* **Challenge links:** press *Challenge link* and send it to your teammate. You both get the same rounds; compare scores with *Copy result*.
* **Queue tips:** TimeGuessr shows community tips while you queue, but only to logged-in players.
  The *Queue tips* page has a small console script to export them from your own logged-in browser,
  then imports them, sorts them by topic and lets you tick them off.

## Run it

It's a static site with no build step. Either open `index.html` directly, or serve the folder:

```bash
cd timetrainer && python3 -m http.server 8000
```

then open <http://localhost:8000>. It also works on GitHub Pages.

Images are loaded live from Wikipedia / Wikimedia Commons the first time you open a mode, then cached in
your browser. If nothing loads, check that an ad/privacy blocker isn't blocking `wikipedia.org`.

## Editing content

All content is in `data/*.json` (`cars`, `outfits`, `languages`, `plates`, `logos`, `general`, `tips`).
After editing, rebuild the bundle and the Excel file:

```bash
python3 tools/build_data.py
```

```bash
python3 tools/build_xlsx.py
```

Optional: `python3 tools/build_data.py --fetch` pre-resolves all image URLs into `data/images.json`
so the site doesn't have to look them up in the browser. Wikimedia rate-limits shared cloud IPs, so run it from your own machine.

To share imported queue tips with your teammate: export them on the Queue tips page, save the file as
`data/tips.json`, and rebuild.

Unofficial fan project, not affiliated with TimeGuessr. Images belong to their Wikimedia Commons authors; every quiz answer links to the file page with its licence.
