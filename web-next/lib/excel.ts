import type { ExportRow, ReceiptItem } from "./types";
import type { I18n } from "./i18n";
import { toExcelDate } from "./format";

const itemsText = (items: ReceiptItem[] | null, baht: I18n["baht"]) =>
  (Array.isArray(items) ? items : []).map((i) => `${i.name}${Number(i.qty) > 1 ? " x" + i.qty : ""} (${baht(i.amount)})`).join("; ");

const round2 = (n: number) => Math.round(n * 100) / 100;

// สร้างและดาวน์โหลดไฟล์ Excel (โหลดไลบรารี xlsx เฉพาะตอนกดปุ่ม ไม่หน่วงการเปิดหน้า)
export async function downloadExcel(rows: ExportRow[], wsName: string, i: I18n) {
  const XLSX = await import("xlsx");
  const { t, lang } = i;
  const monthLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${i.monthShort(+m)} ${i.yearLabel(+y)}`; };

  const setFormats = (ws: import("xlsx").WorkSheet, cols: Record<number, string>) => {
    const ref = XLSX.utils.decode_range(ws["!ref"] as string);
    for (let r = ref.s.r + 1; r <= ref.e.r; r++) for (const [c, fmt] of Object.entries(cols)) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: +c })];
      if (cell && cell.t === "n") cell.z = fmt;
    }
  };

  const valid = rows.filter((r) => r.status !== "rejected");   // ยอดรวมไม่นับรายการที่ถูกปฏิเสธ
  const head = i.tList("x_head");
  const line = (r: ExportRow) => [
    toExcelDate(r.txn_date), (r.txn_time || "").slice(0, 5), r.vendor || "", i.CAT[r.category] || r.category,
    Number(r.amount), i.SOURCE[r.source] || r.source, (i.STATUS[r.status] || [r.status])[0], r.ref_no || "",
    itemsText(r.items, i.baht), r.review_reason || r.note || "",
  ];
  const widths = [{ wch: 12 }, { wch: 7 }, { wch: 28 }, { wch: 16 }, { wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 20 }, { wch: 44 }, { wch: 28 }];

  const byMonth: Record<string, { n: number; sum: number }> = {};
  const byCat: Record<string, { n: number; sum: number }> = {};
  for (const r of valid) {
    const ym = r.txn_date.slice(0, 7);
    (byMonth[ym] ||= { n: 0, sum: 0 }); byMonth[ym].n++; byMonth[ym].sum += Number(r.amount);
    (byCat[r.category] ||= { n: 0, sum: 0 }); byCat[r.category].n++; byCat[r.category].sum += Number(r.amount);
  }
  const months = Object.keys(byMonth).sort();
  const grand = valid.reduce((s, r) => s + Number(r.amount), 0);
  const summary: (string | number)[][] = [
    [t("x_title", wsName)], [t("x_when"), new Date().toLocaleString(lang === "th" ? "th-TH" : "en-GB")], [t("x_excl")], [],
    [t("x_month"), t("x_count"), t("x_sum")],
    ...months.map((m) => [monthLabel(m), byMonth[m].n, round2(byMonth[m].sum)]),
    [t("x_total"), valid.length, round2(grand)], [],
    [t("x_cat"), t("x_count"), t("x_sum")],
    ...Object.entries(byCat).sort((a, b) => b[1].sum - a[1].sum).map(([c, v]) => [i.CAT[c] || c, v.n, round2(v.sum)]),
  ];

  const wb = XLSX.utils.book_new();
  const s0 = XLSX.utils.aoa_to_sheet(summary);
  s0["!cols"] = [{ wch: 22 }, { wch: 16 }, { wch: 16 }];
  for (const addr of Object.keys(s0)) {
    if (addr[0] !== "!" && s0[addr].t === "n" && addr[0] === "C") s0[addr].z = "#,##0.00";
  }
  XLSX.utils.book_append_sheet(wb, s0, t("x_sheet_sum"));

  for (const ym of months.slice().reverse()) {
    const mr = rows.filter((r) => r.txn_date.slice(0, 7) === ym);
    const sum = mr.filter((r) => r.status !== "rejected").reduce((s, r) => s + Number(r.amount), 0);
    const ws = XLSX.utils.aoa_to_sheet([head, ...mr.map(line), ["", "", "", t("x_sum_row"), round2(sum)]]);
    ws["!cols"] = widths; setFormats(ws, { 0: "dd/mm/yyyy", 4: "#,##0.00" });
    const [y, m] = ym.split("-");
    XLSX.utils.book_append_sheet(wb, ws, `${i.yearLabel(+y)}-${m}`);
  }
  const wsAll = XLSX.utils.aoa_to_sheet([head, ...rows.map(line)]);
  wsAll["!cols"] = widths; setFormats(wsAll, { 0: "dd/mm/yyyy", 4: "#,##0.00" });
  XLSX.utils.book_append_sheet(wb, wsAll, t("x_sheet_all"));

  const safe = wsName.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  XLSX.writeFile(wb, `slip-copilot_${safe}_${stamp}.xlsx`);
}
