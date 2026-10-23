-- ทดสอบฟังก์ชันฝั่ง LINE (รันใน Supabase > SQL Editor หลังรัน line_functions.sql)
-- สร้างข้อมูลทดสอบแล้ว ROLLBACK ทั้งหมด; ไม่มี error = ผ่านทุกข้อ (ข้อที่พังจะขึ้นชื่อข้อ)
begin;

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  org uuid; res jsonb; failed boolean; n int;
begin
  insert into auth.users(id, email) values (a, 'a@test.local'), (b, 'b@test.local');
  insert into public.workspaces(name, kind) values ('Test Co', 'org') returning id into org;
  insert into public.memberships(workspace_id, user_id, role) values (org, a, 'admin');

  -- 1) ยังไม่ผูกบัญชี -> resolve ได้ null
  assert public.resolve_line_user('Ua') is null, '1: ยังไม่ผูกต้องได้ null';

  -- 2) ผูกด้วยรหัสถูกต้อง
  insert into public.link_codes(code, user_id) values ('111111', a);
  res := public.link_line_account('111111', 'Ua');
  assert (res->>'ok')::boolean, '2: ผูกบัญชีไม่สำเร็จ ' || res::text;
  res := public.resolve_line_user('Ua');
  assert res->>'workspace_kind' = 'personal' and res->>'role' = 'admin',
    '2: หลังผูกควรอยู่ workspace ส่วนตัวเป็น admin ได้ ' || coalesce(res::text, 'null');

  -- 3) ใช้รหัสซ้ำไม่ได้
  res := public.link_line_account('111111', 'Ux');
  assert not (res->>'ok')::boolean, '3: รหัสผูกใช้ซ้ำได้';

  -- 4) รหัสหมดอายุใช้ไม่ได้
  insert into public.link_codes(code, user_id, expires_at) values ('222222', b, now() - interval '1 minute');
  res := public.link_line_account('222222', 'Ub');
  assert not (res->>'ok')::boolean, '4: รหัสหมดอายุใช้ได้';

  -- 5) รหัสไม่มีอยู่จริง
  res := public.link_line_account('999999', 'Ub');
  assert not (res->>'ok')::boolean, '5: รหัสที่ไม่มีอยู่ใช้ได้';

  -- B ผูกบัญชี
  insert into public.link_codes(code, user_id) values ('444444', b);
  assert (public.link_line_account('444444', 'Ub')->>'ok')::boolean, 'setup: B ผูกไม่สำเร็จ';

  -- 6) รหัสเชิญผิด: ห้ามสร้างบัญชีให้คนแปลกหน้า
  n := (select count(*) from auth.users);
  res := public.line_join_workspace('Uz', '000000');
  assert res->>'error' = 'invalid_or_expired', '6: รหัสผิดต้องถูกปฏิเสธ ได้ ' || res::text;
  assert (select count(*) from auth.users) = n, '6: รหัสผิดแต่กลับสร้างบัญชี';
  assert public.resolve_line_user('Uz') is null, '6: รหัสผิดแต่กลับผูกบัญชี';

  -- 6b) คนที่ยังไม่เคยผูก ใช้รหัสเชิญที่ถูกต้อง -> สร้างบัญชีให้อัตโนมัติและเข้าบริษัทเลย
  insert into public.invites(code, workspace_id, role, created_by) values ('555555', org, 'employee', a);
  res := public.line_join_workspace('Uz', '555555', 'Somchai');
  assert (res->>'ok')::boolean and res->>'role' = 'employee', '6b: เข้าร่วมแบบไม่ผูกบัญชีไม่สำเร็จ ' || res::text;
  res := public.resolve_line_user('Uz');
  assert res->>'workspace_kind' = 'org' and res->>'role' = 'employee', '6b: ควรอยู่บริษัทเป็น employee ได้ ' || coalesce(res::text, 'null');
  assert (select count(*) from auth.users) = n + 1, '6b: ควรสร้างบัญชีเพิ่ม 1';
  assert exists (select 1 from public.workspaces w join public.memberships m on m.workspace_id = w.id
                 join public.line_links l on l.user_id = m.user_id
                 where l.line_user_id = 'Uz' and w.kind = 'personal' and w.name = 'Somchai'), '6b: workspace ส่วนตัวควรใช้ชื่อจาก LINE';
  -- 6c) รหัส 555555 ใช้ซ้ำไม่ได้
  res := public.line_join_workspace('Uy', '555555');
  assert not (res->>'ok')::boolean, '6c: รหัสเชิญใช้ซ้ำได้';
  -- 6d) คนเดิมใช้รหัสใหม่ -> ไม่สร้างบัญชีซ้ำ
  insert into public.invites(code, workspace_id, role, created_by) values ('666666', org, 'accountant', a);
  res := public.line_join_workspace('Uz', '666666');
  assert (res->>'ok')::boolean, '6d: คนเดิมเข้าร่วมซ้ำไม่ได้';
  assert (select count(*) from auth.users) = n + 1, '6d: ไม่ควรสร้างบัญชีซ้ำ';

  -- 7) เข้าร่วมด้วยรหัสเชิญ -> เป็นพนักงาน และสลับไปบริษัททันที
  insert into public.invites(code, workspace_id, role, created_by) values ('333333', org, 'employee', a);
  res := public.line_join_workspace('Ub', '333333');
  assert (res->>'ok')::boolean and res->>'role' = 'employee', '7: เข้าร่วมไม่สำเร็จ ' || res::text;
  res := public.resolve_line_user('Ub');
  assert res->>'workspace_kind' = 'org' and res->>'role' = 'employee',
    '7: ควรอยู่บริษัทเป็น employee ได้ ' || res::text;

  -- 8) รหัสเชิญใช้ซ้ำไม่ได้
  res := public.line_join_workspace('Ua', '333333');
  assert not (res->>'ok')::boolean, '8: รหัสเชิญใช้ซ้ำได้';

  -- 9) สลับ workspace
  res := public.line_set_workspace('Ub', 'ส่วนตัว');
  assert (res->>'ok')::boolean, '9: สลับไปส่วนตัวไม่ได้';
  assert public.resolve_line_user('Ub')->>'workspace_kind' = 'personal', '9: ยังไม่ได้อยู่ส่วนตัว';
  res := public.line_set_workspace('Ub', 'test co');
  assert (res->>'ok')::boolean and public.resolve_line_user('Ub')->>'workspace_kind' = 'org',
    '9: สลับกลับบริษัทไม่ได้';

  -- 10) ชื่อไม่ตรง -> not_found พร้อมรายการตัวเลือก
  res := public.line_set_workspace('Ub', 'ไม่มีบริษัทนี้');
  assert res->>'error' = 'not_found' and jsonb_array_length(res->'options') = 2,
    '10: ควรได้ not_found พร้อมตัวเลือก 2 ที่ ได้ ' || res::text;

  -- 11) ถูกถอดจากบริษัทแล้ว resolve ต้องถอยกลับไปส่วนตัว (ไม่ค้างสิทธิ์เก่า)
  delete from public.memberships where workspace_id = org and user_id = b;
  assert public.resolve_line_user('Ub')->>'workspace_kind' = 'personal',
    '11: ถูกถอดแล้วยังเข้าบริษัทได้';

  -- 12) ผู้ใช้ทั่วไป (authenticated) เรียกฟังก์ชันเหล่านี้ไม่ได้
  failed := false;
  begin
    execute 'set local role authenticated';
    perform public.resolve_line_user('Ua');
  exception when insufficient_privilege then failed := true; end;
  execute 'reset role';
  assert failed, '12: authenticated เรียก resolve_line_user ได้ (ควรทำไม่ได้)';


  -- 13) line_connect: รหัสจากเว็บ -> ผูกบัญชี
  insert into public.link_codes(code, user_id) values ('777777', a);
  res := public.line_connect('Uc1', '777777');
  assert (res->>'ok')::boolean and res->>'kind' = 'link', '13: รหัสจากเว็บควรผูกบัญชี ' || res::text;
  assert public.resolve_line_user('Uc1')->>'workspace_kind' = 'personal', '13: ควรอยู่ส่วนตัวหลังผูก';

  -- 14) line_connect: รหัสเชิญ -> เข้าร่วมบริษัท (คนใหม่ ไม่ต้องผูกก่อน)
  insert into public.invites(code, workspace_id, role, created_by) values ('888888', org, 'employee', a);
  res := public.line_connect('Uc2', '888888', 'Nok');
  assert (res->>'ok')::boolean and res->>'kind' = 'join', '14: รหัสเชิญควรเข้าร่วมบริษัท ' || res::text;
  assert public.resolve_line_user('Uc2')->>'workspace_kind' = 'org', '14: ควรอยู่บริษัท';

  -- 15) line_connect: รหัสที่ไม่มีจริง -> ปฏิเสธ
  res := public.line_connect('Uc3', '123123');
  assert not (res->>'ok')::boolean, '15: รหัสที่ไม่มีจริงต้องถูกปฏิเสธ';
  assert public.resolve_line_user('Uc3') is null, '15: ไม่ควรสร้างบัญชี';

  raise notice 'ALL LINE FUNCTION TESTS PASSED';
end $$;

rollback;
