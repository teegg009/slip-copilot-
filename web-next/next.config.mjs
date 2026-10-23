/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",   // ไฟล์ static ล้วน (โฟลเดอร์ out/) ไม่ต้องมีเซิร์ฟเวอร์
  reactStrictMode: true,
};
import path from "node:path";
nextConfig.turbopack = { root: path.resolve(".") };   // ไม่ให้ Next ไปหยิบ lockfile นอกโปรเจกต์
export default nextConfig;
