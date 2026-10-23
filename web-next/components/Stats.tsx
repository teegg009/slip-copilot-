"use client";
import { useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { CAT_COLOR, compact, isOpen, localISO, niceStep } from "@/lib/format";
import type { Receipt } from "@/lib/types";
import { Icon } from "./Icons";

function Chart({ receipts }: { receipts: Receipt[] }) {
  const { t, baht } = useI18n();
  const data = useMemo(() => {
    const days: string[] = [];
    for (let n = 13; n >= 0; n--) { const d = new Date(); d.setDate(d.getDate() - n); days.push(localISO(d)); }
    const ok: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
    const open: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
    for (const r of receipts) {
      if (!(r.txn_date in ok) || r.status === "rejected") continue;
      if (r.status === "approved") ok[r.txn_date] += Number(r.amount); else open[r.txn_date] += Number(r.amount);
    }
    return { days, ok, open, max: Math.max(0, ...days.map((d) => Math.max(ok[d], open[d]))) };
  }, [receipts]);

  if (!data.max) return <div className="chart"><div className="chart-empty">{t("c_empty")}</div></div>;

  const { days, ok, open, max } = data;
  const step = niceStep(max / 4), top = step * 4;
  const W = 760, H = 340, L = 52, R = 8, T = 10, B = 28, ph = H - T - B, pw = W - L - R, slot = pw / days.length, bw = Math.min(11, slot / 3.2);
  const y = (v: number) => T + ph - (v / top) * ph;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("c_aria")}>
        {[0, 1, 2, 3, 4].map((n) => {
          const v = step * n, yy = y(v);
          return (
            <g key={n}>
              <line className="grid" x1={L} x2={W - R} y1={yy} y2={yy} />
              <text x={L - 8} y={yy + 4} textAnchor="end">{compact(v)}</text>
            </g>
          );
        })}
        {days.map((d, n) => {
          const cx = L + slot * n + slot / 2, label = `${+d.slice(8)}/${+d.slice(5, 7)}`;
          const bar = (v: number, dx: number, col: string, name: string) => v > 0 && (
            <rect className="b" x={cx + dx} y={y(v)} width={bw} height={Math.max(2, T + ph - y(v))} rx={bw / 2} fill={col}>
              <title>{`${label} · ${name}: ฿${baht(v)}`}</title>
            </rect>
          );
          return (
            <g key={d}>
              {bar(ok[d], -bw - 1.5, "var(--primary)", t("st_approved"))}
              {bar(open[d], 1.5, "var(--secondary)", t("lg_open"))}
              <text x={cx} y={H - 8} textAnchor="middle">{label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function Stats({ receipts }: { receipts: Receipt[] }) {
  const { t, baht, lang, nSlips, monthFull, yearLabel, CAT } = useI18n();
  const now = new Date();
  const ym = localISO(now).slice(0, 7);
  const month = receipts.filter((r) => r.txn_date.startsWith(ym) && r.status !== "rejected");
  const total = month.reduce((s, r) => s + Number(r.amount), 0);
  const label = `${monthFull(now.getMonth() + 1)} ${yearLabel(now.getFullYear())}`;
  const pending = receipts.filter((r) => isOpen(r.status)).length;

  const by: Record<string, number> = {}, cnt: Record<string, number> = {};
  for (const r of month) { by[r.category] = (by[r.category] || 0) + Number(r.amount); cnt[r.category] = (cnt[r.category] || 0) + 1; }
  const list = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <section id="secDash" style={{ display: "grid", gap: 24 }}>
      <div className="stats">
        <div className="card stat"><div className="ic blue"><Icon id="i-wallet" /></div>
          <div><div className="k"><span>{t("k_month")}</span><span>{lang === "th" ? ` ${label}` : ` · ${label}`}</span></div><div className="v">฿<span>{baht(total)}</span></div></div></div>
        <div className="card stat"><div className="ic sky"><Icon id="i-receipt" /></div>
          <div><div className="k">{t("k_count")}</div><div className="v"><span>{month.length}</span><small>{t("u_slip")}</small></div></div></div>
        <div className="card stat"><div className="ic amber"><Icon id="i-clock" /></div>
          <div><div className="k">{t("k_pending")}</div><div className="v"><span>{pending}</span><small>{t("u_slip")}</small></div></div></div>
        <div className="card stat"><div className="ic green"><Icon id="i-stack" /></div>
          <div><div className="k">{t("k_all")}</div><div className="v"><span>{receipts.length}</span><small>{t("u_slip")}</small></div></div></div>
      </div>

      <div className="grid-main">
        <div className="card">
          <div className="head">
            <div><h2>{t("c_title")}</h2><div className="sub">{t("c_sub")}</div></div>
            <div className="legend">
              <span><i style={{ background: "var(--primary)" }}></i><span>{t("st_approved")}</span></span>
              <span style={{ color: "var(--secondary)" }}><i style={{ background: "var(--secondary)" }}></i><span>{t("lg_open")}</span></span>
            </div>
          </div>
          <Chart receipts={receipts} />
        </div>
        <div className="card">
          <div className="head"><div><h2>{t("cat_title")}</h2><div className="sub">{label}</div></div></div>
          <div className="stat-list">
            {list.map(([c, v]) => {
              const pct = total ? Math.round((v / total) * 100) : 0;
              return (
                <div className="stat-row" key={c}>
                  <div className="ic" style={{ background: CAT_COLOR[c] || "#8a94a6" }}><Icon id={`c-${CAT[c] ? c : "other"}`} /></div>
                  <div className="t"><b>{CAT[c] || c}</b><span>฿{baht(v)} · {nSlips(cnt[c])}</span></div>
                  <span className="pill">{pct}%</span>
                </div>
              );
            })}
          </div>
          <div className="hint" hidden={list.length > 0}>{t("cat_empty")}</div>
        </div>
      </div>
    </section>
  );
}
