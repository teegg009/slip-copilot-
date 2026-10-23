// Gmail (อ่านอย่างเดียว) ผ่าน Google Identity Services: token อยู่ในหน่วยความจำของหน้านี้เท่านั้น ไม่ถูกเก็บ/ส่งต่อ

type TokenResponse = { access_token?: string; error?: string };
type GoogleWindow = Window & {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient: (c: {
          client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback: (e: { type?: string }) => void;
        }) => { requestAccessToken: (o: { prompt: string }) => void };
        revoke?: (token: string, done?: () => void) => void;
      };
    };
  };
};

let scriptPromise: Promise<void> | null = null;
function loadGoogleScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error("Google script not loaded")); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export async function gmailToken(clientId: string): Promise<string> {
  await loadGoogleScript();
  const g = (window as GoogleWindow).google;
  if (!g?.accounts?.oauth2) throw new Error("Google script not loaded");
  return new Promise((resolve, reject) => {
    const tc = g.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new Error(r.error || "no_token"))),
      error_callback: (e) => reject(new Error(e?.type || "popup_closed")),
    });
    tc.requestAccessToken({ prompt: "" });
  });
}

// เพิกถอน token หลังสแกนเสร็จ (ไม่ให้ token ค้างใช้ได้ต่อ)
export function revokeToken(token: string) {
  try { (window as GoogleWindow).google?.accounts.oauth2.revoke?.(token); } catch { /* ignore */ }
}

export async function gmailApi<T = any>(token: string, path: string): Promise<T> {
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/" + path, { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) throw new Error("Gmail " + r.status);
  return r.json();
}

const b64u = (s: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: { name: string; value: string }[] };

export function mailText(payload: Part): string {
  let plain = "", html = "";
  (function walk(p?: Part) {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data) plain += b64u(p.body.data) + "\n";
    else if (p.mimeType === "text/html" && p.body?.data) html += b64u(p.body.data);
    (p.parts || []).forEach(walk);
  })(payload);
  let txt = plain.trim();
  if (!txt && html) {
    txt = html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  }
  return txt.replace(/[ \t ]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

export const mailHdr = (m: { payload: Part }, name: string) =>
  (m.payload.headers || []).find((x) => x.name.toLowerCase() === name)?.value || "";

export const mailQuery = (days: number) =>
  `(receipt OR invoice OR "order confirmation" OR "payment confirmation" OR ใบเสร็จ OR ใบกำกับภาษี OR "tax invoice") newer_than:${days}d -category:promotions -category:social`;

// ดึงอีเมลทีละกลุ่ม (พร้อมกัน 4 ฉบับ) เร็วกว่าดึงทีละฉบับมาก
export async function fetchMessages(token: string, ids: string[], pool = 4) {
  const out: { id: string; from: string; subject: string; date: string; text: string }[] = [];
  for (let i = 0; i < ids.length; i += pool) {
    const chunk = await Promise.all(ids.slice(i, i + pool).map(async (id) => {
      const m = await gmailApi<{ payload: Part }>(token, "messages/" + id + "?format=full");
      return { id, from: mailHdr(m, "from"), subject: mailHdr(m, "subject"), date: mailHdr(m, "date"), text: mailText(m.payload) };
    }));
    out.push(...chunk.filter((m) => m.text));
  }
  return out;
}
