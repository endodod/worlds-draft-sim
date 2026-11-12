#!/usr/bin/env python3
"""Bundle the TimeTrainer data files into data/bundle.js.

    python3 tools/build_data.py            # bundle only (no network)
    python3 tools/build_data.py --fetch    # also pre-resolve Wikipedia/Commons images

Images are always resolved in the browser if they are missing from the bundle,
so --fetch is optional. It just makes first load faster and works offline-ish.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
CACHE = os.path.join(ROOT, "tools", ".cache")
UA = "TimeTrainer/1.0 (personal study tool; python urllib)"
WP = "https://en.wikipedia.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"

MODES = ["cars", "outfits", "languages", "plates", "logos", "general"]


def load(name):
    with open(os.path.join(DATA, name + ".json"), encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------- network
def api(base, params, tries=8):
    params = dict(params, format="json", formatversion="2")
    url = base + "?" + urllib.parse.urlencode(params)
    key = re.sub(r"[^A-Za-z0-9]+", "_", url)[-180:]
    os.makedirs(CACHE, exist_ok=True)
    cp = os.path.join(CACHE, key + ".json")
    if os.path.exists(cp):
        with open(cp, encoding="utf-8") as f:
            return json.load(f)
    delay = 5
    for _ in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read().decode("utf-8"))
            with open(cp, "w", encoding="utf-8") as f:
                json.dump(data, f)
            time.sleep(1.0)
            return data
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = int(e.headers.get("retry-after") or delay)
                print(f"  429, waiting {wait}s", file=sys.stderr)
                time.sleep(wait)
                delay = min(delay * 2, 120)
                continue
            raise
    raise RuntimeError("rate limited: " + url)


def api_all(base, params):
    """Follow 'continue' and merge query.pages."""
    pages, cont = {}, {}
    while True:
        d = api(base, dict(params, **cont))
        for p in d.get("query", {}).get("pages", []):
            pages.setdefault(p["title"], {}).update({k: v for k, v in p.items() if v})
        if "continue" not in d:
            break
        cont = d["continue"]
    return list(pages.values())


YEAR = re.compile(r"(?<!\d)(19\d\d|20[0-2]\d)(?![\ds])")
SKIP = re.compile(r"flag|map|coat.of.arms|wappen|logo|icon|symbol|commons-|wiki|edit-|question|portal|padlock|ambox|crystal|nuvola|loudspeaker|locat|emblem|signature|disambig|text-x|stub|blank|arrow", re.I)


def strip_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()[:220]


def lead_images(titles):
    out = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        d = api(WP, {"action": "query", "prop": "pageimages", "piprop": "thumbnail|name",
                     "pithumbsize": 800, "redirects": 1, "titles": "|".join(chunk)})
        q = d.get("query", {})
        m = {t: t for t in chunk}
        for n in q.get("normalized", []):
            for k, v in m.items():
                if v == n["from"]:
                    m[k] = n["to"]
        for r in q.get("redirects", []):
            for k, v in m.items():
                if v == r["from"]:
                    m[k] = r["to"]
        bypage = {p["title"]: p for p in q.get("pages", [])}
        for t in chunk:
            p = bypage.get(m[t], {})
            if p.get("thumbnail"):
                out[t] = {"src": p["thumbnail"]["source"], "file": p.get("pageimage", ""), "page": p["title"]}
    for t in titles:
        if t not in out:
            print(f"  NO IMAGE: {t}", file=sys.stderr)
    return out


def gallery(title, allow_svg=False):
    pages = api_all(WP, {"action": "query", "generator": "images", "titles": title, "redirects": 1,
                         "gimlimit": 50, "prop": "imageinfo", "iiprop": "url|extmetadata",
                         "iiurlwidth": 800,
                         "iiextmetadatafilter": "ImageDescription|DateTimeOriginal|ObjectName"})
    res = []
    for p in pages:
        name = p["title"]
        ii = (p.get("imageinfo") or [{}])[0]
        if not ii.get("thumburl") or SKIP.search(name):
            continue
        if name.lower().endswith(".svg") and not allow_svg:
            continue
        if name.lower().endswith((".ogg", ".ogv", ".webm", ".mp3", ".pdf", ".tif", ".tiff", ".gif")):
            continue
        em = ii.get("extmetadata", {})
        desc = strip_html(em.get("ImageDescription", {}).get("value"))
        date = strip_html(em.get("DateTimeOriginal", {}).get("value"))
        y = None
        for src in (date, name, desc):
            mm = YEAR.search(src or "")
            if mm:
                y = int(mm.group(1)); break
        res.append({"src": ii["thumburl"], "file": name, "desc": desc, "year": y})
    res.sort(key=lambda x: x["file"])
    return res


def logo_files(cats):
    files = {}
    for c in cats:
        try:
            pages = api_all(COMMONS, {"action": "query", "generator": "categorymembers",
                                      "gcmtitle": "Category:" + c, "gcmtype": "file", "gcmlimit": 50,
                                      "prop": "imageinfo", "iiprop": "url", "iiurlwidth": 400})
        except Exception as e:  # noqa
            print("  ", c, e, file=sys.stderr); continue
        for p in pages:
            ii = (p.get("imageinfo") or [{}])[0]
            ys = [int(y) for y in YEAR.findall(p["title"])]
            if ii.get("thumburl") and ys:
                files[p["title"]] = {"src": ii["thumburl"], "file": p["title"], "from": ys[0], "to": ys[1] if len(ys) > 1 and ys[1] > ys[0] else None}
    return sorted(files.values(), key=lambda x: (x["from"], x["file"]))


def fetch_images(data):
    imgs = {"lead": {}, "gallery": {}, "logos": {}}
    print("cars: lead images", file=sys.stderr)
    imgs["lead"].update(lead_images([c["w"] for c in data["cars"]["items"]]))
    print("plates: galleries", file=sys.stderr)
    for p in data["plates"]["items"]:
        imgs["gallery"][p["w"]] = gallery(p["w"], allow_svg=True)
    print("outfits: galleries", file=sys.stderr)
    for a in data["outfits"]["articles"]:
        imgs["gallery"][a["w"]] = gallery(a["w"])
    print("logos: commons categories", file=sys.stderr)
    for b in data["logos"]["brands"]:
        imgs["logos"][b["b"]] = logo_files(b["cats"])
    return imgs


def main():
    data = {m: load(m) for m in MODES}
    tips_path = os.path.join(DATA, "tips.json")
    data["tips"] = json.load(open(tips_path, encoding="utf-8")) if os.path.exists(tips_path) else []
    img_path = os.path.join(DATA, "images.json")
    if "--fetch" in sys.argv:
        imgs = fetch_images(data)
        with open(img_path, "w", encoding="utf-8") as f:
            json.dump(imgs, f, ensure_ascii=False, indent=0)
    data["images"] = json.load(open(img_path, encoding="utf-8")) if os.path.exists(img_path) else {"lead": {}, "gallery": {}, "logos": {}}
    js = "// Generated by tools/build_data.py. Edit the JSON files, then rebuild.\nwindow.TT_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(os.path.join(DATA, "bundle.js"), "w", encoding="utf-8") as f:
        f.write(js)
    n = data["images"]
    print(f"bundle.js written ({len(js)//1024} KB); pre-resolved: {len(n['lead'])} lead, {len(n['gallery'])} galleries, {len(n['logos'])} logo sets")


if __name__ == "__main__":
    main()
