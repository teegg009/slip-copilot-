-- ตรวจว่าไฟล์ SQL ทั้งหมดถูกติดตั้งจริง (อ่านอย่างเดียว ไม่แก้อะไร) รันใน Supabase > SQL Editor
-- ผลที่ถูกต้อง: คอลัมน์ ok เป็น true ทุกแถว; แถวไหนเป็น false ให้รันไฟล์ที่ระบุในคอลัมน์ run_file อีกครั้ง

select item, ok, run_file from (
  select 1 as n, 'ตาราง receipts มีคอลัมน์ edited_at' as item,
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'receipts' and column_name = 'edited_at') as ok,
         'receipt_edit.sql' as run_file
  union all select 2, 'trigger กันแก้ฟิลด์ต้องห้าม (guard update)',
         exists (select 1 from pg_trigger where tgname = 'trg_receipts_guard_update' and not tgisinternal), 'receipt_edit.sql'
  union all select 3, 'trigger ตั้งสถานะอนุมัติอัตโนมัติ',
         exists (select 1 from pg_trigger where tgname = 'trg_receipts_set_status' and not tgisinternal), 'schema.sql'
  union all select 4, 'trigger อีเมลเฉพาะส่วนตัว',
         exists (select 1 from pg_trigger where tgname = 'trg_receipts_email_personal_only' and not tgisinternal), 'email_personal_only.sql'
  union all select 5, 'นโยบายแก้ใบเสร็จมี is_member (rc_update)',
         exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'receipts' and policyname = 'rc_update' and qual ilike '%is_member%'), 'receipt_edit.sql'
  union all select 6, 'นโยบายลบรูปใน Storage',
         exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'receipts_obj_delete'), 'receipt_edit.sql'
  union all select 7, 'นโยบายดูรูป Storage แบบเข้ม (แอดมิน/บัญชี หรือเจ้าของใบ)',
         exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'receipts_obj_select' and qual ilike '%accountant%'), 'storage_policy.sql'
  union all select 8, 'ฟังก์ชัน line_connect',
         exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'line_connect'), 'line_functions.sql'
  union all select 9, 'ฟังก์ชัน line_join_workspace แบบ 3 พารามิเตอร์ (ไม่มีตัวเก่าค้าง)',
         exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'line_join_workspace' and p.pronargs = 3)
         and not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'line_join_workspace' and p.pronargs = 2), 'line_functions.sql'
  union all select 10, 'ฟังก์ชัน LINE เรียกได้เฉพาะ service_role',
         not has_function_privilege('authenticated', 'public.line_connect(text,text,text)', 'execute')
         and has_function_privilege('service_role', 'public.line_connect(text,text,text)', 'execute'), 'line_functions.sql'
  union all select 11, 'bucket receipts เป็นส่วนตัว (ไม่ public)',
         exists (select 1 from storage.buckets where id = 'receipts' and public = false), 'schema.sql'
  union all select 12, 'สร้างรหัสเชื่อม LINE ผ่านฟังก์ชันเท่านั้น (ผู้ใช้ insert link_codes ตรงๆ ไม่ได้)',
         exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'create_link_code')
         and not has_table_privilege('authenticated', 'public.link_codes', 'insert'), 'hardening2.sql'
  union all select 13, 'ผู้ใช้อัปโหลดรูปเข้า Storage เองไม่ได้ (policy insert ถูกถอด)',
         not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'receipts_obj_insert'), 'hardening2.sql'
) t order by n;
