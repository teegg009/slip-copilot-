// ค่าตั้งของหน้าเว็บ อ่านจากตัวแปร NEXT_PUBLIC_* ตอน build (ดู .env.example)
// ทุกค่าเป็นค่าสาธารณะ: ห้ามใส่ service_role / secret key / client secret
export const cfg = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_KEY ?? "",
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  emailParseUrl: process.env.NEXT_PUBLIC_EMAIL_PARSE_URL ?? "",
};

export function jwtRole(key: string): string | null {
  try {
    return JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role;
  } catch {
    return null;
  }
}

// ตรวจค่าตั้ง: คืนรหัสข้อความ error ถ้าใช้ไม่ได้ / ไม่ปลอดภัยสำหรับเบราว์เซอร์
export function configProblem(): "f_cfg" | "f_secret" | null {
  if (!cfg.supabaseUrl || !cfg.supabaseKey || /^PASTE/.test(cfg.supabaseKey)) return "f_cfg";
  if (jwtRole(cfg.supabaseKey) === "service_role" || /^sb_secret_/.test(cfg.supabaseKey)) return "f_secret";
  return null;
}
