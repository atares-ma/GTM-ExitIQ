# GTM ExitIQ

GTM-branded light version of the Exit IQ calculator for **Global Tech Mergers**:
no AI report, no email report — the flow ends on screen and routes the lead to
the member firm in the selected country.

Flow: landing → sector → company details → ~35-45 questions → on-screen result
(pillar scores, 9-zone matrix, priority gaps, introduction request). EN + DE.

## Repository layout

| Path | Purpose |
|---|---|
| `site/` | **The deployable site.** Upload its contents to the Strato webspace (see `docs/DEPLOY-STRATO.md`). |
| `site/index.html` | The production page. All deployment values live in `window.EXITIQ_CONFIG` at the top of the file. |
| `site/send-lead.php` | Same-origin mail relay: sends lead notifications through Strato's own MTA and routes introduction requests to the member firms. |
| `site/.htaccess` | Blocks public access to `leads.log`, forces HTTPS. |
| `site/vendor/` | Self-hosted React 18.3.1 (SHA-384 verified against the SRI hashes in `support.js`) and Open Sans woff2 — no unpkg, no Google Fonts request (GDPR). |
| `supabase/migrations/` | Schema + seed applied to the GTM ExitIQ Supabase project (`drkperzvmlkprawmzdzp`). |
| `vercel.json`, `api/` | Vercel support: serves `site/` with security headers, plus a serverless mail relay (`/api/send-lead`) used when the PHP one isn't there. See `docs/DEPLOY-VERCEL.md`. |
| `docs/DEPLOY-STRATO.md` | Step-by-step Strato deployment, and the checklist of what is needed from the Strato panel. |
| `docs/DEPLOY-VERCEL.md` | Deploying on Vercel (previews or as alternative host). |
| `docs/GTM-ExitIQ-handoff.md` | Original design-handoff notes. |
| `design/` | The design-canvas source files the page was built from. |

## Architecture

```
Browser (site/index.html, self-contained: React + fonts + embedded question bank)
  │
  ├─ GET  Supabase /rest/v1/qv_questions, /qv_categories   ← question bank + pillar
  │        (publishable key, read-only RLS)                   weights; embedded bank
  │                                                           is the offline fallback
  ├─ POST Supabase /rest/v1/leads                           ← lead log (insert-only
  │        (no select policy: leads can never be read          RLS; 24-month retention
  │         back with the browser key)                         enforced by pg_cron)
  │
  └─ POST send-lead.php (same origin, Strato PHP)           ← notification mail via
           summary → contact@globaltechmergers.com             Strato's MTA; partner
           introduction → member firm (PARTNER_RECIPIENTS)     routing server-side
```

- **Question bank**: loaded from Supabase at page open and swapped in only if it
  passes a sanity check and no assessment is in progress; otherwise the embedded
  bank keeps the tool fully functional offline. Editing `qv_questions` /
  `question_options` in the Supabase dashboard changes the live tool without a
  deployment. Red flags (`is_red_flag`) and pillar weights (`qv_categories.weight_x/y`)
  come from the database too.
- **Leads**: every summary/introduction submission is (1) mailed via
  `send-lead.php`, (2) inserted into the Supabase `leads` table, (3) kept in the
  respondent's browser localStorage as a last-resort copy. The mail's `Reply-To`
  is the respondent, so replying reaches them directly.

## Configuration

Everything deployment-specific sits in one block at the top of `site/index.html`:

```js
window.EXITIQ_CONFIG = {
  // mail relays, tried in order (PHP on Strato, serverless on Vercel);
  // [] disables mail sending (UI says "pending")
  leadEndpoints: ['send-lead.php', '/api/send-lead'],
  supabaseUrl:  'https://drkperzvmlkprawmzdzp.supabase.co',
  supabaseKey:  'sb_publishable_…',  // publishable anon key - safe in the browser
};
```

Partner routing (which member firm receives an introduction request) is
configured server-side in `site/send-lead.php` → `PARTNER_RECIPIENTS`. Only
atares (Germany) is filled in so far; empty entries fall back to GTM central.

## Testing

Run the tool locally with mail captured to a file:

```sh
php -d sendmail_path="tee -a /tmp/exitiq-mail.txt >/dev/null" -S 127.0.0.1:8080 -t site
```

The repo was verified end-to-end with a scripted browser run: full 39-question
flow on the Supabase-served bank, summary mail to GTM central, introduction
mail routed to `exitiq@atares.team`, both leads inserted into Supabase, and
RLS checked (anon can read the bank, insert leads, and read nothing back).

## Note for legal review

The in-tool privacy policy was updated from the flagship tool's text to match
this stack (Strato hosting + mail, Supabase EU database, no analytics, no user
accounts, 24-month lead retention enforced in the database). Sections IV
(server logs), VI (processors) and X (retention) should get a final review
before go-live, in particular Strato's actual log-retention period.
