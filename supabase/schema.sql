-- SME Slip Copilot: multi-workspace schema for Supabase
-- รันทั้งไฟล์ใน Supabase > SQL Editor ได้เลย (รันซ้ำได้ ไม่พัง)
--
-- แนวคิด: 1 workspace = พื้นที่ทำงานหนึ่งแห่ง เป็น 'personal' (คนเดียว) หรือ 'org' (บริษัท)
-- ผู้ใช้อยู่ได้หลาย workspace ผ่านตาราง memberships พร้อมบทบาท admin | accountant | employee
--
-- หมายเหตุสิทธิ์: RLS ป้องกันทางเว็บ/ไคลเอนต์ที่ใช้ JWT ของผู้ใช้
-- แต่ n8n ที่ใช้ service_role key จะ "ข้าม RLS" ทุกกรณี
-- ดังนั้นทุกคำสั่ง SQL/API จาก n8n ต้องกรอง workspace_id เองเสมอ

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null check (kind in ('personal', 'org')),
  -- ยอดสูงสุดที่ผ่านอัตโนมัติ ถ้าเกินนี้ต้องให้คนอนุมัติ (null = ไม่จำกัด)
  auto_approve_limit numeric(12,2) default 5000,
  -- ความมั่นใจของ AI ขั้นต่ำที่ผ่านอัตโนมัติ
  min_confidence     numeric(3,2)  default 0.85,
  created_at  timestamptz not null default now()
);

create table if not exists public.memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('admin', 'accountant', 'employee')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists idx_memberships_user on public.memberships(user_id);

-- ผูก LINE กับผู้ใช้ และจำว่าตอนนี้ส่งสลิปเข้า workspace ไหน
create table if not exists public.line_links (
  line_user_id        text primary key,
  user_id             uuid not null references auth.users(id) on delete cascade,
  active_workspace_id uuid references public.workspaces(id) on delete set null,
  created_at          timestamptz not null default now()
);

-- รหัสผูกบัญชี LINE (6 หลัก, หมดอายุ 10 นาที) ผู้ใช้สร้างจากเว็บ
create table if not exists public.link_codes (
  code        text primary key check (code ~ '^\d{6}$'),
  user_id     uuid not null references auth.users(id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '10 minutes',
  used_at     timestamptz
);

-- รหัสเชิญพนักงานเข้าบริษัท
create table if not exists public.invites (
  code         text primary key check (code ~ '^\d{6}$'),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role         text not null default 'employee' check (role in ('accountant', 'employee')),
  created_by   uuid not null references auth.users(id),
  expires_at   timestamptz not null default now() + interval '7 days',
  used_by      uuid references auth.users(id),
  used_at      timestamptz
);

create table if not exists public.receipts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  submitter_id  uuid not null references auth.users(id),
  ref_no        text,                      -- รหัสอ้างอิงบนสลิป ใช้กันซ้ำ
  txn_date      date not null,
  txn_time      time,
  vendor        text,
  amount        numeric(12,2) not null check (amount > 0),
  category      text not null default 'other'
                check (category in ('food','transport','shopping','utilities','health','other')),
  items         jsonb not null default '[]'::jsonb,   -- รายการย่อยในใบเสร็จ
  source        text not null default 'web' check (source in ('line','web','email')),
  status        text not null default 'pending'
                check (status in ('pending','needs_review','approved','rejected')),
  confidence    numeric(3,2),
  review_reason text,
  image_path    text,                      -- path ใน bucket receipts: <workspace_id>/<ไฟล์>
  note          text,
  created_at    timestamptz not null default now(),
  decided_by    uuid references auth.users(id),
  decided_at    timestamptz
);
-- กันสลิปซ้ำภายใน workspace เดียวกัน (ref_no ว่างได้หลายแถว)
create unique index if not exists uq_receipts_ws_ref
  on public.receipts(workspace_id, ref_no) where ref_no is not null;
create index if not exists idx_receipts_ws_date on public.receipts(workspace_id, txn_date desc);
create index if not exists idx_receipts_submitter on public.receipts(submitter_id);

-- ------------------------------------------------------- helper functions
-- security definer เพื่อไม่ให้นโยบาย RLS เรียกวนตัวเอง
create or replace function public.is_member(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
                 where m.workspace_id = ws and m.user_id = auth.uid());
$$;

create or replace function public.has_role(ws uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
                 where m.workspace_id = ws and m.user_id = auth.uid() and m.role = any(roles));
$$;

-- สมัครผู้ใช้ใหม่ -> สร้าง workspace ส่วนตัวให้อัตโนมัติ
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  insert into public.workspaces(name, kind)
    values (coalesce(split_part(new.email, '@', 1), 'ส่วนตัว'), 'personal')
    returning id into ws;
  insert into public.memberships(workspace_id, user_id, role) values (ws, new.id, 'admin');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- สร้างบริษัท (ผู้เรียกเป็น admin)
create or replace function public.create_org(org_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(trim(org_name), '') = '' then raise exception 'name required'; end if;
  insert into public.workspaces(name, kind) values (trim(org_name), 'org') returning id into ws;
  insert into public.memberships(workspace_id, user_id, role) values (ws, auth.uid(), 'admin');
  return ws;
end $$;

-- แอดมินสร้างรหัสเชิญ
create or replace function public.create_invite(ws uuid, invite_role text default 'employee')
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.has_role(ws, array['admin']) then raise exception 'forbidden'; end if;
  loop
    c := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.invites where code = c);
  end loop;
  insert into public.invites(code, workspace_id, role, created_by) values (c, ws, invite_role, auth.uid());
  return c;
end $$;

-- พนักงานใช้รหัสเข้าร่วมบริษัท
create or replace function public.join_workspace(invite_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.invites;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into inv from public.invites
    where code = invite_code and used_at is null and expires_at > now() for update;
  if not found then raise exception 'invalid or expired code'; end if;
  insert into public.memberships(workspace_id, user_id, role)
    values (inv.workspace_id, auth.uid(), inv.role)
    on conflict (workspace_id, user_id) do nothing;
  update public.invites set used_by = auth.uid(), used_at = now() where code = inv.code;
  return inv.workspace_id;
end $$;

-- ตัดสินใจสถานะอัตโนมัติ: ผ่านเองเมื่อมั่นใจสูงและยอดไม่เกินเกณฑ์ ไม่งั้นรอตรวจ
-- (ใช้ตอน insert จาก n8n/เว็บ; ผู้ใช้กำหนด status เองตอน insert ไม่ได้)
create or replace function public.receipts_set_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare ws public.workspaces;
begin
  select * into ws from public.workspaces where id = new.workspace_id;
  if ws.kind = 'personal' then
    new.status := 'approved';
  elsif new.confidence is not null and new.confidence < coalesce(ws.min_confidence, 0.85) then
    new.status := 'needs_review';
    new.review_reason := coalesce(new.review_reason, 'AI มั่นใจต่ำ');
  elsif ws.auto_approve_limit is not null and new.amount > ws.auto_approve_limit then
    new.status := 'pending';
    new.review_reason := coalesce(new.review_reason, 'ยอดเกินเกณฑ์ที่ตั้งไว้');
  else
    new.status := 'approved';
  end if;
  return new;
end $$;

drop trigger if exists trg_receipts_set_status on public.receipts;
create trigger trg_receipts_set_status before insert on public.receipts
  for each row execute function public.receipts_set_status();

-- -------------------------------------------------------------- RLS
alter table public.workspaces  enable row level security;
alter table public.memberships enable row level security;
alter table public.line_links  enable row level security;
alter table public.link_codes  enable row level security;
alter table public.invites     enable row level security;
alter table public.receipts    enable row level security;

drop policy if exists ws_select on public.workspaces;
create policy ws_select on public.workspaces for select to authenticated
  using (public.is_member(id));
drop policy if exists ws_update on public.workspaces;
create policy ws_update on public.workspaces for update to authenticated
  using (public.has_role(id, array['admin'])) with check (public.has_role(id, array['admin']));

drop policy if exists mem_select on public.memberships;
create policy mem_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.has_role(workspace_id, array['admin','accountant']));
drop policy if exists mem_delete on public.memberships;
create policy mem_delete on public.memberships for delete to authenticated
  using (public.has_role(workspace_id, array['admin']) and user_id <> auth.uid());

drop policy if exists line_select on public.line_links;
create policy line_select on public.line_links for select to authenticated
  using (user_id = auth.uid());

drop policy if exists code_select on public.link_codes;
create policy code_select on public.link_codes for select to authenticated
  using (user_id = auth.uid());
drop policy if exists code_insert on public.link_codes;
create policy code_insert on public.link_codes for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists inv_select on public.invites;
create policy inv_select on public.invites for select to authenticated
  using (public.has_role(workspace_id, array['admin']));

-- ใบเสร็จ: แอดมิน/บัญชีเห็นทั้งบริษัท พนักงานเห็นเฉพาะของตัวเอง
drop policy if exists rc_select on public.receipts;
create policy rc_select on public.receipts for select to authenticated
  using (public.has_role(workspace_id, array['admin','accountant'])
         or (submitter_id = auth.uid() and public.is_member(workspace_id)));

drop policy if exists rc_insert on public.receipts;
create policy rc_insert on public.receipts for insert to authenticated
  with check (submitter_id = auth.uid() and public.is_member(workspace_id));

drop policy if exists rc_update on public.receipts;
create policy rc_update on public.receipts for update to authenticated
  using (public.has_role(workspace_id, array['admin','accountant'])
         or (submitter_id = auth.uid() and status in ('pending','needs_review')))
  with check (public.has_role(workspace_id, array['admin','accountant'])
         or (submitter_id = auth.uid() and status in ('pending','needs_review')));

drop policy if exists rc_delete on public.receipts;
create policy rc_delete on public.receipts for delete to authenticated
  using (public.has_role(workspace_id, array['admin'])
         or (submitter_id = auth.uid() and status in ('pending','needs_review')));

-- ------------------------------------------------------------ grants
-- ตั้ง "Automatically expose new tables" ไว้ปิด จึงต้องให้สิทธิ์เอง
grant usage on schema public to authenticated, service_role;
revoke all on all tables in schema public from anon;
grant select, update                 on public.workspaces  to authenticated;
grant select, delete                 on public.memberships to authenticated;
grant select                         on public.line_links  to authenticated;
grant select, insert                 on public.link_codes  to authenticated;
grant select                         on public.invites     to authenticated;
grant select, insert, update, delete on public.receipts    to authenticated;
grant all on all tables in schema public to service_role;
grant execute on function public.is_member(uuid), public.has_role(uuid, text[]),
  public.create_org(text), public.create_invite(uuid, text), public.join_workspace(text)
  to authenticated;

-- ------------------------------------------------------ storage (รูปสลิป)
-- bucket ส่วนตัว เก็บเป็น <workspace_id>/<ไฟล์> ผู้ใช้เห็นเฉพาะ workspace ที่เป็นสมาชิก
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false)
  on conflict (id) do nothing;

drop policy if exists receipts_obj_select on storage.objects;
create policy receipts_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.workspace_id::text = (storage.foldername(name))[1]));

drop policy if exists receipts_obj_insert on storage.objects;
create policy receipts_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.workspace_id::text = (storage.foldername(name))[1]));
