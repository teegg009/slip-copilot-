-- ฟังก์ชันฝั่ง LINE (เรียกจาก n8n ด้วย service_role เท่านั้น) รันใน Supabase > SQL Editor
-- ใช้ตรรกะในฐานข้อมูลแทนการต่อหลาย node ใน n8n: ทำงานเป็น transaction เดียว กันรหัสถูกใช้ซ้ำ
-- ผู้ใช้ทั่วไป (anon/authenticated) เรียกฟังก์ชันเหล่านี้ไม่ได้ เพราะรับ line_user_id จากผู้เรียก

-- workspace ส่วนตัวของผู้ใช้ (ตัวเก่าสุด)
create or replace function public.personal_workspace_of(p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select w.id from public.workspaces w
  join public.memberships m on m.workspace_id = w.id
  where m.user_id = p_user and w.kind = 'personal'
  order by w.created_at limit 1;
$$;

-- ด่าน Authorize ของ LINE: ผู้ส่งคือใคร อยู่ workspace ไหน บทบาทอะไร
-- คืน null ถ้ายังไม่ได้ผูกบัญชี; ถ้า workspace ที่เลือกไว้ไม่ใช่สมาชิกแล้ว ถอยกลับไปส่วนตัว
create or replace function public.resolve_line_user(p_line_user_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ll public.line_links; ws uuid; r text;
begin
  select * into ll from public.line_links where line_user_id = p_line_user_id;
  if not found then return null; end if;

  select m.role into r from public.memberships m
    where m.user_id = ll.user_id and m.workspace_id = ll.active_workspace_id;
  if found then
    ws := ll.active_workspace_id;
  else
    ws := public.personal_workspace_of(ll.user_id);
    select m.role into r from public.memberships m
      where m.user_id = ll.user_id and m.workspace_id = ws;
  end if;
  if ws is null then return null; end if;

  return jsonb_build_object(
    'user_id', ll.user_id, 'workspace_id', ws, 'role', r,
    'workspace_name', (select name from public.workspaces where id = ws),
    'workspace_kind', (select kind from public.workspaces where id = ws));
end $$;

-- "ผูก 123456": ผูก LINE กับบัญชีเว็บ
create or replace function public.link_line_account(p_code text, p_line_user_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare lc public.link_codes; ws uuid;
begin
  select * into lc from public.link_codes
    where code = p_code and used_at is null and expires_at > now() for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_or_expired'); end if;

  ws := public.personal_workspace_of(lc.user_id);
  insert into public.line_links(line_user_id, user_id, active_workspace_id)
    values (p_line_user_id, lc.user_id, ws)
    on conflict (line_user_id) do update
      set user_id = excluded.user_id, active_workspace_id = excluded.active_workspace_id;
  update public.link_codes set used_at = now() where code = lc.code;
  return jsonb_build_object('ok', true, 'user_id', lc.user_id);
end $$;

-- "เข้าร่วม 123456": พนักงานเข้าบริษัทด้วยรหัสเชิญ
-- ถ้าผู้ส่งยังไม่เคยผูกบัญชี ระบบสร้างบัญชีให้อัตโนมัติจากรหัส LINE (ล็อกอินเว็บไม่ได้ แต่ส่งสลิปได้)
-- ตรวจรหัสเชิญก่อนเสมอ: รหัสผิด/หมดอายุจะไม่สร้างบัญชีใดๆ
drop function if exists public.line_join_workspace(text, text);
create or replace function public.line_join_workspace(p_line_user_id text, p_code text, p_display_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ll public.line_links; inv public.invites; uid uuid; pws uuid; nm text;
begin
  select * into inv from public.invites
    where code = p_code and used_at is null and expires_at > now() for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_or_expired'); end if;

  select * into ll from public.line_links where line_user_id = p_line_user_id;
  if found then
    uid := ll.user_id;
  else
    uid := gen_random_uuid();
    nm := nullif(left(trim(coalesce(p_display_name, '')), 60), '');
    -- อีเมลปลอมที่ไม่มีวันส่งถึง (.invalid) ใช้แค่เป็นตัวระบุ; ไม่มีรหัสผ่าน จึงล็อกอินเว็บไม่ได้
    insert into auth.users(id, aud, role, email, raw_user_meta_data, created_at, updated_at)
      values (uid, 'authenticated', 'authenticated', 'line.' || md5(p_line_user_id) || '@line.invalid',
              jsonb_build_object('source', 'line', 'name', nm), now(), now());
    pws := public.personal_workspace_of(uid);   -- trigger handle_new_user สร้างให้แล้ว
    update public.workspaces set name = coalesce(nm, 'LINE …' || right(p_line_user_id, 4)) where id = pws;
    insert into public.line_links(line_user_id, user_id, active_workspace_id) values (p_line_user_id, uid, pws);
  end if;

  insert into public.memberships(workspace_id, user_id, role)
    values (inv.workspace_id, uid, inv.role)
    on conflict (workspace_id, user_id) do nothing;
  update public.invites set used_by = uid, used_at = now() where code = inv.code;
  update public.line_links set active_workspace_id = inv.workspace_id where line_user_id = p_line_user_id;

  return jsonb_build_object('ok', true, 'workspace_id', inv.workspace_id, 'role', inv.role,
    'workspace_name', (select name from public.workspaces where id = inv.workspace_id));
end $$;


-- คำสั่งเดียวใช้ได้ทุกกรณี: "ผูก ######"
--   ถ้าเป็นรหัสที่สร้างจากเว็บ  -> ผูก LINE กับบัญชีเว็บ
--   ถ้าเป็นรหัสเชิญของบริษัท   -> เข้าร่วมบริษัท (สร้างบัญชีให้อัตโนมัติถ้ายังไม่มี)
create or replace function public.line_connect(p_line_user_id text, p_code text, p_display_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if exists (select 1 from public.link_codes where code = p_code and used_at is null and expires_at > now()) then
    r := public.link_line_account(p_code, p_line_user_id);
    return r || jsonb_build_object('kind', 'link');
  end if;
  r := public.line_join_workspace(p_line_user_id, p_code, p_display_name);
  return r || jsonb_build_object('kind', 'join');
end $$;

-- "ใช้ส่วนตัว" / "ใช้ <ชื่อบริษัท>": สลับ workspace ที่ส่งสลิปเข้า
create or replace function public.line_set_workspace(p_line_user_id text, p_target text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ll public.line_links; ws uuid; wname text;
begin
  select * into ll from public.line_links where line_user_id = p_line_user_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_linked'); end if;

  if lower(trim(p_target)) in ('personal', 'ส่วนตัว') then
    ws := public.personal_workspace_of(ll.user_id);
  else
    select w.id into ws from public.workspaces w
      join public.memberships m on m.workspace_id = w.id
      where m.user_id = ll.user_id and lower(w.name) = lower(trim(p_target)) limit 1;
  end if;
  if ws is null then
    return jsonb_build_object('ok', false, 'error', 'not_found',
      'options', (select coalesce(jsonb_agg(w.name order by w.created_at), '[]'::jsonb)
                  from public.workspaces w join public.memberships m on m.workspace_id = w.id
                  where m.user_id = ll.user_id));
  end if;

  update public.line_links set active_workspace_id = ws where line_user_id = p_line_user_id;
  select name into wname from public.workspaces where id = ws;
  return jsonb_build_object('ok', true, 'workspace_id', ws, 'workspace_name', wname);
end $$;

-- สิทธิ์: เรียกได้เฉพาะ service_role (n8n)
revoke all on function public.personal_workspace_of(uuid),
  public.resolve_line_user(text), public.link_line_account(text, text),
  public.line_join_workspace(text, text, text), public.line_set_workspace(text, text),
  public.line_connect(text, text, text)
  from public, anon, authenticated;
grant execute on function public.personal_workspace_of(uuid),
  public.resolve_line_user(text), public.link_line_account(text, text),
  public.line_join_workspace(text, text, text), public.line_set_workspace(text, text),
  public.line_connect(text, text, text)
  to service_role;
