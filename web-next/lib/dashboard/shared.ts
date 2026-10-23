"use client";
import { useCallback, useRef, useState, type MutableRefObject } from "react";
import type { User } from "@supabase/supabase-js";
import { useI18n } from "../i18n";
import type { Workspace } from "../types";

// ค่าล่าสุดที่ฟังก์ชัน async ต้องอ่าน (กันได้ค่าเก่าค้างใน closure)
export type Live = { user: User | null; ws: string | null; workspaces: Workspace[]; roles: Record<string, string> };

export type Shared = {
  live: MutableRefObject<Live>;
  t: MutableRefObject<(k: string, ...a: (string | number)[]) => string>;   // ข้อความแปลภาษาล่าสุด
  toast: (msg: string) => void;
  toastMsg: string | null;
  busy: Record<string, boolean>;
  setBusy: (key: string, value: boolean) => void;
};

// ของที่ทุกส่วนใช้ร่วมกัน: ค่าล่าสุด, ข้อความแจ้งเตือน, สถานะ "กำลังทำงาน" รายปุ่ม
export function useShared(): Shared {
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;

  const live = useRef<Live>({ user: null, ws: null, workspaces: [], roles: {} });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [busy, setBusyMap] = useState<Record<string, boolean>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMsg(null), 3800);
  }, []);
  const setBusy = useCallback((key: string, value: boolean) => setBusyMap((b) => ({ ...b, [key]: value })), []);

  return { live, t: tRef, toast, toastMsg, busy, setBusy };
}
