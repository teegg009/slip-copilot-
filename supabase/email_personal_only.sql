-- รายการที่มาจากอีเมล (source = 'email') รับได้เฉพาะ workspace ส่วนตัวเท่านั้น
-- รันใน Supabase > SQL Editor ครั้งเดียว (รันซ้ำได้)
--
-- ทำไมต้องบังคับที่ฐานข้อมูล: ปุ่มสแกน Gmail ในหน้าเว็บซ่อนอยู่ในบริษัทอยู่แล้ว แต่ถ้ามีคนเรียก API ตรงๆ
-- ด้วยสิทธิ์ของตัวเอง ฐานข้อมูลก็ยังต้องปฏิเสธ เพื่อกันอีเมลส่วนตัวไหลเข้าบริษัท

create or replace function public.receipts_email_personal_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'email'
     and coalesce((select kind from public.workspaces where id = new.workspace_id), '') <> 'personal' then
    raise exception 'email import is only allowed in a personal workspace'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_receipts_email_personal_only on public.receipts;
create trigger trg_receipts_email_personal_only
  before insert or update of source, workspace_id on public.receipts
  for each row execute function public.receipts_email_personal_only();

-- ทดสอบ (ไม่ทิ้งข้อมูล): สร้างผู้ใช้ชั่วคราว ลองใส่รายการอีเมลใน workspace ส่วนตัว (ต้องผ่าน) และบริษัท (ต้องถูกปฏิเสธ)
-- commit ก่อน: กัน BEGIN ด้านล่างรวมกับทรานแซกชันของ DDL ด้านบนแล้วถูก ROLLBACK ท้ายไฟล์ย้อนทิ้งทั้งหมด
commit;
begin;
do $$
declare u uuid := gen_random_uuid(); pws uuid; org uuid; failed boolean := false;
begin
  insert into auth.users(id, email) values (u, 'email_test@test.local');
  pws := public.personal_workspace_of(u);
  insert into public.workspaces(name, kind) values ('Test Co', 'org') returning id into org;
  insert into public.memberships(workspace_id, user_id, role) values (org, u, 'admin');

  insert into public.receipts(workspace_id, submitter_id, ref_no, txn_date, amount, source)
    values (pws, u, 'gmail:test1', current_date, 10, 'email');          -- ส่วนตัว: ต้องผ่าน

  begin
    insert into public.receipts(workspace_id, submitter_id, ref_no, txn_date, amount, source)
      values (org, u, 'gmail:test2', current_date, 10, 'email');         -- บริษัท: ต้องถูกปฏิเสธ
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'email receipt was accepted into a company workspace';

  -- ช่องทางอื่นในบริษัทยังใช้ได้ตามปกติ
  insert into public.receipts(workspace_id, submitter_id, ref_no, txn_date, amount, source)
    values (org, u, 'line:test3', current_date, 10, 'line');
  raise notice 'EMAIL PERSONAL-ONLY TESTS PASSED';
end $$;
rollback;
