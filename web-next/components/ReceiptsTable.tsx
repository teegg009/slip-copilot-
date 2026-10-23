"use client";
import { useDeferredValue, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AV_COLORS, hash, isOpen } from "@/lib/format";
import type { Receipt } from "@/lib/types";
import { Icon } from "./Icons";

type Props = {
  receipts: Receipt[];
  rcError: string | null;
  userId: string;
  wsName: string;
  canReview: boolean;
  isAdmin: boolean;
  busy: Record<string, boolean>;
  excelBusy: boolean;
  onExcel: () => void;
  onReload: () => void;
  onReview: (id: string, act: "approved" | "rejected") => void;
  onEdit: (r: Receipt) => void;
  onDelete: (r: Receipt) => void;
  onView: (r: Receipt) => void;
};

export function ReceiptsTable(p: Props) {
  const { t, baht, fmtDate, CAT, STATUS, SOURCE } = useI18n();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const dq = useDeferredValue(q.trim().toLowerCase());

  const rows = useMemo(() => p.receipts.filter((r) =>
    (!dq || String(r.vendor || "").toLowerCase().includes(dq)) &&
    (!status || (status === "open" ? isOpen(r.status) : r.status === status))), [p.receipts, dq, status]);

  return (
    <section id="secReceipts" className="card">
      <div className="head">
        <div><h2>{t("rc_title")}</h2><div className="sub">{t("rc_sub")}</div></div>
        <div className="row">
          <button className="small primary" disabled={p.excelBusy} onClick={p.onExcel}>{p.excelBusy ? t("t_xl_making") : t("nav_excel")}</button>
          <button className="small ghost" onClick={p.onReload}>{t("refresh")}</button>
        </div>
      </div>
      <div className="tools">
        <input type="search" placeholder={t("search_ph")} aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Status filter" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("f_all")}</option>
          <option value="open">{t("lg_open")}</option>
          <option value="approved">{t("st_approved")}</option>
          <option value="rejected">{t("st_rejected")}</option>
        </select>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>{t("th_payee")}</th><th>{t("th_cat")}</th><th>{t("th_status")}</th><th className="num">{t("th_amount")}</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const [label, cls] = STATUS[r.status] || [r.status, "b-info"];
              const open = isOpen(r.status);
              const mine = r.submitter_id === p.userId;
              const canEdit = p.canReview || (mine && open), canDel = p.isAdmin || (mine && open);   // ตรงกับนโยบาย RLS ในฐานข้อมูล
              const name = r.vendor || t("no_vendor");
              const ch = (name.replace(/^(น\.ส\.|นาย|นาง|นางสาว|บริษัท|ร้าน)\s*/, "").trim() || name).charAt(0).toUpperCase();
              const col = AV_COLORS[hash(name) % AV_COLORS.length];
              const busy = !!p.busy["act:" + r.id];
              return (
                <tr key={r.id}>
                  <td className="c-vendor"><div className="who-cell">
                    <div className="av" style={{ background: `color-mix(in srgb, ${col} 16%, transparent)`, color: col }}>{ch}</div>
                    <div><b>{name}</b><span>{fmtDate(r.txn_date)} · {SOURCE[r.source] || r.source}{r.edited_at ? ` · ${t("edited")}` : ""}</span></div>
                  </div></td>
                  <td className="c-cat muted">{CAT[r.category] || r.category}</td>
                  <td className="c-status"><span className={`badge ${cls}`} title={r.review_reason || ""}>{label}</span></td>
                  <td className="c-amt num">{baht(r.amount)}</td>
                  <td className="acts">
                    {r.image_path && <button className="small ghost" onClick={() => p.onView(r)}>{t("view_img")}</button>}
                    {p.canReview && open && (
                      <>
                        <button className="small primary" disabled={busy} onClick={() => p.onReview(r.id, "approved")}>{t("approve")}</button>
                        <button className="small" disabled={busy} onClick={() => p.onReview(r.id, "rejected")}>{t("reject")}</button>
                      </>
                    )}
                    {canEdit && <button className="small ghost icon-btn" title={t("edit")} aria-label={t("edit")} onClick={() => p.onEdit(r)}><Icon id="i-edit" /></button>}
                    {canDel && <button className="small ghost icon-btn del" title={t("del_btn")} aria-label={t("del_btn")} onClick={() => p.onDelete(r)}><Icon id="i-trash" /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="empty" hidden={rows.length > 0 && !p.rcError}>
        {p.rcError ? <b>{p.rcError}</b> : (
          <>
            <div className="big"><Icon id="i-receipt" /></div>
            <b>{p.receipts.length ? t("em_filter_t") : t("em_none_t")}</b>
            {p.receipts.length ? t("em_filter_s") : t("em_none_s")}
          </>
        )}
      </div>
      <div className="foot-note">{p.wsName ? t(p.canReview ? "rcsub_all" : "rcsub_own", p.wsName) : ""}</div>
    </section>
  );
}
