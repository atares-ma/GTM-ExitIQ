# Deploying ExitIQ on Vercel

Strato is the primary target (see `DEPLOY-STRATO.md`), but the repo also
deploys on Vercel out of the box — useful for previews or if GTM decides to
host there instead.

## Static site

`vercel.json` at the repo root points Vercel's output directory at `site/`
and ships the security headers (HSTS, CSP, no-frame). Importing the repo into
Vercel with default settings is enough: no build command, no framework preset,
no dashboard configuration.

> A `404: NOT_FOUND` directly after import means the deployment predates
> `vercel.json` — redeploy (or push any commit) and the site appears at `/`.

The Supabase question bank and the lead log work immediately; they only need
the publishable key that ships in the page.

## Lead notification mails

The page tries its mail relays in order: `send-lead.php` (exists only on
Strato) and then `/api/send-lead` — a serverless function in `api/send-lead.ts`
that sends through Strato's SMTP. On Vercel it activates once these
environment variables are set (Project → Settings → Environment Variables):

| Variable | Value |
|---|---|
| `SMTP_HOST` | `smtp.strato.de` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `noreply@globaltechmergers.com` (a real Strato mailbox) |
| `SMTP_PASS` | that mailbox's password |
| `LEAD_RECIPIENT` | `contact@globaltechmergers.com` |
| `LEAD_TO_ABSOLVO` … `LEAD_TO_WHITECROWN` | optional per-partner routing inboxes |

Until they are set, the function answers 502, the UI reports
"delivery pending" and offers the mailto fallback — the Supabase lead log and
the respondent's on-screen result are unaffected.

If a custom domain other than `globaltechmergers.com` /
`exitiq.globaltechmergers.com` serves the tool, add it to `ALLOWED_ORIGINS`
in `api/send-lead.ts` (only relevant for cross-origin embedding; same-origin
use works regardless).
