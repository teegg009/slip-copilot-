-- ทดสอบการแยกข้อมูลระหว่าง workspace (รันใน Supabase > SQL Editor)
-- สร้างผู้ใช้ทดสอบ 3 คน ทดสอบสิทธิ์ แล้ว ROLLBACK ทั้งหมด ไม่ทิ้งข้อมูลไว้
-- ผ่าน: ขึ้น NOTICE "ALL RLS TESTS PASSED"  ไม่ผ่าน: ขึ้น error พร้อมชื่อข้อที่พัง
begin;

do $$
declare
  a uuid := gen_random_uuid();   -- แอดมินบริษัท
  b uuid := gen_random_uuid();   -- พนักงาน
  c uuid := gen_random_uuid();   -- คนนอก
  org uuid; n int; failed boolean; code text; st text;
begin
  insert into auth.users(id, email) values
    (a, 'a_admin@test.local'), (b, 'b_emp@test.local'), (c, 'c_out@test.local');

  -- A สร้างบริษัท
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  org := public.create_org('Test Co');

  -- 1) ยอดปกติ + มั่นใจสูง -> approved
  insert into public.receipts(workspace_id, submitter_id, ref_no, txn_date, amount, confidence)
    values (org, a, 'R1', current_date, 100, 0.95);
  select status into st from public.receipts where ref_no = 'R1';
  assert st = 'approved', '1: ยอดปกติควรผ่านอัตโนมัติ ได้ ' || coalesce(st, 'null');

  -- 2) ยอดเกินเกณฑ์ -> pending
  insert into public.receipts(workspace_id, submitter_id, ref_no, txn_date, amount, confidence)
    values (org, a, 'R2', current_date, 9000, 0.95);
  select status into st from public.receipts where ref_no = 'R2';
  assert st = 'pending', '2: ยอดเกินเกณฑ์ควรรออนุมัติ ได้ ' || coalesce(st, 'null');

  -- 3) AI มั่นใจต่ำ -> needs_review
  insert into public.receipts(workspace_id, submitter_id, ref_no, txn_date, amount, confidence)
    values (org, a, 'R3', current_date, 100, 0.40);
  select status into st from public.receipts where ref_no = 'R3';
  assert st = 'needs_review', '3: ความมั่นใจต่ำควรรอตรวจ ได้ ' || coalesce(st, 'null');

  -- 4) ส่งสถานะ approved เองตอน insert ก็ถูกทับ
  insert into public.receipts(workspace_id, submitter_id, ref_no, txn_date, amount, confidence, status)
    values (org, a, 'R4', current_date, 9000, 0.95, 'approved');
  select status into st from public.receipts where ref_no = 'R4';
  assert st = 'pending', '4: ผู้ใช้ตั้ง status เองไม่ได้';

  -- 5) สลิปซ้ำใน workspace เดียวกันต้องถูกปฏิเสธ
  failed := false;
  begin
    insert into public.receipts(workspace_id, submitter_id, ref_no, txn_date, amount)
      values (org, a, 'R1', current_date, 100);
  exception when unique_violation then failed := true; end;
  assert failed, '5: สลิปซ้ำควรถูกปฏิเสธ';

  -- A สร้างรหัสเชิญ
  code := public.create_invite(org, 'employee');
  execute 'reset role';

  -- 6) คนนอก (C) ต้องไม่เห็นอะไรของบริษัทเลย
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.receipts where workspace_id = org;
  assert n = 0, '6: คนนอกเห็นใบเสร็จของบริษัท ' || n;
  select count(*) into n from public.workspaces where id = org;
  assert n = 0, '6: คนนอกเห็น workspace ของบริษัท';

  -- 7) คนนอกส่งใบเสร็จเข้าบริษัทไม่ได้
  failed := false;
  begin
    insert into public.receipts(workspace_id, submitter_id, ref_no, txn_date, amount)
      values (org, c, 'X1', current_date, 10);
  exception when insufficient_privilege or check_violation then failed := true; end;
  assert failed, '7: คนนอกส่งใบเสร็จเข้าบริษัทได้';
  execute 'reset role';

  -- B ใช้รหัสเชิญเข้าร่วม แล้วส่งใบเสร็จ
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.join_workspace(code);
  insert into public.receipts(workspace_id, submitter_id, ref_no, txn_date, amount, confidence)
    values (org, b, 'B1', current_date, 50, 0.95);

  -- 8) พนักงานเห็นเฉพาะของตัวเอง (ไม่เห็นของ A)
  select count(*) into n from public.receipts where workspace_id = org;
  assert n = 1, '8: พนักงานควรเห็น 1 ใบ แต่เห็น ' || n;

  -- 9) พนักงานอนุมัติตัวเองไม่ได้
  failed := false;
  begin
    update public.receipts set status = 'approved' where ref_no = 'B1';
    get diagnostics n = row_count;
    if n = 0 then failed := true; end if;
  exception when others then failed := true; end;
  -- B1 ผ่านอัตโนมัติอยู่แล้ว (approved) พนักงานแก้ไม่ได้เพราะไม่ใช่ pending/needs_review
  assert failed, '9: พนักงานแก้ใบที่อนุมัติแล้วได้';

  -- 10) พนักงานสร้างรหัสเชิญไม่ได้
  failed := false;
  begin perform public.create_invite(org, 'employee');
  exception when others then failed := true; end;
  assert failed, '10: พนักงานสร้างรหัสเชิญได้';
  execute 'reset role';

  -- 11) แอดมินเห็นของทุกคนในบริษัท (R1-R4 + B1 = 5)
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.receipts where workspace_id = org;
  assert n = 5, '11: แอดมินควรเห็น 5 ใบ แต่เห็น ' || n;
  execute 'reset role';

  raise notice 'ALL RLS TESTS PASSED';
end $$;

rollback;
