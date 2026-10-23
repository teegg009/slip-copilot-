// URL ตอนเปิดหน้า: จดไว้ก่อนที่ไลบรารี Supabase จะล้าง #access_token / #error ออกจาก URL
const LANDING = typeof window !== "undefined" ? { hash: location.hash, search: location.search } : { hash: "", search: "" };

export type LandingAuth = { error: string | null; accessToken: string | null; refreshToken: string | null };

// ผลที่ Google ส่งกลับมาหลังล็อกอิน: ข้อความ error (ถ้ามี) และ token ที่ใช้ตั้ง session เองได้
export function landingAuth(): LandingAuth {
  const hash = new URLSearchParams(LANDING.hash.replace(/^#/, ""));
  const query = new URLSearchParams(LANDING.search);
  const error = hash.get("error_description") || query.get("error_description");
  return {
    error: error ? error.replaceAll("+", " ") : null,
    accessToken: hash.get("access_token"),
    refreshToken: hash.get("refresh_token"),
  };
}
