#!/usr/bin/env python3
"""Build TimeTrainer_Cheatsheets.xlsx (one sheet per mode) from the data JSON files.

    python3 tools/build_xlsx.py
"""
import json, os
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = {m: json.load(open(os.path.join(ROOT, "data", m + ".json"), encoding="utf-8"))
     for m in ["cars", "outfits", "languages", "plates", "logos", "general"]}
tips_path = os.path.join(ROOT, "data", "tips.json")
TIPS = json.load(open(tips_path, encoding="utf-8")) if os.path.exists(tips_path) else []

HEAD = PatternFill("solid", fgColor="E8A33D")
TITLE = Font(bold=True, size=14)
BOLD = Font(bold=True)
WRAP = Alignment(wrap_text=True, vertical="top")


def tip_text(t):
    if isinstance(t, str):
        return t
    for k in ("text", "tip", "content", "body", "message", "en"):
        if isinstance(t.get(k), str) and t[k].strip():
            return t[k]
    return json.dumps(t, ensure_ascii=False)


def add_sheet(wb, name, about, tables, widths):
    ws = wb.create_sheet(name)
    r = 1
    ws.cell(r, 1, name).font = TITLE
    r += 1
    if about:
        ws.cell(r, 1, about).alignment = Alignment(wrap_text=False)
        r += 2
    for title, cols, rows in tables:
        ws.cell(r, 1, title).font = Font(bold=True, size=12)
        r += 1
        for c, h in enumerate(cols, 1):
            cell = ws.cell(r, c, h)
            cell.font = BOLD
            cell.fill = HEAD
        if ws.freeze_panes is None:
            ws.freeze_panes = ws.cell(r + 1, 1)
        r += 1
        for row in rows:
            for c, v in enumerate(row, 1):
                ws.cell(r, c, v).alignment = WRAP
            r += 1
        r += 1
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


def main():
    wb = Workbook()
    wb.remove(wb.active)
    g, c, o, l, p, lg = D["general"], D["cars"], D["outfits"], D["languages"], D["plates"], D["logos"]
    add_sheet(wb, "Era tells", g["about"], [
        ("Era tells", ["Category", "Clue", "Period"], g["sheet"]),
        ("Baseline strategy", ["#", "Tip"], [[i + 1, t] for i, t in enumerate(g["baseline_tips"])]),
        ("Dating clues from brands & objects", ["Clue", "Year", "Note"], lg["sheet_extra"]),
    ], [16, 80, 30])
    add_sheet(wb, "Cars", c["about"], [
        ("Car shapes by era", ["Era", "What to look for", "Typical models"], c["sheet"]),
        ("Model list", ["Model", "From", "To", "Region", "Tell"],
         [[x["n"], x["f"], x["t"] if x["t"] else "today", x["r"], x["tell"]] for x in sorted(c["items"], key=lambda x: x["f"])]),
    ], [32, 70, 45, 8, 60])
    add_sheet(wb, "Outfits", o["about"], [("Fashion by decade", ["Decade", "Women", "Men", "Quick tell"], o["sheet"])], [10, 60, 60, 40])
    add_sheet(wb, "Languages", l["about"], [("Languages & scripts", ["Language", "Script", "Unique letters", "Giveaway words", "Don't confuse with"],
                                            [[x["n"], x["script"], x["uniq"], x["words"], x["vs"]] for x in l["items"]])], [24, 20, 32, 50, 60])
    add_sheet(wb, "Plates", p["about"], [("License plates", ["Country", "Region", "Current format", "Tells & history"],
                                         [[x["c"], x["g"], x["now"], x["tell"]] for x in p["items"]])], [18, 18, 40, 90])
    add_sheet(wb, "Logos", lg["about"], [
        ("Logo changes", ["Brand", "Year", "Change"], [[b["b"], y, t] for b in lg["brands"] for y, t in b["timeline"]]),
        ("Other dating clues", ["Clue", "Year", "Note"], lg["sheet_extra"]),
    ], [26, 8, 90])
    add_sheet(wb, "Queue tips", "Tips shown by TimeGuessr while queueing (import them on the Queue tips page, save as data/tips.json, rebuild).",
              [("Queue tips", ["Tip"], [[tip_text(t)] for t in TIPS] or [["(none imported yet)"]])], [120])
    out = os.path.join(ROOT, "TimeTrainer_Cheatsheets.xlsx")
    wb.save(out)
    print("wrote", out)


if __name__ == "__main__":
    main()
