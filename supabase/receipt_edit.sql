-- แก้ไข/ลบใบเสร็จจากหน้าเว็บ: กติกาฝั่งฐานข้อมูล (รันใน Supabase > SQL Editor ครั้งเดียว รันซ้ำได้)
--
-- 1) ผู้ใช้แก้ได้เฉพาะ ร้าน/วันที่/ยอด/หมวด/หมายเหตุ/รายการ — ฟิลด์อื่น (workspace, ผู้ส่ง, ที่มา, รูป, เลขอ้างอิง,
--    ความมั่นใจ AI) ห้ามเปลี่ยน กันย้ายใบเสร็จข้ามบริษัทและกันชี้ไปรูปของคนอื่น
-- 2) decided_by/decided_at ถูกเซิร์ฟเวอร์ตั้งจากผู้ใช้จริง (ปลอมไม่ได้)
-- 3) มีร่องรอยการแก้ไข (edited_by/edited_at)
-- 4) สมาชิกที่ถูกถอดแล้ว แก้/ลบใบเก่าของตัวเองไม่ได้อีก
-- 5) ลบรูปใน Storage ได้เมื่อไม่มีใบเสร็จอ้างถึงรูปนั้นแล้ว (ใช้ตอนลบใบเสร็จ)
-- n8n (service_role) และ SQL Editor ไม่ถูกจำกัดโดย trigger นี้ เพราะไม่มี auth.uid()

alter table public.receipts add column if not exists edited_by uuid references auth.users(id);
alter table public.receipts add column if not exists edited_at timestamptz;

create or replace function public.receipts_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- service_role / SQL Editor

  if new.workspace_id   is distinct from old.workspace_id
     or new.submitter_id is distinct from old.submitter_id
     or new.source       is distinct from old.source
     or new.image_path   is distinct from old.image_path
     or new.ref_no       is distinct from old.ref_no
     or new.confidence   is distinct from old.confidence
     or new.review_reason is distinct from old.review_reason
     or new.created_at   is distinct from old.created_at
     or new.edited_by    is distinct from old.edited_by
     or new.edited_at    is distinct from old.edited_at then
    raise exception 'this field cannot be changed' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    new.decided_by := auth.uid(); new.decided_at := now();
  else
    new.decided_by := old.decided_by; new.decided_at := old.decided_at;
  end if;

  if (new.vendor, new.txn_date, new.txn_time, new.amount, new.category, new.note, new.items)
     is distinct from (old.vendor, old.txn_date, old.txn_time, old.amount, old.category, old.note, old.items) then
    new.edited_by := auth.uid(); new.edited_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_receipts_guard_update on public.receipts;
create trigger trg_receipts_guard_update before update on public.receipts
  for each row execute function public.receipts_guard_update();

-- สิทธิ์แก้/ลบ: เหมือนเดิม แต่พนักงานต้องยังเป็นสมาชิกอยู่
drop policy if exists rc_update on public.receipts;
create policy rc_update on public.receipts for update to authenticated
  using (public.has_role(workspace_id, array['admin','accountant'])
         or (submitter_id = auth.uid() and status in ('pending','needs_review') and public.is_member(workspace_id)))
  with check (public.has_role(workspace_id, array['admin','accountant'])
         or (submitter_id = auth.uid() and status in ('pending','needs_review') and public.is_member(workspace_id)));

drop policy if exists rc_delete on public.receipts;
create policy rc_delete on public.receipts for delete to authenticated
  using (public.has_role(workspace_id, array['admin'])
         or (submitter_id = auth.uid() and status in ('pending','needs_review') and public.is_member(workspace_id)));

-- ลบรูปสลิป: ทำได้เฉพาะรูปที่ไม่มีใบเสร็จอ้างถึงแล้ว และอยู่ใน workspace ที่ผู้ใช้เป็นสมาชิก
-- (หน้าเว็บลบใบเสร็จก่อน แล้วค่อยลบรูป)
drop policy if exists receipts_obj_delete on storage.objects;
create policy receipts_obj_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipts'
    and exists (select 1 from public.memberships m
                where m.user_id = auth.uid() and m.workspace_id::text = (storage.foldername(name))[1])
    and not exists (select 1 from public.receipts r where r.image_path = name)
  );

-- ---------------------------------------------------------------- ทดสอบ (rollback ทิ้งทั้งหมด)
-- commit ก่อน: ถ้า SQL Editor ส่งทั้งไฟล์เป็นคำสั่งเดียว BEGIN ด้านล่างจะรวมกับทรานแซกชันของ DDL ด้านบน
-- แล้ว ROLLBACK ท้ายไฟล์จะย้อน DDL ทิ้งไปด้วย (ขึ้น "PASSED" แต่ trigger/policy ไม่อยู่จริง)
commit;
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
        org uuid; org2 uuid; rid uuid; rid2 uuid; n int; failed boolean; v text;
begin
  insert into auth.users(id, email) values (a, 'a@t.local'), (b, 'b@t.local'), (c, 'c@t.local');
  insert into public.workspaces(name, kind) values ('Org', 'org') returning id into org;
  insert into public.workspaces(name, kind) values ('Org2', 'org') returning id into org2;
  insert into public.memberships(workspace_id, user_id, role) values (org, a, 'admin'), (org, b, 'employee'), (org2, b, 'employee');
  -- ใบของพนักงาน b ยอดเกินเกณฑ์ -> pending
  insert into public.receipts(workspace_id, submitter_id, txn_date, amount, confidence, vendor, image_path)
    values (org, b, current_date, 6000, 0.9, 'Shop', org::text || '/img1.jpg') returning id into rid;
  assert (select status from public.receipts where id = rid) = 'pending', 'setup: expected pending';

  -- พนักงาน b แก้ร้าน/ยอดของตัวเองได้ และมีร่องรอย
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.receipts set vendor = 'Shop2', amount = 100 where id = rid;
  get diagnostics n = row_count;
  assert n = 1, '1: employee should edit own pending receipt';
  assert (select edited_by from public.receipts where id = rid) = b and (select edited_at from public.receipts where id = rid) is not null, '1: edit audit missing';

  -- ฟิลด์ที่ห้ามเปลี่ยน
  failed := false; begin update public.receipts set workspace_id = org2 where id = rid; exception when others then failed := true; end;
  assert failed, '2: workspace_id must be immutable';
  failed := false; begin update public.receipts set source = 'email' where id = rid; exception when others then failed := true; end;
  assert failed, '2: source must be immutable';
  failed := false; begin update public.receipts set image_path = org::text || '/someone-elses.jpg' where id = rid; exception when others then failed := true; end;
  assert failed, '2: image_path must be immutable';
  failed := false; begin update public.receipts set confidence = 1 where id = rid; exception when others then failed := true; end;
  assert failed, '2: confidence must be immutable';

  -- พนักงานอนุมัติตัวเองไม่ได้
  failed := false; begin update public.receipts set status = 'approved' where id = rid; exception when others then failed := true; end;
  assert failed, '3: employee must not approve own receipt';
  execute 'reset role';

  -- แอดมินอนุมัติได้ และ decided_by เป็นตัวเอง แม้พยายามปลอมเป็นคนอื่น
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.receipts set status = 'approved', decided_by = b where id = rid;
  assert (select decided_by from public.receipts where id = rid) = a, '4: decided_by must be set by the server';
  execute 'reset role';

  -- ใบที่อนุมัติแล้ว พนักงานแก้/ลบไม่ได้
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.receipts set vendor = 'Hacked' where id = rid; get diagnostics n = row_count;
  assert n = 0, '5: employee must not edit an approved receipt';
  delete from public.receipts where id = rid; get diagnostics n = row_count;
  assert n = 0, '5: employee must not delete an approved receipt';
  execute 'reset role';

  -- ใบ pending ของ b: ลบเองได้ แต่ถ้าโดนถอดจากบริษัทแล้ว ลบไม่ได้
  insert into public.receipts(workspace_id, submitter_id, txn_date, amount, confidence, vendor)
    values (org, b, current_date, 6000, 0.9, 'Shop3') returning id into rid2;
  delete from public.memberships where workspace_id = org and user_id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from public.receipts where id = rid2; get diagnostics n = row_count;
  assert n = 0, '6: removed member must not delete old receipts';
  update public.receipts set vendor = 'X' where id = rid2; get diagnostics n = row_count;
  assert n = 0, '6: removed member must not edit old receipts';
  execute 'reset role';

  -- คนนอกบริษัท (c) แก้/ลบไม่ได้
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from public.receipts where id = rid2; get diagnostics n = row_count;
  assert n = 0, '7: outsider must not delete';
  execute 'reset role';

  -- แอดมินลบได้
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from public.receipts where id = rid2; get diagnostics n = row_count;
  assert n = 1, '8: admin should delete';
  execute 'reset role';

  raise notice 'RECEIPT EDIT/DELETE TESTS PASSED';
end $$;
rollback;
