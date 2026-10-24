"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { lsSet } from "@/lib/format";
import type { LineLink, LinkCode, Role, Workspace } from "@/lib/types";
import { Icon } from "./Icons";

type Props = {
  name: string;
  email: string;
  cur: Workspace | null;
  role: Role | null;
  lineLinks: LineLink[] | null;
  lineError: boolean;
  linkCode: LinkCode | null;
  creatingCode: boolean;
  linePopOpen: boolean;
  setLinePopOpen: (v: boolean) => void;
  onMenu: () => void;
  onCreateCode: () => void;
  onCopy: (text: string) => void;
  onLogout: () => void;
};

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => { setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"); }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    lsSet("slip.theme.v2", next);
    setTheme(next);
  };
  return { theme, toggle };
}

function LinkTimer({ expiresAt, onExpired }: { expiresAt: string; onExpired: (v: boolean) => void }) {
  const { t } = useI18n();
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const end = new Date(expiresAt).getTime();
    const tick = () => {
      const s = Math.max(0, Math.round((end - Date.now()) / 1000));
      setLeft(s); onExpired(s === 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);   // ล้างทุกครั้งที่ขอรหัสใหม่/ปิดหน้า กัน timer ซ้อน
  }, [expiresAt, onExpired]);
  return <>{left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} ${t("min")}` : t("expired")}</>;
}

export function Topbar(p: Props) {
  const { t, lang, setLang, ROLE } = useI18n();
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [expired, setExpired] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const { setLinePopOpen } = p;

  // คลิกนอกกล่อง / กด Esc = ปิดเมนูที่เปิดอยู่
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!menuRef.current?.contains(n) && !avatarRef.current?.contains(n)) setMenuOpen(false);
      if (!popRef.current?.contains(n) && !chipRef.current?.contains(n)) setLinePopOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenuOpen(false); setLinePopOpen(false); } };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); };
  }, [setLinePopOpen]);

  const linked = (p.lineLinks?.length ?? 0) > 0;
  const roleLabel = (p.role && ROLE[p.role]) || "-";
  const sub = p.cur
    ? p.cur.kind === "personal" ? t("hello_personal", roleLabel) : t("hello_org", p.cur.name, roleLabel)
    : "";
  const avatar = (p.name || "?").trim().charAt(0).toUpperCase();
  const cmd = p.linkCode ? "ผูก " + p.linkCode.code : "";

  return (
    <header className="topbar">
      <button className="menu-btn ghost" aria-label="Menu" onClick={p.onMenu}><Icon id="i-menu" /></button>
      <div className="hello"><b>{t("hello", p.name).trim()}</b><span>{sub}</span></div>
      <button
        ref={chipRef}
        className={"line-chip" + (linked ? " ok" : "")}
        aria-haspopup="dialog"
        aria-expanded={p.linePopOpen}
        onClick={(e) => { e.stopPropagation(); setMenuOpen(false); p.setLinePopOpen(!p.linePopOpen); }}
      >
        <Icon id="i-link" /><i></i><span className="txt">{t(linked ? "chip_ok" : "chip_none")}</span>
      </button>
      <button className="ghost small" aria-label="Theme" style={{ padding: "6px 8px" }} title={theme === "dark" ? "Light theme" : "Black theme"} onClick={toggle}>
        <Icon id={theme === "dark" ? "i-sun" : "i-moon"} />
      </button>
      <button className="lang ghost" aria-label="Language" onClick={() => setLang(lang === "en" ? "th" : "en")}>{lang === "en" ? "ไทย" : "EN"}</button>
      <button ref={avatarRef} className="avatar-btn" aria-label="Account" aria-haspopup="true" onClick={(e) => { e.stopPropagation(); p.setLinePopOpen(false); setMenuOpen(!menuOpen); }}>
        <div className="avatar">{avatar}</div>
      </button>

      <div ref={popRef} className="pop" role="dialog" aria-label="LINE" hidden={!p.linePopOpen}>
        <h3>{t("line_title")}</h3>
        <div className="sub">{t("line_sub")}</div>
        <div className="status-line">
          {p.lineError ? t("line_err") : p.lineLinks && p.lineLinks.length ? (
            <>
              <span className="badge b-ok">{t("line_ok")}</span>
              <span>LINE …{p.lineLinks[0].line_user_id.slice(-4)}{p.lineLinks.length > 1 ? ` (+${p.lineLinks.length - 1})` : ""}</span>
            </>
          ) : p.lineLinks ? <span className="badge b-warn">{t("line_none")}</span> : null}
        </div>
        <button className="primary block" disabled={p.creatingCode} onClick={p.onCreateCode}>{t("line_btn")}</button>
        {p.linkCode && (
          <div>
            <div className="code" style={{ opacity: expired ? 0.35 : 1 }}>{p.linkCode.code}</div>
            <div className="hint">
              <span>{t("line_send")}</span> <b>{cmd}</b><br />
              <span>{t("line_once")}</span> <b><LinkTimer expiresAt={p.linkCode.expires_at} onExpired={setExpired} /></b><br />
              <span>{t("line_kw")}</span>
            </div>
            <button className="small" style={{ marginTop: 12 }} onClick={() => p.onCopy(cmd)}>{t("line_copy")}</button>
          </div>
        )}
      </div>

      <div ref={menuRef} className="menu" hidden={!menuOpen}>
        <div className="who">{p.email}</div>
        <button className="ghost" onClick={p.onLogout}><Icon id="i-logout" /><span>{t("signout")}</span></button>
      </div>
    </header>
  );
}
