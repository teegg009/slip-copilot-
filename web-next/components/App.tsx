"use client";
import { useCallback, useState } from "react";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { useDashboard } from "@/lib/useDashboard";
import type { Receipt } from "@/lib/types";
import { SpriteDefs } from "./Icons";
import { Login } from "./Login";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Stats } from "./Stats";
import { ReceiptsTable } from "./ReceiptsTable";
import { InviteCard, MailCard, OrgCard } from "./Cards";
import { DeleteModal, EditModal, ImageModal, MailModal } from "./Modals";

function Dashboard() {
  const { t } = useI18n();
  const d = useDashboard();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [linePopOpen, setLinePopOpen] = useState(false);
  const [active, setActive] = useState("secDash");
  const [editing, setEditing] = useState<Receipt | null>(null);
  const [deleting, setDeleting] = useState<Receipt | null>(null);
  const [viewing, setViewing] = useState<Receipt | null>(null);

  const closeImage = useCallback(() => setViewing(null), []);
  const getUrl = d.signedImageUrl;

  const nav = (target: string) => {
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(target); setSidebarOpen(false);
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); d.toast(t("t_copy_ok")); } catch { d.toast(t("t_copy_fail")); }
  };

  if (d.fatalKey) {
    return (
      <div className="fatal"><div className="card"><h2>{t("f_title")}</h2><p className="sub">{t(d.fatalKey)}</p></div></div>
    );
  }
  if (!d.authReady) return null;
  if (!d.user) return <Login onLogin={() => void d.login()} error={d.authError} />;

  return (
    <>
      <div hidden={!sidebarOpen} className="backdrop" onClick={() => setSidebarOpen(false)} />
      <Sidebar
        open={sidebarOpen} active={active} workspaces={d.workspaces} ws={d.ws} personal={d.personal} showInvite={d.showInvite}
        onSelectWs={(id) => void d.selectWorkspace(id)} onNav={nav}
        onOpenLine={() => { setSidebarOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); setLinePopOpen(true); }}
        onExcel={() => { setSidebarOpen(false); void d.exportExcel(); }}
      />
      <div className="page">
        <Topbar
          name={d.name} email={d.email} cur={d.cur} role={d.role}
          lineLinks={d.lineLinks} lineError={d.lineError} linkCode={d.linkCode} creatingCode={!!d.busy.link}
          linePopOpen={linePopOpen} setLinePopOpen={setLinePopOpen}
          onMenu={() => setSidebarOpen(true)} onCreateCode={() => void d.createLinkCode()} onCopy={(x) => void copy(x)} onLogout={() => void d.logout()}
        />
        <main className="content">
          <Stats receipts={d.receipts} />
          <ReceiptsTable
            receipts={d.receipts} rcError={d.rcError} userId={d.user.id} wsName={d.cur?.name ?? ""}
            canReview={d.canReview} isAdmin={d.isAdmin} busy={d.busy} excelBusy={!!d.busy.excel}
            onExcel={() => void d.exportExcel()} onReload={() => void d.refreshViews()}
            onReview={(id, act) => void d.review(id, act)} onEdit={setEditing} onDelete={setDeleting} onView={setViewing}
          />
          <div className="grid-3">
            <OrgCard onCreate={d.createOrg} />
            {d.personal && <MailCard status={d.mailStatus} busy={!!d.busy.mail} onScan={(days) => void d.scanMail(days)} />}
            {d.showInvite && <InviteCard invites={d.invites} error={d.invitesError} onCreate={(r) => void d.createInvite(r)} />}
          </div>
        </main>
      </div>

      {editing && (
        <EditModal
          receipt={editing} busy={!!d.busy.edit} onClose={() => setEditing(null)}
          onSave={async (f) => { if (await d.saveEdit(editing.id, f)) setEditing(null); }}
        />
      )}
      {deleting && (
        <DeleteModal
          receipt={deleting} busy={!!d.busy.del} onClose={() => setDeleting(null)}
          onConfirm={async () => { if (await d.deleteReceipt(deleting.id)) setDeleting(null); }}
        />
      )}
      {viewing && <ImageModal receipt={viewing} getUrl={getUrl} onClose={closeImage} />}
      {d.mail && (
        <MailModal
          items={d.mail.items} skipped={d.mail.skipped} busy={!!d.busy.import} onClose={() => d.closeMail()}
          onImport={async (picks) => { if (await d.importMail(picks)) d.closeMail(); }}
        />
      )}
      <div className="toast" hidden={!d.toastMsg}>{d.toastMsg}</div>
    </>
  );
}

export function App() {
  return (
    <I18nProvider>
      <SpriteDefs />
      <Dashboard />
    </I18nProvider>
  );
}
