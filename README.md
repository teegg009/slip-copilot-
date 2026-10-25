# Slip Copilot

Send a photo of a receipt or bank slip to a LINE bot. Gemini reads it, the result is checked and saved to Supabase, and you manage everything from a web dashboard.

It supports personal and company workspaces (admin, accountant, employee), importing receipts from Gmail (personal workspaces only) and exporting to Excel. The dashboard is in English and Thai; the bot replies in Thai.

This is a portfolio project that I use with a few friends. It is not meant for production (see [Limitations](#limitations)).

## How it works

```
LINE  ──► n8n (LINE webhook) ──► Gemini ──► Supabase (Postgres + RLS + Storage) ◄── Next.js dashboard
Gmail ──► dashboard ──► n8n (email parser) ──► Gemini ──► dashboard ──► Supabase
```

- The LINE workflow checks the webhook signature, finds the sender's workspace, reads the image with Gemini, validates the result in code (dates, amounts, currency, duplicates), stores the image in a private bucket and inserts the receipt.
- Whether a receipt is approved automatically or waits for review is decided by a database trigger, based on the model's confidence and the workspace's amount limit.
- Access control is done in Postgres with Row Level Security and triggers, not in the web app. The dashboard only uses a publishable key and the signed-in user's token.
- Secret keys (Supabase service role, Gemini, LINE) live only in n8n credentials.

## Stack

LINE Messaging API, n8n, Google Gemini, Supabase (Postgres, RLS, Storage, Google sign-in), Next.js (App Router, static export) with TypeScript, Gmail API (read-only), SheetJS.

## Getting started

You need a Supabase project, n8n, a LINE Messaging API channel, a Gemini API key, a Google OAuth client and Node.js 20+.

**1. Database.** In the Supabase SQL editor, run these files one at a time (paste the whole file):

```
schema.sql, line_functions.sql, storage_policy.sql, email_personal_only.sql,
receipt_edit.sql, hardening.sql, hardening2.sql
```

Then run `verify_install.sql`. Every row should be `true`.

**2. n8n.** The workflows in `n8n/` use placeholders (`YOUR-PROJECT`, `YOUR_SUPABASE_PUBLISHABLE_KEY`). Fill them in (or keep a filled copy in `n8n/local/`, which is git-ignored), import `line-v3.json` and `email-parse.json`, attach your credentials, put the LINE channel secret in the `Sign` node and publish. To receive LINE webhooks on your machine, expose n8n with a tunnel (for example `ngrok http 5678`) and set the webhook URL to `https://<tunnel-domain>/webhook/line-v3`.

**3. Web app.**

```bash
cd web-next
cp .env.example .env.local    # public values only
npm install
npm run dev                   # http://localhost:3001
```

Add `http://localhost:3001` to the Redirect URLs in Supabase and to the Authorized JavaScript origins of your Google OAuth client (needed for the Gmail scan). Never put a service role key or a client secret in `.env.local`; the app refuses to start if it finds one.

## Usage

**Owner or admin (web):** sign in with Google, link LINE (LINE chip in the top bar, create a code, then send `ผูก <code>` to the bot), optionally create a company and invite people with invite codes, then review receipts (approve, reject, edit, delete, view the slip) and download Excel. In a personal workspace you can also scan Gmail and import what you select.

**Employee or friend (LINE only):** send `เข้าร่วม <invite code>` to the bot, then send slip photos. Use `ใช้ส่วนตัว` or `ใช้ <company name>` to choose where slips go.

## Tests

- SQL: `supabase/test_rls.sql`, `supabase/test_line.sql`, and a test block at the end of each hardening script. They run in a transaction and roll back.
- Web: `npm run typecheck` and `npm run build` in `web-next/`.
- Bot: `n8n/simulate_line.py` sends signed fake LINE events to a webhook.

## Repository

```
supabase/   schema, RLS policies, LINE functions, SQL tests
n8n/        LINE bot and email parser workflows
web-next/   Next.js dashboard
```

## Limitations

- n8n and the tunnel run on my machine, and AI usage depends on a free quota.
- Dashboard totals are computed from the 200 most recent receipts.
- The email parser webhook has no per-user rate limit.

## Origin

I started this in AI Future Quest 2026 (DXC Technology and HPE, 6 Oct 2026), where I competed as part of a team. After the event I continued on my own and built what is in this repository.

## License

[MIT](LICENSE)
