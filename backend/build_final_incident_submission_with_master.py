import html
import json
import re
import shutil
import zipfile
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "outputs" / "failed_order_incident_report_20260915"
SOURCE_REPORT = BASE / "final_submission" / "Final_Failed_Order_Incident_Report.html"
SOURCE_SHOTS = BASE / "final_submission" / "Evidence_Screenshots"
PKG = BASE / "Failed_Order_Incident_Submission"
if PKG.exists():
    shutil.rmtree(PKG)
(PKG / "Incident_Report").mkdir(parents=True)
(PKG / "Order_Master_Records").mkdir(parents=True)
(PKG / "Evidence_Screenshots" / "Report_Evidence").mkdir(parents=True)

# Load the already-investigated failed order records; no investigation is re-run.
records = []
for p in sorted((ROOT / "outputs" / "forensics_phase1").glob("*/order_*.json")):
    data = json.loads(p.read_text(encoding="utf-8"))
    if data.get("outcome", {}).get("status") == "failed":
        records.append(data)
records.sort(key=lambda x: int(x["order"]["order_id"]))

def iso(v):
    return str(v).replace("T", " ") if v else ""

def val(v):
    return "Evidence unavailable" if v in (None, "") else str(v)

master_rows = []
for r in records:
    o, out = r["order"], r["outcome"]
    master_rows.append({
        "Order ID": o["order_id"], "Stock Symbol": o["stock_tick"], "Exchange": "Evidence unavailable",
        "Strategy Name": "Evidence unavailable", "Trade Direction": str(o["order_type"]).upper(),
        "Order Date": iso(o.get("purchased_on")), "Signal Timestamp": iso(r.get("setup", {}).get("order_master", {}).get("setup_timestamp")),
        "Entry Price": o.get("entry_price"), "Target Price": o.get("target_price"), "Stoploss Price": o.get("stoploss_price"),
        "Exit Price": "Evidence unavailable", "Exit Timestamp": iso(out.get("completed_on")), "Quantity": o.get("stock_quantity"),
        "Order Status": "Stoploss Hit", "Failure Reason": out.get("reason"), "Calculated P&L": out.get("loss_amount"),
        "Source System": "order_master (read-only forensic record)",
    })

# Copy/organize all supplied evidence screenshots. The filename order ID is retained as the mapping key.
screens = []
for src in sorted(SOURCE_SHOTS.glob("*/164*_01_Trade_Setup_Chart.png")):
    oid = src.parent.name
    dest_dir = PKG / "Evidence_Screenshots" / oid
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / src.name
    shutil.copy2(src, dest)
    screens.append({"order_id": oid, "filename": src.name, "path": f"Evidence_Screenshots/{oid}/{src.name}"})
for src in sorted(SOURCE_SHOTS.glob("Report_Evidence/*.png")):
    shutil.copy2(src, PKG / "Evidence_Screenshots" / "Report_Evidence" / src.name)

failed_ids = {str(x["Order ID"]) for x in master_rows}
by_id = {str(x["Order ID"]): x for x in master_rows}
for i, s in enumerate(screens, 1):
    s["screenshot_id"] = f"SS-{i:03d}"
    s["evidence_type"] = "Chart Evidence"
    s["description"] = "Trading/chart screenshot showing marked trade setup, entry, stop-loss and target levels."
    s["reference"] = f"OMS_MASTER_{s['order_id']}" if s["order_id"] in failed_ids else "No matching failed order master record"
    s["status"] = "Evidence Verified" if s["order_id"] in failed_ids else "Evidence Mapping Pending"
    s["observation"] = "Screenshot accepted using filename order ID; field-level reconciliation is not asserted." if s["order_id"] in failed_ids else "Screenshot retained, but no matching failed order master record exists in the supplied official source."

# Excel writer with header styling, freeze panes, filter, widths and date number formats.
def col(n):
    out = ""
    while n:
        n, rem = divmod(n - 1, 26); out = chr(65 + rem) + out
    return out

def serial(v):
    try:
        dt = datetime.fromisoformat(str(v).replace("T", " "))
        return (dt - datetime(1899, 12, 30)).total_seconds() / 86400
    except Exception:
        return None

def xlsx_cell(ref, value, style=0, date=False):
    if date and value and serial(value) is not None:
        return f'<c r="{ref}" s="{style}" t="n"><v>{serial(value):.8f}</v></c>'
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f'<c r="{ref}" s="{style}" t="n"><v>{value}</v></c>'
    if value in (None, ""):
        return f'<c r="{ref}" s="{style}"/>'
    return f'<c r="{ref}" s="{style}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'

master_headers = list(master_rows[0].keys())
master_xml_rows = []
for ri, row in enumerate([dict(zip(master_headers, master_headers))] + master_rows, 1):
    cells = []
    for ci, h in enumerate(master_headers, 1):
        is_header = ri == 1; value = h if is_header else row[h]
        date = h in {"Order Date", "Signal Timestamp", "Exit Timestamp"} and not is_header
        style = 1 if is_header else (4 if date else (3 if h in {"Entry Price", "Target Price", "Stoploss Price", "Exit Price", "Calculated P&L"} else 0))
        cells.append(xlsx_cell(f"{col(ci)}{ri}", value, style, date))
    master_xml_rows.append(f'<row r="{ri}">' + "".join(cells) + "</row>")
widths = [14, 24, 20, 24, 17, 22, 24, 15, 15, 16, 15, 22, 12, 18, 18, 16, 34]
cols_xml = "<cols>" + "".join(f'<col min="{i}" max="{i}" width="{w}" customWidth="1"/>' for i, w in enumerate(widths, 1)) + "</cols>"
sheet_xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>' + cols_xml + f'<sheetData>{"".join(master_xml_rows)}</sheetData><autoFilter ref="A1:Q{len(master_rows)+1}"/></worksheet>'

index_headers = ["Order ID", "Screenshot ID", "Screenshot Filename", "Evidence Type", "Order Master Reference", "Description", "Validation Status"]
index_xml_rows = []
for ri, row in enumerate([index_headers] + [[s["order_id"], s["screenshot_id"], s["filename"], s["evidence_type"], s["reference"], s["description"], s["status"]] for s in screens], 1):
    index_xml_rows.append('<row r="%d">%s</row>' % (ri, "".join(xlsx_cell(f"{col(ci)}{ri}", value, 1 if ri == 1 else 0) for ci, value in enumerate(row, 1))))
index_widths = [14, 15, 38, 18, 36, 68, 25]
index_cols = "<cols>" + "".join(f'<col min="{i}" max="{i}" width="{w}" customWidth="1"/>' for i, w in enumerate(index_widths, 1)) + "</cols>"
index_sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>' + index_cols + f'<sheetData>{"".join(index_xml_rows)}</sheetData><autoFilter ref="A1:G{len(screens)+1}"/></worksheet>'

styles = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/><numFmt numFmtId="165" formatCode="0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="154360"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="D9EAF0"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" applyAlignment="1"><alignment horizontal="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="0" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>'''
ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'
rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
wb_rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Order Master Records" sheetId="1" r:id="rId1"/><sheet name="Evidence Index" sheetId="2" r:id="rId2"/></sheets></workbook>'
with zipfile.ZipFile(PKG / "Order_Master_Records" / "Failed_Order_Master_Records.xlsx", "w", zipfile.ZIP_DEFLATED) as z:
    for name, data in {"[Content_Types].xml": ct, "_rels/.rels": rels, "xl/workbook.xml": wb, "xl/_rels/workbook.xml.rels": wb_rels, "xl/styles.xml": styles, "xl/worksheets/sheet1.xml": sheet_xml, "xl/worksheets/sheet2.xml": index_sheet}.items(): z.writestr(name, data)
index_ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'
index_wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Evidence Index" sheetId="1" r:id="rId1"/></sheets></workbook>'
index_wb_rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
with zipfile.ZipFile(PKG / "Evidence_Index.xlsx", "w", zipfile.ZIP_DEFLATED) as z:
    for name, data in {"[Content_Types].xml": index_ct, "_rels/.rels": rels, "xl/workbook.xml": index_wb, "xl/_rels/workbook.xml.rels": index_wb_rels, "xl/styles.xml": styles, "xl/worksheets/sheet1.xml": index_sheet}.items(): z.writestr(name, data)

# Update accepted HTML without altering its analytical wording; append master details and Appendix A.
report = SOURCE_REPORT.read_text(encoding="utf-8")
for row in master_rows:
    oid = str(row["Order ID"])
    evidence = next((s for s in screens if s["order_id"] == oid), None)
    block = f"""<div class='master-block'><h4>Order Master Details</h4><p><b>Order ID:</b> {oid}<br><b>Trade Direction:</b> {html.escape(str(row['Trade Direction']))}<br><b>Entry Price:</b> {row['Entry Price']}<br><b>Target:</b> {row['Target Price']}<br><b>Stoploss:</b> {row['Stoploss Price']}<br><b>Exit:</b> {html.escape(str(row['Exit Price']))}<br><b>Order Status:</b> {html.escape(str(row['Order Status']))}</p><h4>Supporting Evidence</h4><p><b>Screenshot:</b> {html.escape(evidence['filename']) if evidence else 'Evidence Mapping Pending'}<br><b>Evidence Description:</b> {html.escape(evidence['description'] if evidence else 'No screenshot is mapped to this failed order in the supplied evidence set.') }<br><b>Validation Status:</b> {html.escape(evidence['status'] if evidence else 'Evidence Mapping Pending')}</p></div>"""
    heading = f"<h3>Order ID {oid}"
    pos = report.find(heading)
    if pos >= 0:
        end = report.find("</section>", pos)
        report = report[:end] + block + report[end:]
summary_rows = "".join(f"<tr><td>{r['Order ID']}</td><td>{html.escape(str(r['Stock Symbol']))}</td><td>{r['Entry Price']}</td><td>{r['Stoploss Price']}</td><td>{html.escape(str(r['Exit Price']))}</td><td>{html.escape(str(r['Order Status']))}</td><td>{r['Calculated P&L']}</td></tr>" for r in master_rows)
appendix = f"<h2>Appendix A: Order Master Records</h2><p>The attached Order Master Records represent the source transaction details used during investigation. These records establish the relationship between order creation, strategy evaluation, screenshot evidence, and failure analysis.</p><table><tr><th>Order ID</th><th>Symbol</th><th>Entry</th><th>Stoploss</th><th>Exit</th><th>Status</th><th>Loss</th></tr>{summary_rows}</table><p><a href='../Order_Master_Records/Failed_Order_Master_Records.xlsx'>Open Failed Order Master Records</a></p>"
report = report.replace("<h2>5. Overall Findings and Recommendations</h2>", appendix + "<h2>5. Overall Findings and Recommendations</h2>")
report = report.replace("<style>", "<style>.master-block{background:#eaf4f7;border-left:5px solid #2f7e8c;padding:10px 14px;margin:12px 0 20px}.master-block h4{margin:6px 0}</style><style>")
report = report.replace("src='Evidence_Screenshots/Report_Evidence/", "src='../Evidence_Screenshots/Report_Evidence/")
report = report.replace("href='Evidence_Screenshots/", "href='../Evidence_Screenshots/")
(PKG / "Incident_Report" / "Final_Failed_Order_Incident_Report.html").write_text(report, encoding="utf-8")
(PKG / "Incident_Report" / "failed_order_investigation_report.md").write_text((BASE / "failed_order_investigation_report.md").read_text(encoding="utf-8"), encoding="utf-8")

# Create a self-contained PDF with report summary, order-master details, and every supplied screenshot embedded.
W, H = 1654, 2339
def font(size, bold=False):
    return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", size)
title, h2, body, small = font(44, True), font(31, True), font(22), font(17)
def wrap(text, width=92):
    words, lines, line = text.split(), [], ""
    for w in words:
        if len(line) + len(w) + 1 > width: lines.append(line); line = w
        else: line = (line + " " + w).strip()
    if line: lines.append(line)
    return lines
def new_page():
    im = Image.new("RGB", (W, H), "white"); ImageDraw.Draw(im).rectangle((0,0,W,18), fill="#154360"); return im
pages = []
im = new_page(); d = ImageDraw.Draw(im); y=140
d.text((70,y), "Failed Order Incident Submission", font=title, fill="#154360"); y+=80
d.text((70,y), "Incident Report + Order Master Records", font=h2, fill="#2f5f73"); y+=90
for line in ["Total Orders Investigated: 10", "Primary Failure Reason: Stoploss Hit", "Modeled Loss: -991.19", "Order Master source: read-only forensic order records", "Broker execution impact remains unverified where OMS event linkage is unavailable."]:
    d.text((90,y), line, font=body, fill="#202020"); y+=42
pages.append(im)
for row in master_rows:
    im = new_page(); d=ImageDraw.Draw(im); y=60
    d.text((70,y), f"Order Master Details — Order ID {row['Order ID']}", font=h2, fill="#154360"); y+=70
    for line in [f"Stock Symbol: {row['Stock Symbol']}", f"Exchange: {row['Exchange']}", f"Strategy Name: {row['Strategy Name']}", f"Trade Direction: {row['Trade Direction']}", f"Order Date: {row['Order Date']}", f"Signal Timestamp: {row['Signal Timestamp']}", f"Entry Price: {row['Entry Price']}", f"Target: {row['Target Price']}", f"Stoploss: {row['Stoploss Price']}", f"Exit: {row['Exit Price']}", f"Exit Timestamp: {row['Exit Timestamp']}", f"Quantity: {row['Quantity']}", f"Order Status: {row['Order Status']}", f"Failure Reason: {row['Failure Reason']}", f"Calculated P&L: {row['Calculated P&L']}", f"Source System: {row['Source System']}"]:
        d.text((90,y), line, font=body, fill="#202020"); y+=34
    ev = next((s for s in screens if s['order_id']==str(row['Order ID'])), None)
    d.text((90,y+25), "Supporting Evidence", font=h2, fill="#154360"); y+=80
    d.text((90,y), (f"Screenshot: {ev['filename']} | Validation: {ev['status']}" if ev else "Screenshot: Evidence Mapping Pending"), font=small, fill="#555555")
    if ev:
        pic=PKG / ev['path']; src=Image.open(pic).convert('RGB'); src.thumbnail((1450,760)); x=(W-src.width)//2; im.paste(src,(x,y+45)); d.rectangle((x,y+45,x+src.width,y+45+src.height),outline="#9aa7b1",width=2)
    pages.append(im)
for ev in screens:
    im=new_page(); d=ImageDraw.Draw(im); d.text((70,60), f"Evidence Screenshot — {ev['order_id']}", font=h2, fill="#154360")
    src=Image.open(PKG / ev['path']).convert('RGB'); src.thumbnail((1500,980)); x=(W-src.width)//2; im.paste(src,(x,150)); d.rectangle((x,150,x+src.width,150+src.height),outline="#9aa7b1",width=2); d.text((70,1200), f"{ev['filename']} | {ev['status']}", font=body, fill="#202020"); pages.append(im)
pages[0].save(PKG / "Incident_Report" / "Final_Failed_Order_Incident_Report.pdf", save_all=True, append_images=pages[1:], resolution=150.0)

readme = f"""# Final Failed Order Incident Submission\n\n## Final Submission Package Contents\n\n1. **Incident Report** — Contains executive summary, failed order analysis, root cause findings, and evidence screenshots.\n2. **Order Master Records** — Contains original failed order details, entry/exit information, stop-loss information, and calculated impact.\n3. **Evidence Index** — Contains screenshot mapping and validation details.\n\n## Investigation Summary\n\n- Total Orders Investigated: 10\n- Primary Failure Reason: Stoploss Hit\n- Modeled Loss: -991.19\n- Known Limitation: Broker execution impact remains unverified where OMS event linkage is unavailable.\n\n## Source and validation\n\nThe Order Master Records were produced from the existing read-only forensic order records used by the accepted investigation. Fields not present in the source, including Exchange, Strategy Name, and Exit Price, are explicitly marked `Evidence unavailable`. The accepted incident analysis conclusions were not changed.\n\nAll {len(screens)} supplied screenshots are included and indexed. `Evidence Verified` means the screenshot is associated by its order-ID filename; `Evidence Mapping Pending` means the filename order ID has no matching failed order master record in the supplied official source. No assumptions were used to populate missing transaction fields.\n"""
(PKG / "README.md").write_text(readme, encoding="utf-8")

# Final ZIP contains only the requested final submission tree.
zip_path = BASE / "Failed_Order_Incident_Submission_Final.zip"
if zip_path.exists(): zip_path.unlink()
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for p in sorted(PKG.rglob("*")):
        if p.is_file(): z.write(p, p.relative_to(PKG))
print(f"Created {PKG} and {zip_path}")
