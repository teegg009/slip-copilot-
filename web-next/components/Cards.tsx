"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { Invite } from "@/lib/types";

export function OrgCard({ onCreate }: { onCreate: (name: string) => Promise<boolean> }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  return (
    <section id="secOrg" className="card">
      <div className="head" style={{ marginBottom: 10 }}><div><h2>{t("org_title")}</h2><div className="sub">{t("org_sub")}</div></div></div>
      <div className="row">
        <input type="text" placeholder={t("org_ph")} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" onClick={async () => { if (await onCreate(name)) setName(""); }}>{t("create")}</button>
      </div>
    </section>
  );
}

export function MailCard({ status, busy, onScan }: { status: string; busy: boolean; onScan: (days: number) => void }) {
  const { t } = useI18n();
  const [days, setDays] = useState("30");
  return (
    <section id="mailCard" className="card">
      <div className="head" style={{ marginBottom: 10 }}><div><h2>{t("mail_title")}</h2><div className="sub">{t("mail_sub")}</div></div></div>
      <div className="row">
        <select style={{ flex: 1 }} aria-label="Period" value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="14">{t("mail_d14")}</option>
          <option value="30">{t("mail_d30")}</option>
          <option value="90">{t("mail_d90")}</option>
        </select>
        <button className="primary" disabled={busy} onClick={() => onScan(Number(days) || 30)}>{t("mail_btn")}</button>
      </div>
      <div className="hint">{status}</div>
      <div className="hint">{t("mail_privacy")}</div>
    </section>
  );
}

export function InviteCard({ invites, error, onCreate }: { invites: Invite[] | null; error: boolean; onCreate: (role: string) => void }) {
  const { t, ROLE } = useI18n();
  const [role, setRole] = useState("employee");
  return (
    <section className="card">
      <div className="head" style={{ marginBottom: 10 }}><div><h2 id="secInvite">{t("inv_title")}</h2><div className="sub">{t("inv_sub")}</div></div></div>
      <div className="row">
        <select style={{ flex: 1 }} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="employee">{t("role_employee")}</option>
          <option value="accountant">{t("role_accountant")}</option>
        </select>
        <button className="primary" onClick={() => onCreate(role)}>{t("inv_btn")}</button>
      </div>
      <div className="invites">
        {error ? t("t_inv_load") : invites && invites.length
          ? invites.map((r) => <span key={r.code}>{r.code}<small>{ROLE[r.role] || r.role}</small></span>)
          : <div className="hint" style={{ margin: 0 }}>{t("inv_none")}</div>}
      </div>
    </section>
  );
}
