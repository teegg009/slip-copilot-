-- จำกัดการดูรูปสลิปใน Storage (รันใน Supabase > SQL Editor ครั้งเดียว รันซ้ำได้)
--
-- เดิม: สมาชิกทุกคนของ workspace ดูรูปได้ทุกใบ (พนักงานจึงเห็นรูปของเพื่อนร่วมงานได้)
-- ใหม่: แอดมิน/ฝ่ายบัญชี ดูได้ทุกใบ; พนักงานดูได้เฉพาะรูปของใบเสร็จที่ตัวเองส่ง
--
-- ชื่อไฟล์ใน bucket = "<workspace_id>/<รหัสรูป>.jpg" ตรงกับคอลัมน์ receipts.image_path

drop policy if exists receipts_obj_select on storage.objects;
create policy receipts_obj_select on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts' and (
      exists (select 1 from public.memberships m
              where m.user_id = auth.uid()
                and m.workspace_id::text = (storage.foldername(name))[1]
                and m.role in ('admin', 'accountant'))
      or exists (select 1 from public.receipts r
                 where r.image_path = name and r.submitter_id = auth.uid())
    )
  );
