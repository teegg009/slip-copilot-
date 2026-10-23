# web-next — แดชบอร์ด (Next.js)

แดชบอร์ดของ Slip Copilot (Next.js App Router + TypeScript) ใช้ Supabase และ n8n ในโฟลเดอร์ `../supabase` และ `../n8n`
ออกเป็นไฟล์ static (`output: "export"`) จึง deploy ที่ไหนก็ได้ ไม่ต้องมีเซิร์ฟเวอร์

## รัน
```
npm install
cp .env.example .env.local      # ใส่ค่าสาธารณะของโปรเจกต์ (ดูในไฟล์)
npm run dev                     # http://localhost:3001
npm run build                   # ได้โฟลเดอร์ out/
```

## ต้องตั้งเพิ่ม (ครั้งเดียว) เมื่อเปลี่ยนพอร์ต/โดเมน
1. Supabase → Authentication → URL Configuration → เพิ่ม `http://localhost:3001` ใน Redirect URLs
2. Google Cloud → OAuth client → Authorized JavaScript origins → เพิ่ม `http://localhost:3001` (ใช้กับสแกน Gmail)
3. n8n: import `../n8n/email-parse.json` ใหม่ (อนุญาต CORS ของพอร์ต 3001)

## โครงสร้าง
- `app/` — layout, หน้าเดียว, `globals.css` 
- `components/` — Login, Sidebar, Topbar (LINE + เมนูบัญชี), Stats (การ์ด/กราฟ/หมวด), ReceiptsTable, Cards, Modals
- `lib/useDashboard.ts` — ข้อมูลและการกระทำทั้งหมด (โหลด, อนุมัติ, แก้, ลบ, Excel, Gmail)
- `lib/i18n.tsx`, `lib/dict.ts` — สองภาษา EN/TH
- `lib/gmail.ts`, `lib/excel.ts` — Gmail และ Excel (โหลดไลบรารีเฉพาะตอนใช้)

## จุดเด่น
- สลับภาษาไม่ดึงข้อมูลใหม่ (วาดใหม่อย่างเดียว)
- ไลบรารี Excel โหลดตอนกดดาวน์โหลดเท่านั้น
- ดึงอีเมลจาก Gmail พร้อมกัน 4 ฉบับ และเพิกถอนสิทธิ์ Gmail ทันทีหลังสแกน
- modal ปิดด้วย Esc ได้ทุกอัน และคืน focus เมื่อปิด
- token ที่ต่ออายุเองไม่ทำให้โหลดทั้งหน้าซ้ำ
