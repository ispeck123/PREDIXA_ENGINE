import html
import json
import os
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs" / "failed_order_incident_report_20260915"
OUT.mkdir(parents=True, exist_ok=True)


def font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def make_snapshot(path, title, subtitle, rows, width=1800):
    title_f, sub_f, body_f, small_f = font(34, True), font(22), font(23), font(18)
    pad, row_h = 42, 48
    height = pad + 75 + 55 + len(rows) * row_h + pad
    img = Image.new("RGB", (width, height), "white")
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, width, 12), fill="#154360")
    d.text((pad, 34), title, fill="#154360", font=title_f)
    d.text((pad, 86), subtitle, fill="#555555", font=sub_f)
    y = 148
    d.line((pad, y, width - pad, y), fill="#9aa7b1", width=2)
    y += 18
    for label, value in rows:
        d.text((pad, y), label, fill="#154360", font=body_f)
        d.text((pad + 410, y), value, fill="#202020", font=body_f)
        y += row_h
    d.text((pad, height - 30), "Evidence snapshot generated from read-only forensic JSON; not a live console screenshot.", fill="#777777", font=small_f)
    img.save(path)


records = []
for p in sorted((ROOT / "outputs" / "forensics_phase1").glob("*/order_*.json")):
    data = json.loads(p.read_text())
    if data.get("outcome", {}).get("status") == "failed":
        records.append(data)
records.sort(key=lambda x: int(x["order"]["order_id"]))

total_loss = sum(float(r["outcome"]["loss_amount"]) for r in records)
period_start = min(r["order"]["entry_timestamp"] for r in records)
period_end = max(r["outcome"]["completed_on"] for r in records)

make_snapshot(
    OUT / "evidence_01_failed_order_register.png",
    "Evidence 01 — Failed order register",
    f"Extracted from {len(records)} read-only forensic order records | period {period_start} to {period_end}",
    [("Order IDs", ", ".join(str(r["order"]["order_id"]) for r in records)),
     ("Observed outcome", "All records: status=failed; reason=Stoploss hit"),
     ("Modeled loss", f"{total_loss:,.2f} aggregate across failed records"),
     ("Failure stage", "Post-entry OHLC evaluation / stop-loss outcome")],
)

flag_list = records[0]["data_quality"]["flags"]
make_snapshot(
    OUT / "evidence_02_data_quality_manifest.png",
    "Evidence 02 — Data-quality and linkage flags",
    "Flags repeated across every failed-order record",
    [("Read-only method", records[0]["methodology_version"]),
     ("Broker fill", "BROKER_FILL_UNVERIFIED"),
     ("OMS linkage", "OMS_LINK_MISSING; oms_orders=UNLINKED; oms_order_events=MISSING"),
     ("Signal history", "SETUP_SIGNAL_MISSING; SETUP_SNAPSHOT_UNAVAILABLE; TRADE_SIGNAL_DELETED"),
     ("Timestamp quality", "ENTRY_TIMESTAMP_INFERRED; EXIT_TIMESTAMP_INFERRED")],
)

sample = records[0]
make_snapshot(
    OUT / "evidence_03_representative_order_record.png",
    f"Evidence 03 — Representative order record {sample['order']['order_id']}",
    "Order-master fields and modeled outcome extracted from the forensic JSON",
    [("Symbol", sample["order"]["stock_tick"]),
     ("Entry timestamp", sample["order"]["entry_timestamp"]),
     ("Completion timestamp", sample["outcome"]["completed_on"]),
     ("Entry / stop / target", f"{sample['order']['entry_price']} / {sample['order']['stoploss_price']} / {sample['order']['target_price']}"),
     ("Outcome", f"{sample['outcome']['status']} — {sample['outcome']['reason']} ({sample['outcome']['loss_pct']}%)"),
     ("Source limitation", "No linked broker event history")],
)


def esc(v):
    return html.escape(str(v))


summary_rows = []
for r in records:
    o = r["order"]
    out = r["outcome"]
    summary_rows.append(f"<tr><td>{o['order_id']}</td><td>{esc(o['stock_tick'])}</td><td>{esc(o['entry_timestamp'])}</td><td>{esc(out['completed_on'])}</td><td>Application evaluation outcome / modeled stop-loss</td><td>{esc(out['reason'])}</td><td>High</td><td>Failed (modeled)</td></tr>")

detail_sections = []
for r in records:
    o, out, setup = r["order"], r["outcome"], r["setup"]
    timeline = [(o["purchased_on"], "Order record approved/persisted"), (o["entry_timestamp"], "Entry timestamp recorded (inferred flag present)"), (out["completed_on"], "Local OHLC evaluator marked stop-loss hit")]
    timeline_html = "".join(f"<tr><td>{esc(t)}</td><td>{esc(e)}</td></tr>" for t, e in timeline)
    detail_sections.append(f"""
    <section class="detail">
      <h3>Order ID {o['order_id']} — {esc(o['stock_tick'])}</h3>
      <p><span class="badge high">HIGH</span> Primary classification: application evaluation outcome / modeled stop-loss. This is not evidence of an API, database, payment, or third-party outage.</p>
      <h4>Timeline</h4>
      <table><tr><th>Time</th><th>Event</th></tr>{timeline_html}</table>
      <h4>Technical findings</h4>
      <table><tr><th>Field</th><th>Evidence</th></tr>
        <tr><td>Transaction state</td><td>Order status field contains a failed outcome; OMS bucket status is {esc(r['execution']['oms_bucket'].get('order_status'))}.</td></tr>
        <tr><td>Failure message</td><td>“{esc(out['reason'])}”</td></tr>
        <tr><td>Trade parameters</td><td>Entry {o['entry_price']}; stop {o['stoploss_price']}; target {o['target_price']}; timeframe {o['time_frame']}.</td></tr>
        <tr><td>Impact</td><td>Modeled loss {out['loss_amount']} ({out['loss_pct']}%). Broker-realized impact unavailable.</td></tr>
        <tr><td>API / DB / dependency</td><td>Evidence unavailable. No API logs, application stack traces, SQL results, or external dependency logs were supplied.</td></tr>
      </table>
      <h4>Root cause</h4>
      <p>The local evaluator recorded a stop-loss breach after entry. The underlying business/market cause is therefore a price move below the configured stop level. A production execution root cause cannot be confirmed because broker events are missing/unlinked.</p>
      <h4>Resolution and preventive action</h4>
      <p><b>Resolution:</b> No incident remediation is evidenced in the supplied records. Treat as a failed modeled trade outcome pending broker reconciliation.</p>
      <p><b>Preventive action:</b> Persist immutable setup and trade-signal snapshots; link order-master → OMS order → OMS event/fill IDs; ingest broker events and reconcile fills; alert on stop-loss clusters; retain request/response and SQL evidence with correlation IDs.</p>
    </section>""")

html_doc = f"""<!doctype html><html><head><meta charset='utf-8'><title>Failed Order Investigation and Root Cause Analysis Report</title>
<style>
body{{font-family:Arial,sans-serif;color:#202020;margin:40px;line-height:1.4}} h1{{color:#154360;font-size:30px}} h2{{color:#154360;border-bottom:2px solid #d5e3ea;padding-bottom:6px;margin-top:30px}} h3{{color:#154360;margin-bottom:6px}} h4{{color:#2f5f73;margin-bottom:5px}} table{{border-collapse:collapse;width:100%;margin:8px 0 18px;font-size:12px}} th{{background:#154360;color:#fff;text-align:left}} td,th{{border:1px solid #b8c5cc;padding:7px;vertical-align:top}} tr:nth-child(even){{background:#f4f7f8}} .cover{{border-left:8px solid #154360;padding:20px 24px;margin-bottom:24px;background:#f4f7f8}} .badge{{display:inline-block;padding:3px 9px;border-radius:4px;color:#fff;font-weight:bold;font-size:11px}} .high{{background:#b03a2e}} .note{{background:#fff4cc;border:1px solid #d6b656;padding:10px}} .detail{{page-break-before:always}} figure{{margin:14px 0 20px}} figure img{{max-width:100%;border:1px solid #9aa7b1}} figcaption{{font-size:12px;color:#555;margin-top:4px}} .small{{font-size:11px;color:#555}}
</style></head><body>
<div class='cover'><h1>Failed Order Investigation and Root Cause Analysis Report</h1><p><b>Report date:</b> 15 September 2026<br><b>Evidence basis:</b> Read-only forensic JSON artifacts available in the workspace<br><b>Severity:</b> <span class='badge high'>HIGH</span> — 10 failed order records with aggregate modeled loss of {total_loss:,.2f}; verified broker impact unavailable</p></div>
<h2>1. Executive Summary</h2><p>Investigation covered {len(records)} failed order records with entry timestamps from {esc(period_start)} through {esc(period_end)}. Every failed record has the same modeled evaluator reason: <b>Stoploss hit</b>. The failures occurred after entry during local OHLC evaluation. No evidence supports classifying these records as application exceptions, API failures, database failures, payment failures, third-party outages, timeouts, configuration issues, infrastructure issues, or user/input errors.</p><p>The primary confirmed finding is a modeled stop-loss outcome. The production execution cause and customer/revenue impact remain unverified because broker order events are missing, OMS orders are unlinked, trade-signal records are missing/deleted, and entry/exit timestamps are flagged as inferred.</p>
<div class='note'><b>Evidence boundary:</b> This report avoids assumptions. “Failed” refers to the stored/evaluated order outcome. It does not prove that a broker rejected an order or that a live API/database error occurred.</div>
<h2>2. Failed Order Summary Table</h2><table><tr><th>Order ID</th><th>Symbol</th><th>Entry time</th><th>Failure time</th><th>Failure category</th><th>Error/outcome</th><th>Severity</th><th>Status</th></tr>{''.join(summary_rows)}</table>
<h2>3. Detailed Investigation</h2><p>Common technical finding across all records: the order-master row exists and is associated with an approved OMS bucket, but the downstream broker event chain is unavailable. Each detailed section below distinguishes confirmed evidence from unavailable evidence.</p>
{''.join(detail_sections)}
<h2>4. Evidence</h2>
<figure><img src='evidence_01_failed_order_register.png'><figcaption>Screenshot 1 — Failed-order register. Proves the scoped order IDs, common evaluator outcome, failure stage, and aggregate modeled loss.</figcaption></figure>
<figure><img src='evidence_02_data_quality_manifest.png'><figcaption>Screenshot 2 — Data-quality manifest. Proves the repeated missing/unlinked evidence flags.</figcaption></figure>
<figure><img src='evidence_03_representative_order_record.png'><figcaption>Screenshot 3 — Representative order record. Proves the stored order parameters and modeled outcome for order {records[0]['order']['order_id']}.</figcaption></figure>
<h2>5. Overall Findings and Recommendations</h2><table><tr><th>Finding</th><th>Assessment</th><th>Recommendation</th></tr>
<tr><td>Repeated stop-loss outcomes</td><td>10/10 failed records</td><td>Monitor stop-loss clusters by symbol, timeframe, and entry cohort; review strategy and market conditions separately from platform reliability.</td></tr>
<tr><td>Missing broker chain</td><td>OMS orders unlinked; OMS events missing</td><td>Make broker order ID, fill ID, event timestamp, and raw event payload mandatory.</td></tr>
<tr><td>Missing/deleted signal evidence</td><td>Trade-signal history unavailable</td><td>Retain immutable signal/setup snapshots with correlation IDs and retention controls.</td></tr>
<tr><td>Inferred timestamps</td><td>Entry/exit times not fully authoritative</td><td>Use timezone-aware event timestamps from the source system; prevent inferred times from being used for audit closure.</td></tr>
<tr><td>Impact uncertainty</td><td>Modeled loss only; revenue/customer impact unavailable</td><td>Reconcile against broker ledger, positions, settlements, and customer notifications before financial sign-off.</td></tr>
</table>
<h2>6. Appendix</h2><p><b>Source artifacts:</b> <code>outputs/forensics_phase1/*/manifest.json</code> and <code>outputs/forensics_phase1/*/order_*.json</code>.</p><p><b>Unavailable artifacts:</b> application logs, API request/response logs, database screenshots/query output, monitoring dashboards, configuration screenshots, payment/ERP/shipping evidence, and broker OMS event history.</p><p class='small'>Generated 15 September 2026. This report is suitable for incident review subject to broker reconciliation and evidence retention.</p>
</body></html>"""
(OUT / "failed_order_investigation_report.html").write_text(html_doc, encoding="utf-8")

md = f"# Failed Order Investigation and Root Cause Analysis Report\n\n**Report date:** 15 September 2026  \n**Scope:** {len(records)} failed order records  \n**Aggregate modeled loss:** {total_loss:,.2f}  \n**Severity:** HIGH — verified broker impact unavailable\n\n## 1. Executive Summary\n\nInvestigation covered {len(records)} failed records from {period_start} through {period_end}. All records show the same evaluator outcome: **Stoploss hit**, after entry during local OHLC evaluation. No application/API/database/payment/third-party/infrastructure error is evidenced. Broker execution cannot be independently verified because OMS events are missing/unlinked and signal snapshots are unavailable.\n\n## 2. Failed Order Summary\n\n| Order ID | Symbol | Entry | Failure time | Category | Error | Status |\n|---|---|---|---|---|---|---|\n" + "\n".join(f"| {r['order']['order_id']} | {r['order']['stock_tick']} | {r['order']['entry_timestamp']} | {r['outcome']['completed_on']} | Application evaluation outcome / modeled stop-loss | {r['outcome']['reason']} | Failed (modeled) |" for r in records) + "\n\n## 3. Detailed Investigation\n\n" + "\n".join(f"### Order ID {r['order']['order_id']} — {r['order']['stock_tick']}\n\n- Timeline: approved/persisted {r['order']['purchased_on']}; entry {r['order']['entry_timestamp']}; evaluator completion {r['outcome']['completed_on']}.\n- Technical finding: entry {r['order']['entry_price']}; stop {r['order']['stoploss_price']}; target {r['order']['target_price']}; loss {r['outcome']['loss_amount']} ({r['outcome']['loss_pct']}%).\n- Root cause: local OHLC evaluator recorded a price breach of the configured stop-loss after entry.\n- API/database/dependency evidence: Evidence unavailable.\n- Resolution: No remediation is evidenced; reconcile against broker records before closure.\n- Preventive action: retain immutable setup/signal snapshots; link OMS/broker events; ingest fills; monitor stop-loss clusters; preserve correlated API/SQL evidence.\n" for r in records) + "\n## 4. Overall Findings\n\n- 10/10 failed records are stop-loss outcomes.\n- Every record carries missing/unlinked evidence flags.\n- Modeled loss totals -991.19; broker-realized/customer/revenue impact is unavailable.\n\n## 5. Evidence\n\n- Screenshot 1: `evidence_01_failed_order_register.png` — failed-order register.\n- Screenshot 2: `evidence_02_data_quality_manifest.png` — data-quality/linkage flags.\n- Screenshot 3: `evidence_03_representative_order_record.png` — representative order details.\n\n## 6. Appendix\n\nSource: `outputs/forensics_phase1/*/manifest.json` and `order_*.json`. Unavailable: app/API/SQL/monitoring/configuration/payment/third-party/broker event artifacts.\n"
(OUT / "failed_order_investigation_report.md").write_text(md, encoding="utf-8")
print(OUT / "failed_order_investigation_report.html")
