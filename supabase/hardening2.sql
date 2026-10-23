-- เสริมความปลอดภัยรอบสาม (รันใน Supabase > SQL Editor ครั้งเดียว รันซ้ำได้) รันหลัง hardening.sql
-- วางทั้งไฟล์แล้วกด Run (ไม่ต้องเลือกข้อความ)
--
-- 1) รหัสเชื่อม LINE (link_codes) สร้างได้เฉพาะผ่านฟังก์ชันฝั่งเซิร์ฟเวอร์ create_link_code()
--    เดิมผู้ใช้ที่ล็อกอินแล้วสร้างแถวเองได้ จึงตั้งรหัสล่วงหน้าไว้ดักจับ LINE ของคนอื่นเข้าบัญชีตัวเองได้
-- 2) LINE ที่ผูกกับบัญชีหนึ่งแล้ว ห้ามถูกผูกทับไปบัญชีอื่น
-- 3) รหัสเชิญไม่ซ้ำกับรหัสเชื่อมที่ยังใช้ได้ และสุ่มด้วยแหล่งที่เดายาก
-- 4) join_workspace เปิดให้เรียกจากเบราว์เซอร์ไม่ได้อีก (การเข้าร่วมทำผ่านบอท LINE ซึ่งจำกัดการเดารหัสไว้แล้ว)
-- 5) รูปใน Storage: ผู้ใช้อัปโหลดเองไม่ได้ (อัปโหลดทำโดย n8n เท่านั้น), จำกัดขนาดไฟล์,
--    และสมาชิกที่ถูกถอดแล้วเปิดรูปเก่าของตัวเองไม่ได้
-- 6) ฟังก์ชันที่ผู้ไม่ล็อกอิน (anon) ไม่ควรเรียกได้ ถูกถอนสิทธิ์

-- ---------------------------------------------------------------- 1) สร้างรหัสเชื่อมฝั่งเซิร์ฟเวอร์
drop policy if exists code_insert on public.link_codes;
revoke insert on public.link_codes from authenticated;

create or replace function public.create_link_code()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c text; r public.link_codes; tries int := 0;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  -- ผู้ใช้หนึ่งคนมีรหัสที่ยังไม่ใช้ได้ทีละหนึ่งรหัส (ขอใหม่ = แทนที่ของเดิม)
  delete from public.link_codes where user_id = auth.uid();
  loop
    c := lpad((abs(('x' || substr(md5(gen_random_uuid()::text), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
    exit when not exists (select 1 from public.link_codes where code = c)
          and not exists (select 1 from public.invites where code = c and used_at is null and expires_at > now());
    tries := tries + 1;
    if tries > 20 then raise exception 'try again'; end if;
  end loop;
  insert into public.link_codes(code, user_id) values (c, auth.uid()) returning * into r;
  return jsonb_build_object('code', r.code, 'expires_at', r.expires_at);
end $$;

-- ---------------------------------------------------------------- 2) ห้ามผูก LINE ทับบัญชีอื่น
create or replace function public.link_line_account(p_code text, p_line_user_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare lc public.link_codes; ws uuid; existing uuid;
begin
  select * into lc from public.link_codes
    where code = p_code and used_at is null and expires_at > now() for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_or_expired'); end if;

  select user_id into existing from public.line_links where line_user_id = p_line_user_id;
  if found and existing <> lc.user_id then
    return jsonb_build_object('ok', false, 'error', 'already_linked');
  end if;

  ws := public.personal_workspace_of(lc.user_id);
  insert into public.line_links(line_user_id, user_id, active_workspace_id)
    values (p_line_user_id, lc.user_id, ws)
    on conflict (line_user_id) do update set active_workspace_id = excluded.active_workspace_id;
  update public.link_codes set used_at = now() where code = lc.code;
  return jsonb_build_object('ok', true, 'user_id', lc.user_id);
end $$;

-- ---------------------------------------------------------------- 3) รหัสเชิญไม่ชนรหัสเชื่อม
create or replace function public.create_invite(ws uuid, invite_role text default 'employee')
returns text language plpgsql security definer set search_path = public as $$
declare c text; tries int := 0;
begin
  if not public.has_role(ws, array['admin']) then raise exception 'forbidden'; end if;
  loop
    c := lpad((abs(('x' || substr(md5(gen_random_uuid()::text), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
    exit when not exists (select 1 from public.invites where code = c)
          and not exists (select 1 from public.link_codes where code = c and used_at is null and expires_at > now());
    tries := tries + 1;
    if tries > 20 then raise exception 'try again'; end if;
  end loop;
  insert into public.invites(code, workspace_id, role, created_by) values (c, ws, invite_role, auth.uid());
  return c;
end $$;

-- ---------------------------------------------------------------- 4) + 6) สิทธิ์เรียกฟังก์ชัน
revoke execute on function public.is_member(uuid), public.has_role(uuid, text[]), public.create_org(text),
  public.create_invite(uuid, text), public.join_workspace(text), public.create_link_code() from public, anon;
revoke execute on function public.join_workspace(text) from authenticated;
grant execute on function public.create_link_code() to authenticated;
grant execute on function public.is_member(uuid), public.has_role(uuid, text[]), public.create_org(text),
  public.create_invite(uuid, text) to authenticated;

-- ---------------------------------------------------------------- 5) Storage
drop policy if exists receipts_obj_insert on storage.objects;   -- อัปโหลดโดย n8n (service_role) เท่านั้น
update storage.buckets set file_size_limit = 10485760 where id = 'receipts';   -- 10 MB

drop policy if exists receipts_obj_select on storage.objects;
create policy receipts_obj_select on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts' and (
      exists (select 1 from public.memberships m
              where m.user_id = (select auth.uid())
                and m.workspace_id::text = (storage.foldername(name))[1]
                and m.role in ('admin', 'accountant'))
      or exists (select 1 from public.receipts r
                 where r.image_path = name and r.submitter_id = (select auth.uid())
                   and public.is_member(r.workspace_id))   -- ต้องยังเป็นสมาชิกอยู่
    )
  );

-- ---------------------------------------------------------------- ทดสอบ (rollback ทิ้งทั้งหมด)
commit;
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
        failed boolean; r jsonb; n int; c1 text; c2 text;
begin
  insert into auth.users(id, email) values (a, 'h2a@t.local'), (b, 'h2b@t.local');

  -- ผู้ใช้สร้างแถวใน link_codes เองไม่ได้
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  failed := false;
  begin insert into public.link_codes(code, user_id) values ('999999', a); exception when others then failed := true; end;
  assert failed, '1: direct insert into link_codes must be rejected';

  -- แต่ขอรหัสผ่านฟังก์ชันได้ และมีรหัสที่ใช้ได้ทีละหนึ่งรหัส
  r := public.create_link_code(); c1 := r ->> 'code';
  assert c1 ~ '^\d{6}$', '1: code must be 6 digits';
  r := public.create_link_code(); c2 := r ->> 'code';
  execute 'reset role';
  select count(*) into n from public.link_codes where user_id = a and used_at is null;
  assert n = 1, '1: only one active code per user, got ' || n;

  -- LINE ที่ผูกกับ a แล้ว ผูกทับไปบัญชี b ไม่ได้
  r := public.link_line_account(c2, 'Uhard2');
  assert (r ->> 'ok')::boolean, '2: first link should work';
  insert into public.link_codes(code, user_id) values ('555555', b);   -- เซิร์ฟเวอร์/SQL Editor ใส่ได้
  r := public.link_line_account('555555', 'Uhard2');
  assert r ->> 'error' = 'already_linked', '2: re-binding a linked LINE user must be refused';
  assert (select user_id from public.line_links where line_user_id = 'Uhard2') = a, '2: link must still belong to a';

  -- ผู้ใช้เรียก join_workspace จากเบราว์เซอร์ไม่ได้ และ anon เรียก create_org ไม่ได้
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  failed := false;
  begin perform public.join_workspace('123456'); exception when others then failed := true; end;
  assert failed, '4: join_workspace must not be callable by authenticated';
  execute 'reset role';
  execute 'set local role anon';
  failed := false;
  begin perform public.create_org('x'); exception when others then failed := true; end;
  assert failed, '6: anon must not call create_org';
  execute 'reset role';

  raise notice 'HARDENING2 TESTS PASSED';
end $$;
rollback;
