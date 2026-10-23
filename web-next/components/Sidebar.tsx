"use client";
import { useI18n } from "@/lib/i18n";
import type { Workspace } from "@/lib/types";
import { Icon } from "./Icons";

type Props = {
  open: boolean;
  active: string;
  workspaces: Workspace[];
  ws: string | null;
  personal: boolean;
  showInvite: boolean;
  onSelectWs: (id: string) => void;
  onNav: (target: string) => void;
  onOpenLine: () => void;
  onExcel: () => void;
};

export function Sidebar({ open, active, workspaces, ws, personal, showInvite, onSelectWs, onNav, onOpenLine, onExcel }: Props) {
  const { t } = useI18n();
  const item = (target: string, icon: string, label: string) => (
    <button className={"nav-item" + (active === target ? " active" : "")} onClick={() => onNav(target)}>
      <Icon id={icon} /><span>{label}</span>
    </button>
  );
  return (
    <aside className={"sidebar" + (open ? " open" : "")}>
      <div className="brand"><div className="logo"><Icon id="i-receipt" /></div>Slip Copilot</div>
      <div className="ws-block">
        <label htmlFor="wsSelect">{t("ws_label")}</label>
        <select id="wsSelect" aria-label="Workspace" value={ws ?? ""} onChange={(e) => onSelectWs(e.target.value)}>
          {workspaces.map((x) => (
            <option key={x.id} value={x.id}>{x.kind === "personal" ? t("ws_personal") : t("ws_company")} · {x.name}</option>
          ))}
        </select>
      </div>
      <nav>
        <div className="nav-h">{t("nav_home")}</div>
        {item("secDash", "i-dash", t("nav_overview"))}
        {item("secReceipts", "i-receipt", t("nav_receipts"))}
        <div className="nav-h">{t("nav_manage")}</div>
        <button className="nav-item" onClick={(e) => { e.stopPropagation(); onOpenLine(); }}><Icon id="i-link" /><span>{t("nav_line")}</span></button>
        {item("secOrg", "i-building", t("nav_company"))}
        {personal && item("mailCard", "i-mail", t("nav_mail"))}
        {showInvite && item("secInvite", "i-userplus", t("nav_invite"))}
        <button className="nav-item" onClick={onExcel}><Icon id="i-download" /><span>{t("nav_excel")}</span></button>
      </nav>
    </aside>
  );
}
