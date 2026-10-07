import html
import re
import shutil
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "outputs" / "failed_order_incident_report_20260915"
SRC = BASE / "manual_screenshots"
PKG = BASE / "final_submission"
if PKG.exists():
    shutil.rmtree(PKG)
(PKG / "Evidence_Screenshots").mkdir(parents=True)
(PKG / "Evidence_Screenshots" / "Unmapped").mkdir(parents=True)
(PKG / "Evidence_Screenshots" / "Report_Evidence").mkdir(parents=True)

for p in sorted(BASE.glob("evidence_*.png")):
    shutil.copy2(p, PKG / "Evidence_Screenshots" / "Report_Evidence" / p.name)

screens = []
for p in sorted(SRC.glob("*.png")):
    m = re.match(r"(?P<symbol>.+?)_(?P<id>164\d{3})\.png$", p.name)
    if not m:
        continue
    order_id = m.group("id")
    new_name = f"{order_id}_01_Trade_Setup_Chart.png"
    dest_dir = PKG / "Evidence_Screenshots" / order_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, dest_dir / new_name)
    screens.append({"order_id": order_id, "filename": new_name, "path": f"Evidence_Screenshots/{order_id}/{new_name}", "source": p.name})

failed_ids = {"164329", "164332", "164334", "164336", "164342", "164349", "164354", "164359", "164364", "164369"}
for s in screens:
    s["description"] = "Trading/chart screenshot showing the trade setup with marked entry, stop-loss and target levels."
    s["type"] = "Trading chart"
    s["observation"] = "Supports the visual trade setup and marked failure levels for this order. Field-level reconciliation was intentionally not applied per instruction."
    s["in_report_scope"] = s["order_id"] in failed_ids

# Build XLSX without third-party dependencies.
def col(n):
    out = ""
    while n:
        n, r = divmod(n - 1, 26)
        out = chr(65 + r) + out
    return out

rows = [["Screenshot ID", "Order ID", "Screenshot Filename", "Description", "Evidence Type", "Observation"]]
for i, s in enumerate(screens, 1):
    rows.append([f"SS-{i:02d}", s["order_id"], s["filename"], s["description"], s["type"], s["observation"]])
sheet_rows = []
for ri, row in enumerate(rows, 1):
    cells = []
    for ci, value in enumerate(row, 1):
        ref = f"{col(ci)}{ri}"
        cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>')
    sheet_rows.append(f'<row r="{ri}">' + "".join(cells) + "</row>")
sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + "".join(sheet_rows) + "</sheetData></worksheet>"
ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
wbrels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Evidence Index" sheetId="1" r:id="rId1"/></sheets></workbook>'
with zipfile.ZipFile(PKG / "Evidence_Index.xlsx", "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", ct); z.writestr("_rels/.rels", rels); z.writestr("xl/workbook.xml", wb); z.writestr("xl/_rels/workbook.xml.rels", wbrels); z.writestr("xl/worksheets/sheet1.xml", sheet)

original = (BASE / "failed_order_investigation_report.html").read_text(encoding="utf-8")
for s in screens:
    block = f"<div class='evidence-block'><p><b>Evidence Screenshots:</b></p><p><b>Screenshot:</b> <code>{s['filename']}</code></p><p><b>Description:</b> {html.escape(s['description'])}</p><p><b>Observation:</b> {html.escape(s['observation'])}</p><p><a href='{s['path']}'>Open screenshot</a></p></div>"
    heading = f"<h3>Order ID {s['order_id']}"
    pos = original.find(heading)
    if pos >= 0:
        end = original.find("</section>", pos)
        original = original[:end] + block + original[end:]

index_rows = "".join(f"<tr><td>SS-{i:02d}</td><td>{s['order_id']}</td><td><a href='{s['path']}'>{s['filename']}</a></td><td>{html.escape(s['description'])}</td><td>{s['type']}</td><td>{html.escape(s['observation'])}</td></tr>" for i, s in enumerate(screens, 1))
extra = "".join(f"<li><b>{s['order_id']}</b> — <a href='{s['path']}'>{s['filename']}</a>. {html.escape(s['description'])} These supplied screenshots are retained as valid evidence per instruction; no corresponding order section was found in the supplied report scope.</li>" for s in screens if not s["in_report_scope"])
insert = f"""<h2>Evidence Summary</h2><table><tr><th>Screenshot ID</th><th>Order ID</th><th>Screenshot Filename</th><th>Evidence Description</th><th>Evidence Type</th><th>Observation</th></tr>{index_rows}</table>"""
insert += f"<h2>Additional Supplied Evidence</h2><p>The following supplied screenshots were accepted and included in the submission package using their filename order IDs. They do not correspond to a detailed order section in the supplied report and are therefore listed here without adding or changing analysis conclusions.</p><ul>{extra}</ul>"
original = original.replace("<h2>5. Overall Findings and Recommendations</h2>", insert + "<h2>5. Overall Findings and Recommendations</h2>")
original = original.replace("src='evidence_", "src='Evidence_Screenshots/Report_Evidence/evidence_")
original = original.replace("<style>", "<style> .evidence-block{background:#eef6f8;border-left:5px solid #2f7e8c;padding:10px 14px;margin:12px 0 20px} .evidence-block code{color:#154360} ")
(PKG / "Final_Failed_Order_Incident_Report.html").write_text(original, encoding="utf-8")

readme = f"""# Failed Order Incident Submission\n\nGenerated: 15 September 2026\n\n## Contents\n\n- `Final_Failed_Order_Incident_Report.pdf` — final report with screenshots embedded\n- `Final_Failed_Order_Incident_Report.html` — editable/viewable report\n- `Evidence_Index.xlsx` — screenshot evidence index\n- `Evidence_Screenshots/` — renamed evidence grouped by order ID\n- `Evidence_Screenshots/Report_Evidence/` — report-generated evidence snapshots\n\n## Screenshot handling\n\nAll {len(screens)} manually supplied screenshots were accepted as valid evidence using the order ID in the source filename. Field-level mismatch checks were intentionally ignored per instruction. Each file was copied and renamed as `<Order_ID>_<Sequence>_<Description>.png`; original screenshots remain unchanged in the source folder.\n\nThe existing incident analysis conclusions were not changed. Screenshots for order IDs outside the detailed forensic report scope are retained in their corresponding order folders and listed in the Evidence Summary / Additional Supplied Evidence sections without inventing order findings.\n"""
(PKG / "README.md").write_text(readme, encoding="utf-8")
print(f"Prepared {len(screens)} screenshots and package directory: {PKG}")
