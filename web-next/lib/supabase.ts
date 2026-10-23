import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cfg } from "./config";

let client: SupabaseClient | null = null;

// สร้างตอนเรียกใช้ครั้งแรก (ฝั่งเบราว์เซอร์เท่านั้น) ไม่สร้างตอน pre-render
export function getSb(): SupabaseClient {
  if (!client) client = createClient(cfg.supabaseUrl, cfg.supabaseKey);
  return client;
}
