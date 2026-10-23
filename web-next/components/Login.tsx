"use client";
import { useI18n } from "@/lib/i18n";
import { Icon } from "./Icons";

export function Login({ onLogin, error }: { onLogin: () => void; error?: string | null }) {
  const { t, lang, setLang } = useI18n();
  return (
    <section className="login">
      <button className="lang" aria-label="Language" onClick={() => setLang(lang === "en" ? "th" : "en")}>
        {lang === "en" ? "ไทย" : "EN"}
      </button>
      <div className="left">
        <div className="brand" style={{ padding: 0 }}><div className="logo"><Icon id="i-receipt" /></div>Slip Copilot</div>
        <div>
          <h1><span>{t("l_h1a")}</span><br /><span>{t("l_h1c")}</span></h1>
          <p className="lede">{t("l_lede")}</p>
          <button className="primary gbtn" onClick={onLogin}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#fff" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" /></svg>
            <span>{t("l_go")}</span>
          </button>
        </div>
        {error && <div className="hint" role="alert" style={{ color: "var(--bad-fg)" }}>{t("t_login_fail", error)}</div>}
        <div className="fine">{t("l_fine")}</div>
      </div>
      <div className="right" aria-hidden="true">
        <div className="slip">
          <div className="hd">Slip Copilot</div>
          <div className="sub">{t("s_head")}</div>
          <hr />
          <div className="li"><span>{t("s_i1")}</span><span>20.00</span></div>
          <div className="li"><span>{t("s_i2")}</span><span>55.50</span></div>
          <div className="li"><span>{t("s_i3")}</span><span>48.00</span></div>
          <hr />
          <div className="li tot"><span>{t("s_tot")}</span><span>123.50</span></div>
          <div className="bc"></div>
          <div className="stamp">{t("st_approved")}</div>
        </div>
      </div>
    </section>
  );
}
