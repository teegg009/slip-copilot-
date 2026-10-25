# Slip Copilot

Send a photo of a receipt or bank slip to a LINE bot. The app reads it, saves it, and shows it on a web dashboard.

## What it does

- Reads the shop, date and amount from a slip photo (using Google Gemini)
- Saves the receipt and the image to Supabase
- Lets you approve, edit or delete receipts on a web dashboard
- Supports a personal space and company spaces with roles (admin, accountant, employee)
- Finds receipts in your Gmail (personal space only)
- Exports to Excel
- Dashboard in English and Thai. The bot replies in Thai.

This is a portfolio project that I use with a few friends. It is not made for production use.

## How it works

```
LINE photo -> n8n -> Gemini -> check in code -> Supabase <- web dashboard
```

1. You send a slip photo to the LINE bot.
2. n8n sends the image to Gemini, which returns the shop, date and amount.
3. Code checks the result (valid date, amount above 0, no duplicates).
4. The receipt is saved to Supabase. The database decides if it is approved right away or needs review.
5. You see it on the dashboard.

Who can see or change what is controlled by the database (Postgres Row Level Security), not by the web page. Secret keys are kept only in n8n.

## Tech

LINE Messaging API, n8n, Google Gemini, Supabase (Postgres, Storage, Google sign-in), Next.js with TypeScript, Gmail API, SheetJS.

## Setup

You need: a Supabase project, n8n, a LINE Messaging API channel, a Gemini API key, a Google OAuth client, and Node.js 20 or newer.

**1. Database**

In the Supabase SQL editor, run these files one at a time. Paste the whole file each time.

1. `schema.sql`
2. `line_functions.sql`
3. `storage_policy.sql`
4. `email_personal_only.sql`
5. `receipt_edit.sql`
6. `hardening.sql`
7. `hardening2.sql`

Then run `verify_install.sql`. Every row should say `true`.

**2. n8n**

1. In `n8n/line-v3.json` and `n8n/email-parse.json`, replace `YOUR-PROJECT` and `YOUR_SUPABASE_PUBLISHABLE_KEY` with your own values. (You can keep a filled-in copy in `n8n/local/`. It is ignored by git.)
2. Import both files into n8n.
3. Add your credentials (Supabase, Gemini, LINE).
4. Put your LINE channel secret in the `Sign` node.
5. Publish both workflows.

To receive LINE messages on your own computer, run a tunnel such as `ngrok http 5678`. Then set the LINE webhook URL to `https://<your-tunnel-domain>/webhook/line-v3`.

**3. Web app**

```bash
cd web-next
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3001.

Also add `http://localhost:3001` in two places:
- Supabase: Authentication, URL Configuration, Redirect URLs
- Google Cloud: your OAuth client, Authorized JavaScript origins (needed for the Gmail scan)

Do not put a service role key or a client secret in `.env.local`. The app will not start if it finds one.

## How to use

**Owner or admin (on the web)**
1. Sign in with Google.
2. Link LINE: click the LINE button at the top, create a code, then send `ผูก <code>` to the bot.
3. For a team: create a company and make invite codes.
4. Review receipts: approve, reject, edit, delete, or view the slip.
5. Download Excel, or scan Gmail in your personal space.

**Employee or friend (in LINE only)**
1. Send `เข้าร่วม <invite code>` to the bot.
2. Send slip photos.
3. Use `ใช้ส่วนตัว` (personal) or `ใช้ <company name>` to choose where slips go.

## Tests

- SQL tests: `supabase/test_rls.sql` and `supabase/test_line.sql`. They roll back, so they leave no data.
- Web: run `npm run typecheck` and `npm run build` in `web-next/`.
- Bot: `n8n/simulate_line.py` sends fake LINE messages to the webhook.

## Folders

- `supabase/` - database files and SQL tests
- `n8n/` - the two workflows
- `web-next/` - the dashboard

## Limitations

- n8n and the tunnel run on my own computer.
- AI usage depends on a free quota.
- Dashboard totals use the 200 most recent receipts.
- The email parser has no rate limit per user.

## Background

I started this in AI Future Quest 2026 (DXC Technology and HPE, 6 Oct 2026), where I took part as a team. After the event I kept working on it alone and built what is in this repository.

## License

[MIT](LICENSE)
