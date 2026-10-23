export const lsGet = (k: string): string | null => {
  try { return localStorage.getItem(k); } catch { return null; }
};
export const lsSet = (k: string, v: string) => {
  try { localStorage.setItem(k, v); } catch { /* ignore */ }
};

// วันที่ท้องถิ่นเป็น yyyy-mm-dd (ไม่ใช้ toISOString เพราะเลื่อนวันตามเขตเวลา)
export const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1))), n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export const compact = (v: number) =>
  v >= 1e6 ? (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + "M" : v >= 1e3 ? (v / 1e3).toFixed(v % 1e3 ? 1 : 0) + "K" : String(v);

export const hash = (s: string) => {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
};

// วันที่เป็นเลข serial ของ Excel (ไม่ใช้ Date เพื่อเลี่ยงปัญหาเขตเวลาที่ทำให้วันเลื่อน)
export const toExcelDate = (iso: string) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
};

export const CAT_COLOR: Record<string, string> = {
  food: "#1e4db7", transport: "#f5a623", shopping: "#13b99a", utilities: "#1a9bfc", health: "#f2705a", other: "#8a94a6",
};
export const AV_COLORS = ["#1e4db7", "#1a9bfc", "#13b99a", "#f5a623", "#f2705a", "#7a5af8", "#8a94a6"];
export const CATEGORIES = ["food", "transport", "shopping", "utilities", "health", "other"] as const;

export const isOpen = (status: string) => status === "pending" || status === "needs_review";
