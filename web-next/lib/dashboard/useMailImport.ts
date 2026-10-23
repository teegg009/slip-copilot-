"use client";
import { useState } from "react";
import { cfg } from "../config";
import { getSb } from "../supabase";
import { fetchMessages, gmailApi, gmailToken, mailQuery, revokeToken } from "../gmail";
import type { MailItem } from "../types";
import type { Shared } from "./shared";

const MAIL_LIMIT = 15;   // จำนวนอีเมลสูงสุดที่ส่งให้ AI อ่านต่อครั้ง

// ดึงใบเสร็จจาก Gmail (เฉพาะ workspace ส่วนตัว): สแกน -> ให้ผู้ใช้เลือก -> นำเข้า
export function useMailImport({ live, t, toast, setBusy }: Shared, reloadReceipts: () => Promise<void>) {
  const [mail, setMail] = useState<{ items: MailItem[]; skipped: number } | null>(null);
  const [status, setStatus] = useState("");

  const personalWorkspace = () => {
    const w = live.current.workspaces.find((x) => x.id === live.current.ws);
    return w && w.kind === "personal" ? w : null;
  };

  const scan = async (days: number) => {
    const tt = t.current;
    if (!cfg.googleClientId || /^PASTE/.test(cfg.googleClientId) || !cfg.emailParseUrl) { toast(tt("t_mail_cfg")); return; }
    const w = personalWorkspace();
    if (!w) { toast(tt("t_mail_personal")); return; }

    setBusy("mail", true);
    let token: string | null = null;
    try {
      setStatus(tt("mail_working"));
      try { token = await gmailToken(cfg.googleClientId); } catch { throw new Error(tt("t_mail_auth")); }

      const list = await gmailApi<{ messages?: { id: string }[] }>(token, "messages?maxResults=40&q=" + encodeURIComponent(mailQuery(days)));
      const ids = (list.messages || []).map((m) => m.id);

      // ข้ามอีเมลที่เคยนำเข้าแล้ว (ไม่เปลืองโควตา AI)
      let known = new Set<string>();
      if (ids.length) {
        const { data } = await getSb().from("receipts").select("ref_no").eq("workspace_id", w.id).in("ref_no", ids.map((x) => "gmail:" + x));
        known = new Set((data || []).map((r: { ref_no: string }) => r.ref_no));
      }
      const fresh = ids.filter((x) => !known.has("gmail:" + x)).slice(0, MAIL_LIMIT);
      if (!fresh.length) { setStatus(tt("mail_none")); return; }

      const messages = await fetchMessages(token, fresh);
      setStatus(tt("mail_ai", messages.length));

      const session = (await getSb().auth.getSession()).data.session;
      // ส่งแบบ form (ไม่ใช่ JSON) เพื่อเลี่ยง CORS preflight ของ n8n
      const body = new URLSearchParams({ payload: JSON.stringify({ token: session?.access_token, messages }) });
      const res = await fetch(cfg.emailParseUrl, { method: "POST", body });
      if (!res.ok) throw new Error("n8n " + res.status);

      const results = ((await res.json()) as { results?: MailItem[] }).results || [];
      const found = results.filter((r) => r.ok);
      setMail({ items: found, skipped: results.length - found.length });
      setStatus("");
    } catch (e) { setStatus(""); toast(tt("t_mail_fail", (e as Error).message)); }
    finally { if (token) revokeToken(token); setBusy("mail", false); }
  };

  const importPicked = async (picks: MailItem[]): Promise<boolean> => {
    const tt = t.current;
    const w = personalWorkspace();
    if (!w) { toast(tt("t_mail_personal")); return false; }
    if (!picks.length) return false;

    setBusy("import", true);
    let done = 0, lastErr: { message: string } | null = null;
    try {
      for (const r of picks) {   // ทีละรายการ: รายการซ้ำ (เคยนำเข้า) ไม่ทำให้ทั้งชุดล้ม
        const { error } = await getSb().from("receipts").insert({
          workspace_id: w.id, submitter_id: live.current.user!.id, ref_no: "gmail:" + r.id, txn_date: r.date, vendor: r.vendor, amount: r.amount,
          category: r.category, items: r.items, source: "email", confidence: r.confidence, note: ("Email: " + (r.subject || "")).slice(0, 200),
        });
        if (!error) done++; else if (error.code !== "23505") lastErr = error;
      }
    } finally { setBusy("import", false); }

    if (!done && lastErr) { toast(tt("t_mail_save_fail", lastErr.message)); return false; }
    toast(tt("mail_done", done)); await reloadReceipts();
    return true;
  };

  return { mail, status, closeMail: () => setMail(null), scan, importPicked };
}
