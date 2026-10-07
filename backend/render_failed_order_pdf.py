from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / "outputs" / "failed_order_incident_report_20260915" / "final_submission"
OUT = PKG / "Final_Failed_Order_Incident_Report.pdf"
W, H = 1654, 2339

def f(size, bold=False):
    p = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    return ImageFont.truetype(p, size)

title, h2, body, small = f(48, True), f(32, True), f(24), f(18)
pages = []

def page():
    im = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(im); d.rectangle((0, 0, W, 18), fill="#154360")
    return im, d

def wrap(text, width=88):
    words, lines, line = text.split(), [], ""
    for word in words:
        if len(line) + len(word) + 1 > width:
            lines.append(line); line = word
        else: line = (line + " " + word).strip()
    if line: lines.append(line)
    return lines

im, d = page(); y = 160
d.text((70, y), "Failed Order Investigation", font=title, fill="#154360"); y += 70
d.text((70, y), "and Root Cause Analysis Report", font=title, fill="#154360"); y += 100
d.text((70, y), "Final Submission Package", font=h2, fill="#2f5f73"); y += 80
for line in ["Report date: 15 September 2026", "Scope: 10 failed order records", "Aggregate modeled loss: -991.19", "Severity: HIGH", "Evidence: 12 supplied trading/chart screenshots"]:
    d.text((90, y), line, font=body, fill="#202020"); y += 45
y += 50
d.rounded_rectangle((70, y, W-70, y+220), radius=12, fill="#fff4cc", outline="#d6b656", width=2)
text = "Existing analysis conclusions preserved. All supplied screenshots accepted as valid evidence using the order ID in each source filename; field-level mismatch checks were intentionally ignored per instruction."
for line in wrap(text, 92): d.text((105, y+30), line, font=body, fill="#202020"); y += 35
pages.append(im)

im, d = page(); y = 70
d.text((70, y), "Executive Summary and Overall Findings", font=h2, fill="#154360"); y += 70
paras = [
    "Investigation covered 10 failed records from 2026-08-25 through 2026-09-11. All records show the same evaluator outcome: Stoploss hit after entry during local OHLC evaluation.",
    "The primary confirmed finding is a modeled stop-loss outcome. Broker execution, customer impact, and revenue impact remain subject to reconciliation because OMS order events and signal snapshots are missing or unlinked.",
    "Recommendations remain unchanged: retain immutable setup/signal snapshots; link OMS and broker events; ingest fills; monitor stop-loss clusters; and preserve correlated API and SQL evidence."
]
for para in paras:
    for line in wrap(para, 92): d.text((90, y), line, font=body, fill="#202020"); y += 34
    y += 22
d.text((70, y+30), "Evidence Summary", font=h2, fill="#154360"); y += 100
for line in ["12 screenshots accepted and indexed", "11 additional supplied order IDs retained in order-specific folders", "Evidence type: Trading chart", "See Evidence_Index.xlsx for the full index"]:
    d.text((90, y), "• " + line, font=body, fill="#202020"); y += 42
pages.append(im)

# Detailed order pages: preserve the existing per-order evidence context and add supplied screenshot.
ids = ["164329", "164332", "164334", "164336", "164342", "164349", "164354", "164359", "164364", "164369"]
for oid in ids:
    im, d = page(); y = 70
    d.text((70, y), f"Order ID {oid}", font=h2, fill="#154360"); y += 65
    lines = [
        "Failure category: Application evaluation outcome / modeled stop-loss",
        "Failure message: Stoploss hit",
        "Root cause: local OHLC evaluator recorded a price breach of the configured stop-loss after entry.",
        "API / database / dependency evidence: Evidence unavailable in the supplied records.",
        "Resolution: No remediation is evidenced; reconcile against broker records before closure.",
        "Preventive action: retain immutable signal snapshots, link broker events, and monitor stop-loss clusters.",
        "Evidence screenshot: " + ("164369_01_Trade_Setup_Chart.png" if oid == "164369" else "No supplied screenshot with this report order ID; see Evidence Summary for accepted additional evidence."),
    ]
    for para in lines:
        for line in wrap(para, 92): d.text((90, y), line, font=body, fill="#202020"); y += 34
        y += 10
    if oid == "164369":
        pic = PKG / "Evidence_Screenshots" / oid / "164369_01_Trade_Setup_Chart.png"
        src = Image.open(pic).convert("RGB"); src.thumbnail((1450, 760)); x=(W-src.width)//2
        d.text((90, y+20), "Description: Trading/chart screenshot showing marked BUY setup, entry, stop-loss, and target levels.", font=small, fill="#555555")
        im.paste(src, (x, y+60)); d.rectangle((x, y+60, x+src.width, y+60+src.height), outline="#9aa7b1", width=2)
    pages.append(im)

# All supplied screenshots are embedded as evidence pages.
for p in sorted((PKG / "Evidence_Screenshots").glob("*/164*_01_Trade_Setup_Chart.png")):
    im, d = page(); d.text((70, 65), f"Evidence Screenshot — Order ID {p.parent.name}", font=h2, fill="#154360")
    src = Image.open(p).convert("RGB"); src.thumbnail((1500, 950)); x=(W-src.width)//2
    im.paste(src, (x, 160)); d.rectangle((x, 160, x+src.width, 160+src.height), outline="#9aa7b1", width=2)
    d.text((70, 1160), f"Filename: {p.name}", font=body, fill="#202020")
    d.text((70, 1210), "Description: Trading/chart screenshot showing the trade setup with marked entry, stop-loss and target levels.", font=small, fill="#555555")
    pages.append(im)

pages[0].save(OUT, save_all=True, append_images=pages[1:], resolution=150.0)
print(f"Wrote {OUT} ({len(pages)} pages)")
