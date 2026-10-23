"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DICT, type Lang } from "./dict";
import { CATEGORIES, lsGet, lsSet } from "./format";

const MONTHS_SHORT = {
  en: ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  th: ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."],
};
const MONTHS_FULL = {
  en: ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  th: ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"],
};

export type I18n = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: string, ...a: (string | number)[]) => string;
  tList: (k: string) => string[];
  baht: (n: number | string | null | undefined) => string;
  fmtDate: (iso: string) => string;
  nSlips: (n: number) => string;
  monthShort: (m: number) => string;
  monthFull: (m: number) => string;
  yearLabel: (y: number) => number;
  CAT: Record<string, string>;
  STATUS: Record<string, [string, string]>;
  SOURCE: Record<string, string>;
  ROLE: Record<string, string>;
};

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // เริ่มที่ en เหมือนตอน pre-render แล้วค่อยอ่านค่าที่บันทึกไว้ (กัน hydration mismatch)
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => { if (lsGet("slip.lang") === "th") setLangState("th"); }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setLang = useCallback((l: Lang) => { setLangState(l); lsSet("slip.lang", l); }, []);

  const value = useMemo<I18n>(() => {
    const t = (k: string, ...a: (string | number)[]) => {
      const v = DICT[lang][k] ?? DICT.en[k] ?? k;
      return typeof v === "string" ? v.replace(/\{(\d)\}/g, (_, i) => String(a[+i] ?? "")) : k;
    };
    const tList = (k: string) => {
      const v = DICT[lang][k] ?? DICT.en[k];
      return Array.isArray(v) ? v : [];
    };
    const yearLabel = (y: number) => (lang === "th" ? y + 543 : y);
    return {
      lang, setLang, t, tList, yearLabel,
      baht: (n) => Number(n || 0).toLocaleString(lang === "th" ? "th-TH" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      fmtDate: (iso) => {
        const [y, m, d] = String(iso).split("-");
        if (!y) return "-";
        return lang === "th" ? `${+d} ${MONTHS_SHORT.th[+m]} ${+y + 543}` : `${MONTHS_SHORT.en[+m]} ${+d}, ${y}`;
      },
      nSlips: (n) => (lang === "th" ? `${n} ใบ` : `${n} ${n === 1 ? "slip" : "slips"}`),
      monthShort: (m) => MONTHS_SHORT[lang][m],
      monthFull: (m) => MONTHS_FULL[lang][m],
      CAT: Object.fromEntries(CATEGORIES.map((c) => [c, t("cat_" + c)])),
      STATUS: {
        approved: [t("st_approved"), "b-ok"], pending: [t("st_pending"), "b-warn"],
        needs_review: [t("st_review"), "b-info"], rejected: [t("st_rejected"), "b-bad"],
      },
      SOURCE: { line: t("src_line"), web: t("src_web"), email: t("src_email") },
      ROLE: { admin: t("role_admin"), accountant: t("role_accountant"), employee: t("role_employee") },
    };
  }, [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n must be used inside <I18nProvider>");
  return v;
}
