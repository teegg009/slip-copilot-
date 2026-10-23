"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { CATEGORIES } from "@/lib/format";
import type { MailItem, Receipt } from "@/lib/types";

// กรอบ modal กลาง: Esc / คลิกพื้นหลัง = ปิด, ย้าย focus เข้าไปข้างใน และคืน focus เมื่อปิด
function Modal({ onClose, width, children }: { onClose: () => void; width?: string; children: ReactNode }) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = card.current?.querySelector<HTMLElement>("input,select,button:not([aria-label='Close'])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" ref={card} style={width ? { width } : undefined}>{children}</div>
    </div>
  );
}

const Head = ({ title, onClose }: { title: ReactNode; onClose: () => void }) => (
  <div className="modal-head"><div className="modal-cap">{title}</div><button className="small ghost" aria-label="Close" onClick={onClose}>✕</button></div>
);

export function EditModal({ receipt, busy, onSave, onClose }: {
  receipt: Receipt; busy: boolean; onClose: () => void;
  onSave: (f: { vendor: string; date: string; amount: string; cat: string; note: string }) => void;
}) {
  const { t, CAT } = useI18n();
  const [f, setF] = useState({
    vendor: receipt.vendor || "", date: receipt.txn_date, amount: String(receipt.amount), cat: receipt.category, note: receipt.note || "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); onSave(f); } };
  return (
    <Modal onClose={onClose} width="min(520px,100%)">
      <Head title={t("ed_title")} onClose={onClose} />
      <div className="form-body">
        <label><span>{t("f_vendor")}</span><input type="text" maxLength={160} value={f.vendor} onChange={set("vendor")} onKeyDown={enter} /></label>
        <div className="two">
          <label><span>{t("f_date")}</span><input type="date" value={f.date} onChange={set("date")} onKeyDown={enter} /></label>
          <label><span>{t("f_amount")}</span><input type="number" step="0.01" min="0.01" inputMode="decimal" value={f.amount} onChange={set("amount")} onKeyDown={enter} /></label>
        </div>
        <label><span>{t("f_cat")}</span>
          <select value={f.cat} onChange={set("cat")}>
            {CATEGORIES.map((k) => <option key={k} value={k}>{CAT[k]}</option>)}
          </select>
        </label>
        <label><span>{t("f_note")}</span><input type="text" maxLength={200} value={f.note} onChange={set("note")} onKeyDown={enter} /></label>
      </div>
      <div className="modal-foot">
        <span className="hint" style={{ margin: 0 }}>{t("ed_hint")}</span>
        <div className="row">
          <button onClick={onClose}>{t("cancel")}</button>
          <button className="primary" disabled={busy} onClick={() => onSave(f)}>{t("save")}</button>
        </div>
      </div>
    </Modal>
  );
}

export function DeleteModal({ receipt, busy, onConfirm, onClose }: { receipt: Receipt; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  const { t, baht, fmtDate } = useI18n();
  return (
    <Modal onClose={onClose} width="min(440px,100%)">
      <Head title={t("del_title")} onClose={onClose} />
      <div className="form-body">
        <div style={{ fontWeight: 600 }}>{receipt.vendor || t("no_vendor")} · {fmtDate(receipt.txn_date)} · ฿{baht(receipt.amount)}</div>
        <p className="hint" style={{ margin: 0 }}>{t("del_text")}</p>
      </div>
      <div className="modal-foot">
        <span></span>
        <div className="row">
          <button onClick={onClose}>{t("cancel")}</button>
          <button className="danger" disabled={busy} onClick={onConfirm}>{t("del_btn")}</button>
        </div>
      </div>
    </Modal>
  );
}

export function ImageModal({ receipt, getUrl, onClose }: { receipt: Receipt; getUrl: (path: string) => Promise<string | null>; onClose: () => void }) {
  const { t, baht, fmtDate } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    void getUrl(receipt.image_path as string).then((u) => { if (!alive) return; if (u) setUrl(u); else onClose(); });
    return () => { alive = false; };
  }, [receipt.image_path, getUrl, onClose]);
  return (
    <Modal onClose={onClose}>
      <Head
        title={<>{receipt.vendor || t("no_vendor")}<small>{fmtDate(receipt.txn_date)} · ฿{baht(receipt.amount)}</small></>}
        onClose={onClose}
      />
      <div className="modal-body">
        {!loaded && <span className="muted">{t("img_loading")}</span>}
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" hidden={!loaded} onLoad={() => setLoaded(true)} onError={onClose} />
        )}
      </div>
    </Modal>
  );
}

export function MailModal({ items, skipped, busy, onImport, onClose }: {
  items: MailItem[]; skipped: number; busy: boolean; onImport: (picks: MailItem[]) => void; onClose: () => void;
}) {
  const { t, baht, fmtDate } = useI18n();
  const [on, setOn] = useState<Set<number>>(() => new Set(items.flatMap((r, i) => (r.currency === "THB" ? [i] : []))));
  const selectable = items.flatMap((r, i) => (r.currency === "THB" ? [i] : []));
  const toggle = (i: number) => setOn((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  return (
    <Modal onClose={onClose}>
      <div className="modal-head">
        <div className="modal-cap"><span>{t("mail_review")}</span><small>{t("mail_summary", items.length, skipped)}</small></div>
        <button className="small ghost" aria-label="Close" onClick={onClose}>✕</button>
      </div>
      <div className="modal-body mail-list">
        {items.length ? items.map((r, i) => {
          const thb = r.currency === "THB";
          return (
            <label key={r.id} className={"mail-row" + (thb ? "" : " off")}>
              <input type="checkbox" checked={thb && on.has(i)} disabled={!thb} onChange={() => toggle(i)} />
              <div className="mail-main">
                <b>{r.vendor || t("no_vendor")}</b> <span className="muted">{fmtDate(r.date)}</span>
                <div className="muted mail-sub">{r.subject}</div>
                {!thb && <span className="badge b-warn">{t("mail_foreign", r.currency)}</span>}
              </div>
              <div className="mail-amt">{thb ? "฿" : r.currency + " "}{baht(r.amount)}</div>
            </label>
          );
        }) : <div className="empty"><b>{t("mail_none")}</b></div>}
      </div>
      <div className="modal-foot">
        <label>
          <input type="checkbox" checked={selectable.length > 0 && selectable.every((i) => on.has(i))}
            onChange={(e) => setOn(new Set(e.target.checked ? selectable : []))} />
          <span>{t("mail_all")}</span>
        </label>
        <button className="primary" disabled={busy || on.size === 0} onClick={() => onImport([...on].sort((a, b) => a - b).map((i) => items[i]))}>{t("mail_import")}</button>
      </div>
    </Modal>
  );
}
