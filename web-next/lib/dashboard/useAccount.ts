"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { configProblem } from "../config";
import { getSb } from "../supabase";
import { landingAuth } from "../landing";
import { lsGet, lsSet } from "../format";
import type { Invite, LineLink, LinkCode, Role, Workspace } from "../types";
import type { Shared } from "./shared";

type Receipts = { load: () => Promise<void>; clear: () => void };

// บัญชีผู้ใช้: ล็อกอิน, workspace และสิทธิ์, สถานะ LINE, บริษัท, รหัสเชิญ
export function useAccount({ live, t, toast, setBusy }: Shared, { load: loadReceipts, clear: clearReceipts }: Receipts) {
  // ใช้เฉพาะฟังก์ชันที่คงที่ (ไม่ส่งออบเจ็กต์ทั้งก้อน ไม่งั้น effect ล็อกอินจะสมัครใหม่ทุกครั้งที่หน้าวาดใหม่)
  const [fatalKey, setFatalKey] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [ws, setWs] = useState<string | null>(null);
  const [lineLinks, setLineLinks] = useState<LineLink[] | null>(null);
  const [lineError, setLineError] = useState(false);
  const [linkCode, setLinkCode] = useState<LinkCode | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [invitesError, setInvitesError] = useState(false);

  // ---- สิทธิ์ของ workspace ที่เลือกอยู่
  const cur = useMemo(() => workspaces.find((w) => w.id === ws) || null, [workspaces, ws]);
  const role = (ws && (roles[ws] as Role)) || null;
  const isAdmin = role === "admin";
  const canReview = role === "admin" || role === "accountant";
  const personal = cur?.kind === "personal";
  const showInvite = !!(cur && cur.kind === "org" && isAdmin);

  // ---- โหลดข้อมูล
  const loadWorkspaces = useCallback(async (u: User) => {
    const sb = getSb();
    const [w, m] = await Promise.all([
      sb.from("workspaces").select("id,name,kind,auto_approve_limit,min_confidence").order("created_at"),
      sb.from("memberships").select("workspace_id,role").eq("user_id", u.id),
    ]);
    if (w.error || m.error) { toast(t.current("t_ws_fail", (w.error || m.error)!.message)); return; }
    const list = w.data as Workspace[];
    const rl = Object.fromEntries((m.data as { workspace_id: string; role: string }[]).map((r) => [r.workspace_id, r.role]));
    const saved = lsGet("slip.ws");
    const pick = list.some((x) => x.id === saved) ? saved : list[0]?.id ?? null;
    live.current.workspaces = list; live.current.roles = rl; live.current.ws = pick;
    setWorkspaces(list); setRoles(rl); setWs(pick);
  }, [live, t, toast]);

  const loadInvites = useCallback(async () => {
    const { data, error } = await getSb().from("invites").select("code,role,expires_at")
      .eq("workspace_id", live.current.ws).is("used_at", null).gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false });
    if (error) { setInvitesError(true); return; }
    setInvitesError(false); setInvites(data as Invite[]);
  }, [live]);

  const loadLineStatus = useCallback(async () => {
    const { data, error } = await getSb().from("line_links").select("line_user_id,created_at").order("created_at", { ascending: false });
    if (error) { setLineError(true); return; }
    setLineError(false); setLineLinks(data as LineLink[]);
  }, []);

  // โหลดส่วนที่ขึ้นกับ workspace ที่เลือก (ใบเสร็จ + รหัสเชิญถ้าเป็นแอดมินบริษัท)
  const refreshViews = useCallback(async () => {
    const { ws: id, workspaces: list, roles: rl } = live.current;
    const w = list.find((x) => x.id === id);
    const inviteVisible = !!(w && w.kind === "org" && rl[id ?? ""] === "admin");
    await Promise.all([loadReceipts(), inviteVisible ? loadInvites() : Promise.resolve()]);
  }, [live, loadReceipts, loadInvites]);

  // ---- เซสชัน
  const onSession = useCallback(async (session: Session | null) => {
    const u = session?.user ?? null;
    const sameUser = !!u && live.current.user?.id === u.id;
    live.current.user = u; setUser(u); setAuthReady(true);
    if (!u) {   // ออกจากระบบ: ล้างทุกอย่างของคนเก่า (กันคนถัดไปในแท็บเดียวกันเห็น)
      live.current.ws = null; live.current.workspaces = []; live.current.roles = {};
      setWorkspaces([]); setRoles({}); setWs(null);
      setLineLinks(null); setLinkCode(null); setInvites(null);
      clearReceipts();
      return;
    }
    if (sameUser) return;   // token ต่ออายุ/กลับมาที่แท็บ: ไม่ต้องโหลดทั้งหน้าซ้ำ
    await loadWorkspaces(u);
    await Promise.all([loadLineStatus(), refreshViews()]);
  }, [live, clearReceipts, loadWorkspaces, loadLineStatus, refreshViews]);

  useEffect(() => {
    const problem = configProblem();
    if (problem) { setFatalKey(problem); return; }
    const sb = getSb();
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      // ห้าม await เรียก supabase ใน callback นี้โดยตรง ให้เลื่อนไปรอบถัดไป
      setTimeout(() => { void onSession(session); }, 0);
    });

    void (async () => {
      const landing = landingAuth();
      if (landing.error) setAuthError(landing.error);
      const { data, error } = await sb.auth.getSession();
      if (error) { setAuthError(error.message); console.error("[auth] getSession", error); }
      if (data.session) return;

      // มี token ใน URL แต่ไลบรารีไม่ได้ตั้ง session ให้: ตั้งเอง
      if (landing.accessToken && landing.refreshToken) {
        const r = await sb.auth.setSession({ access_token: landing.accessToken, refresh_token: landing.refreshToken });
        if (!r.error) { history.replaceState(null, "", location.pathname); await onSession(r.data.session); return; }
        setAuthError(r.error.message); console.error("[auth] setSession", r.error);
      }
      setAuthReady(true);
    })();

    return () => sub.subscription.unsubscribe();
  }, [onSession]);

  const login = () => getSb().auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
  const logout = async () => { await getSb().auth.signOut(); };

  const selectWorkspace = async (id: string) => {
    live.current.ws = id; setWs(id); lsSet("slip.ws", id);
    await refreshViews();
  };

  // ---- LINE / บริษัท / เชิญ
  // รหัสสร้างที่ฐานข้อมูล (สุ่ม + หมดอายุ 10 นาที + มีที่ยังไม่ใช้ได้ทีละรหัส) เบราว์เซอร์เลือกรหัสเองไม่ได้
  const createLinkCode = async () => {
    setBusy("link", true);
    try {
      const { data, error } = await getSb().rpc("create_link_code");
      if (error) throw error;
      setLinkCode(data as LinkCode);
    } catch (e) { toast(t.current("t_code_fail", (e as Error).message)); }
    finally { setBusy("link", false); }
  };

  const createOrg = async (name: string): Promise<boolean> => {
    const n = name.trim();
    if (!n) { toast(t.current("t_need_org")); return false; }
    setBusy("org", true);
    try {
      const { data, error } = await getSb().rpc("create_org", { org_name: n });
      if (error) { toast(t.current("t_org_fail", error.message)); return false; }
      await loadWorkspaces(live.current.user!);
      live.current.ws = data as string; setWs(data as string); lsSet("slip.ws", data as string);
      await refreshViews();
      toast(t.current("t_org_ok"));
      return true;
    } finally { setBusy("org", false); }
  };

  const createInvite = async (inviteRole: string) => {
    setBusy("invite", true);
    try {
      const { error } = await getSb().rpc("create_invite", { ws: live.current.ws, invite_role: inviteRole });
      if (error) { toast(t.current("t_inv_fail", error.message)); return; }
      await loadInvites();
    } finally { setBusy("invite", false); }
  };

  const email = user?.email || "";
  const meta = user?.user_metadata as { name?: string; full_name?: string } | undefined;
  const name = meta?.name || meta?.full_name || email.split("@")[0] || "";

  return {
    fatalKey, authReady, authError, user, name, email,
    workspaces, ws, cur, role, isAdmin, canReview, personal, showInvite,
    lineLinks, lineError, linkCode, invites, invitesError,
    login, logout, selectWorkspace, refreshViews, createLinkCode, createOrg, createInvite,
  };
}
