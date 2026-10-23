-- เสริมความปลอดภัยรอบสอง (รันใน Supabase > SQL Editor ครั้งเดียว รันซ้ำได้)
-- รันหลัง schema.sql, line_functions.sql, storage_policy.sql, email_personal_only.sql, receipt_edit.sql
--
-- 1) ผู้ใช้ (authenticated) สร้างใบเสร็จได้เฉพาะฟิลด์ธรรมดา: ห้ามตั้ง image_path / decided_* / edited_* เอง
--    และ confidence ใช้ได้เฉพาะรายการอีเมล (กันพนักงานใส่ 1.0 เพื่อเลี่ยง "รอตรวจ")
-- 2) workspaces: แอดมินแก้ได้เฉพาะ name, auto_approve_limit, min_confidence (แก้ kind ไม่ได้)
-- 3) ลบรูปใน Storage ได้เฉพาะแอดมิน/ฝ่ายบัญชี และเฉพาะรูปที่ไม่มีใบเสร็จอ้างถึง
-- 4) เดารหัส LINE: ผิดเกิน 5 ครั้งใน 10 นาที (ต่อ LINE user) ถูกบล็อกชั่วคราว

-- คอลัมน์ร่องรอยการแก้ไข (ซ้ำกับ receipt_edit.sql โดยตั้งใจ เพื่อให้ไฟล์นี้รันได้ไม่ว่าลำดับไหน)
alter table public.receipts add column if not exists edited_by uuid references auth.users(id);
alter table public.receipts add column if not exists edited_at timestamptz;

-- ---------------------------------------------------------------- 1) insert guard
create or replace function public.receipts_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- service_role / SQL Editor (n8n)
  if new.source not in ('web', 'email') then
    raise exception 'source not allowed' using errcode = '42501';
  end if;
  new.image_path    := null;
  new.decided_by    := null;
  new.decided_at    := null;
  new.edited_by     := null;
  new.edited_at     := null;
  new.review_reason := null;
  if new.source <> 'email' then new.confidence := null; end if;
  return new;
end $$;

drop trigger if exists trg_receipts_guard_insert on public.receipts;
create trigger trg_receipts_guard_insert before insert on public.receipts
  for each row execute function public.receipts_guard_insert();

-- ---------------------------------------------------------------- 2) ล็อก workspaces.kind
revoke update on public.workspaces from authenticated;
grant update (name, auto_approve_limit, min_confidence) on public.workspaces to authenticated;

-- ---------------------------------------------------------------- 3) ลบรูป: แอดมิน/ฝ่ายบัญชีเท่านั้น
drop policy if exists receipts_obj_delete on storage.objects;
create policy receipts_obj_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipts'
    and exists (select 1 from public.memberships m
                where m.user_id = (select auth.uid())
                  and m.workspace_id::text = (storage.foldername(name))[1]
                  and m.role in ('admin', 'accountant'))
    and not exists (select 1 from public.receipts r where r.image_path = name)
  );

-- ---------------------------------------------------------------- 4) จำกัดการเดารหัส LINE
create table if not exists public.line_attempts (
  line_user_id text not null,
  at           timestamptz not null default now()
);
create index if not exists idx_line_attempts on public.line_attempts (line_user_id, at desc);
alter table public.line_attempts enable row level security;   -- ไม่มี policy = ผู้ใช้ทั่วไปเข้าไม่ได้
revoke all on public.line_attempts from anon, authenticated;
grant all on public.line_attempts to service_role;

create or replace function public.line_connect(p_line_user_id text, p_code text, p_display_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  delete from public.line_attempts where at < now() - interval '1 day';
  if (select count(*) from public.line_attempts
      where line_user_id = p_line_user_id and at > now() - interval '10 minutes') >= 5 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  if exists (select 1 from public.link_codes where code = p_code and used_at is null and expires_at > now()) then
    r := public.link_line_account(p_code, p_line_user_id) || jsonb_build_object('kind', 'link');
  else
    r := public.line_join_workspace(p_line_user_id, p_code, p_display_name) || jsonb_build_object('kind', 'join');
  end if;

  if coalesce((r ->> 'ok')::boolean, false) = false then
    insert into public.line_attempts(line_user_id) values (p_line_user_id);
  end if;
  return r;
end $$;

revoke execute on function public.line_connect(text, text, text) from public, anon, authenticated;
grant execute on function public.line_connect(text, text, text) to service_role;

-- ---------------------------------------------------------------- ทดสอบ (rollback ทิ้งทั้งหมด)
commit;
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
        org uuid; failed boolean; rid uuid; ip text; i int; r jsonb;
begin
  insert into auth.users(id, email) values (a, 'ha@t.local'), (b, 'hb@t.local');
  insert into public.workspaces(name, kind) values ('Org', 'org') returning id into org;
  insert into public.memberships(workspace_id, user_id, role) values (org, a, 'admin'), (org, b, 'employee');

  -- พนักงานใส่ฟิลด์ต้องห้ามตอน insert -> ถูกล้างทิ้ง
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.receipts(workspace_id, submitter_id, txn_date, amount, source, image_path, confidence, decided_by, edited_by, review_reason)
    values (org, b, current_date, 10, 'web', org::text || '/x.jpg', 1, a, a, 'x') returning id into rid;
  failed := false;
  begin insert into public.receipts(workspace_id, submitter_id, txn_date, amount, source) values (org, b, current_date, 10, 'line');
  exception when others then failed := true; end;
  assert failed, '1: user insert with source=line must be rejected';
  execute 'reset role';
  assert (select image_path from public.receipts where id = rid) is null, '1: image_path must be cleared';
  assert (select confidence from public.receipts where id = rid) is null, '1: confidence must be cleared';
  assert (select decided_by from public.receipts where id = rid) is null, '1: decided_by must be cleared';
  assert (select review_reason from public.receipts where id = rid) is null, '1: review_reason must be cleared';

  -- แอดมินแก้ kind ไม่ได้ แต่แก้ชื่อได้
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  failed := false;
  begin update public.workspaces set kind = 'personal' where id = org; exception when others then failed := true; end;
  assert failed, '2: kind must not be updatable';
  update public.workspaces set name = 'Org renamed' where id = org;
  execute 'reset role';
  assert (select name from public.workspaces where id = org) = 'Org renamed', '2: name should be updatable';

  -- เดารหัสผิด 5 ครั้ง แล้วครั้งที่ 6 ถูกบล็อก
  for i in 1..5 loop
    r := public.line_connect('Utest', '000000', null);
    assert r ->> 'error' = 'invalid_or_expired', '4: attempt ' || i || ' should fail normally';
  end loop;
  r := public.line_connect('Utest', '000000', null);
  assert r ->> 'error' = 'too_many_attempts', '4: 6th attempt must be blocked';

  raise notice 'HARDENING TESTS PASSED';
end $$;
rollback;
