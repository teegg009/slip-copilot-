"use client";
import { useCallback, useState } from "react";
import { getSb } from "../supabase";
import { useI18n } from "../i18n";
import { localISO } from "../format";
import { downloadExcel } from "../excel";
import type { ExportRow, Receipt } from "../types";
import type { Shared } from "./shared";

const MAX_ROWS = 200;          // จำนวนใบเสร็จล่าสุดที่แสดง
const EXPORT_PAGE = 1000;      // ขนาดหน้าตอนดึงข้อมูลไป Excel
const EXPORT_CEILING = 20000;  // เพดานจำนวนแถวที่ส่งออก
const BASE_COLS = "id,txn_date,vendor,category,amount,source,status,review_reason,submitter_id,image_path";

export type EditForm = { vendor: string; date: string; amount: string; cat: string; note: string };

// ใบเสร็จของ workspace ที่เลือก: โหลด / อนุมัติ / แก้ / ลบ / ดูรูป / Excel
export function useReceipts({ live, t, toast, setBusy }: Shared) {
  const i18n = useI18n();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [rcError, setRcError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const target = live.current.ws;
    if (!target) { setReceipts([]); setRcError(null); return; }
    const fetchRows = (cols: string) => getSb().from("receipts").select(cols).eq("workspace_id", target)
      .order("txn_date", { ascending: false }).order("created_at", { ascending: false }).limit(MAX_ROWS);

    let { data, error } = await fetchRows(BASE_COLS + ",note,edited_at");
    // ยังไม่ได้รัน receipt_edit.sql (ยังไม่มีคอลัมน์ note/edited_at): ใช้ชุดคอลัมน์เดิมต่อ ไม่ให้ทั้งหน้าว่าง
    if (error && /42703|edited_at|\bnote\b/.test(`${error.code || ""} ${error.message || ""}`)) ({ data, error } = await fetchRows(BASE_COLS));

    if (target !== live.current.ws) return;   // ผู้ใช้สลับ workspace ระหว่างรอ ทิ้งผลของอันเก่า
    if (error) {
      const msg = t.current("t_rc_fail", error.message);
      setReceipts([]); setRcError(msg); toast(msg);
      return;
    }
    setRcError(null);
    setReceipts((data ?? []) as unknown as Receipt[]);
  }, [live, t, toast]);

  const clear = useCallback(() => setReceipts([]), []);

  // อนุมัติ/ปฏิเสธได้เฉพาะถ้าแถวยังเป็นยอดและสถานะที่ผู้ใช้เห็นอยู่ (กันกดทับการแก้ไขของคนอื่นระหว่างรอ)
  const review = async (id: string, act: "approved" | "rejected") => {
    setBusy("act:" + id, true);
    const shown = receipts.find((x) => x.id === id);
    let q = getSb().from("receipts")
      .update({ status: act, decided_by: live.current.user!.id, decided_at: new Date().toISOString() })
      .eq("id", id).eq("workspace_id", live.current.ws);
    if (shown) q = q.eq("amount", shown.amount).eq("status", shown.status);
    const { data, error } = await q.select("id");
    setBusy("act:" + id, false);
    if (error) { toast(t.current("t_save_fail", error.message)); return; }
    if (!data || !data.length) toast(t.current("t_save_fail", "changed by someone else, reloaded"));
    await load();
  };

  // ฝั่งเว็บส่งเฉพาะฟิลด์ที่แก้ได้; สิทธิ์จริงและฟิลด์ที่ห้ามเปลี่ยนบังคับที่ฐานข้อมูล (supabase/receipt_edit.sql)
  const saveEdit = async (id: string, f: EditForm): Promise<boolean> => {
    const tt = t.current;
    const amount = Number(f.amount);
    if (!(amount > 0) || amount > 10000000) { toast(tt("t_amt_bad")); return false; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date) || f.date > localISO(new Date(Date.now() + 86400000))) { toast(tt("t_date_bad")); return false; }
    const patch = {
      vendor: f.vendor.trim().slice(0, 160) || null, txn_date: f.date, amount: Math.round(amount * 100) / 100,
      category: f.cat, note: f.note.trim().slice(0, 200) || null,
    };
    setBusy("edit", true);
    const { data, error } = await getSb().from("receipts").update(patch).eq("id", id).eq("workspace_id", live.current.ws).select("id");
    setBusy("edit", false);
    if (error) { toast(tt("t_edit_fail", error.message)); return false; }
    if (!data || !data.length) { toast(tt("t_edit_fail", tt("t_not_allowed"))); return false; }
    toast(tt("t_edit_ok")); await load();
    return true;
  };

  const remove = async (id: string): Promise<boolean> => {
    const tt = t.current;
    const sb = getSb();
    setBusy("del", true);
    const { data, error } = await sb.from("receipts").delete().eq("id", id).eq("workspace_id", live.current.ws).select("id,image_path");
    setBusy("del", false);
    if (error) { toast(tt("t_del_fail", error.message)); return false; }
    if (!data || !data.length) { toast(tt("t_del_fail", tt("t_not_allowed"))); return false; }

    const path = (data[0] as { image_path: string | null }).image_path;
    let imageGone = true;
    if (path) {   // ลบรูปหลังลบแถว (นโยบาย Storage อนุญาตเฉพาะรูปที่ไม่มีใบเสร็จอ้างถึงแล้ว)
      const rm = await sb.storage.from("receipts").remove([path]);
      imageGone = !rm.error && Array.isArray(rm.data) && rm.data.length > 0;
    }
    toast(tt(imageGone ? "t_del_ok" : "t_img_left")); await load();
    return true;
  };

  // ลิงก์รูปชั่วคราว (หมดอายุใน 5 นาที) ผ่านสิทธิ์ของผู้ใช้ จึงเปิดได้เฉพาะรูปที่ตัวเองมีสิทธิ์เห็น
  const imageUrl = useCallback(async (path: string): Promise<string | null> => {
    const { data, error } = await getSb().storage.from("receipts").createSignedUrl(path, 300);
    if (error || !data) { toast(t.current("t_img_fail", error?.message || "not found")); return null; }
    return data.signedUrl;
  }, [t, toast]);

  const fetchAll = async (): Promise<ExportRow[]> => {
    const all: ExportRow[] = [];
    for (let from = 0; from < EXPORT_CEILING; from += EXPORT_PAGE) {
      const { data, error } = await getSb().from("receipts")
        .select("txn_date,txn_time,vendor,category,amount,source,status,review_reason,ref_no,items,note")
        .eq("workspace_id", live.current.ws).order("txn_date").order("created_at").order("id").range(from, from + EXPORT_PAGE - 1);
      if (error) throw error;
      all.push(...(data as unknown as ExportRow[]));
      if (data.length < EXPORT_PAGE) break;
    }
    return all.sort((a, b) => (a.txn_date + (a.txn_time || "")).localeCompare(b.txn_date + (b.txn_time || "")));
  };

  const exportExcel = async () => {
    const w = live.current.workspaces.find((x) => x.id === live.current.ws);
    if (!w) return;
    setBusy("excel", true);
    try {
      const rows = await fetchAll();
      if (!rows.length) { toast(t.current("t_xl_none")); return; }
      await downloadExcel(rows, w.name, i18n);
      toast(t.current("t_xl_done", rows.length));
    } catch (e) { toast(t.current("t_xl_fail", (e as Error).message || String(e))); }
    finally { setBusy("excel", false); }
  };

  return { receipts, rcError, load, clear, review, saveEdit, remove, imageUrl, exportExcel };
}
