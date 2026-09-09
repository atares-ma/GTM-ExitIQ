# Deploying ExitIQ on Strato

Strato covers both halves of the setup: the webspace that serves the tool and
the mail relay that delivers the lead notifications. Supabase (project
`drkperzvmlkprawmzdzp`, EU) is already set up and seeded — nothing to do there.

## What is needed from Strato

Everything below happens in the [Strato customer panel](https://www.strato.de/apps/CustomerService)
for the package that hosts `globaltechmergers.com`:

1. **A hosting package with PHP.** Any current Strato hosting plan includes
   PHP 8 — just confirm the domain's package is a *hosting* package (not a
   pure domain/mail package). `send-lead.php` needs nothing beyond `mail()`.

2. **One mailbox on the domain** (Email → create email address):
   - `contact@globaltechmergers.com` — used both as the **sending address**
     (the `From`) and as GTM central that **receives** every summary
     notification and any introduction whose member firm has no address yet.
     It must exist as a real mailbox on the domain, otherwise Strato's MTA and
     SPF reject the outgoing mail. (`noreply@` is intentionally not used — it
     doesn't exist on the domain.)

3. **The subdomain that will serve the tool**, e.g.
   `exitiq.globaltechmergers.com`:
   - create the subdomain and point its document root at a webspace folder
     (e.g. `/exitiq`);
   - enable **SSL** for it (included in Strato packages; the `.htaccess`
     already redirects HTTP → HTTPS).

4. **SFTP access to upload the files**: host `sftp.strato.de`, the package's
   (S)FTP username and password. Alternatively, whoever holds that access
   uploads the files per the steps below — nothing else is needed.

5. **Not from Strato, but needed for full partner routing:** the inbox of each
   member firm for introduction requests. Currently only atares is set
   (`exitiq@atares.team`). Absolvo (HU), Ceres (SE), Venture CF (UK) and
   White Crown (FR) fall back to `contact@globaltechmergers.com` until their
   addresses are entered in `site/send-lead.php` → `PARTNER_RECIPIENTS`.

That's the complete list — no SMTP credentials, no Node hosting, no cron jobs.
Mail goes through Strato's own MTA via PHP `mail()`, so no password ever
touches the browser or the repo.

## Upload steps

1. Upload the **contents** of `site/` into the subdomain's document root
   (index.html, support.js, send-lead.php, .htaccess, assets/, vendor/).
   Make sure `.htaccess` (hidden file) is actually transferred.
2. If the final domain differs from `exitiq.globaltechmergers.com`, adjust
   `ALLOWED_ORIGINS` in `send-lead.php` (only matters if the tool is ever
   embedded from another origin — same-origin use works regardless).
3. Done. Changes to questions happen in Supabase, not on the webspace.

## Go-live checks

- Open `https://exitiq.globaltechmergers.com` — the page must load with the
  GTM navy design and Open Sans (no external font/CDN requests in dev tools).
- Run one assessment with your own email:
  - the summary lands in `contact@globaltechmergers.com`, with `Reply-To`
    set to the respondent;
  - selecting Germany and requesting an introduction lands in
    `exitiq@atares.team`;
  - the lead row appears in Supabase → Table Editor → `leads`.
- `https://…/leads.log` must return **403 Forbidden** (`.htaccess` active).
- Question edit round-trip: change a `text_en` in Supabase → reload the tool →
  the new wording shows.

## If the package turns out to have no PHP

Deploy the repo on Vercel instead (`docs/DEPLOY-VERCEL.md`): the serverless
function in `api/send-lead.ts` sends the same mails over `smtp.strato.de:465`
with the mailbox password stored as a Vercel env var. The page already tries
`/api/send-lead` automatically when `send-lead.php` is not there.

## Operations

- **Leads**: Supabase dashboard → `leads` table (browser key cannot read them;
  only dashboard/service-role can). `leads.log` on the webspace is a redundant
  audit trail. Rows older than 24 months are deleted nightly by a pg_cron job
  (`leads-retention`) to honour the privacy policy.
- **Questions**: edit `qv_questions` / `question_options` / `qv_categories` in
  Supabase. `is_active=false` hides a question; `sectors` limits one to given
  sectors (`it_services`, `saas`, `hr_tech`, `cybersecurity`); follow-ups use
  `is_follow_up`, `follow_up_question_key`, `follow_up_condition`
  (`score_0` | `score_lte_1`). The tool needs at least two questions per pillar
  from the database, otherwise it keeps the embedded bank.
- **Kill switch**: emptying `leadEndpoint` in `index.html` stops mail sending
  (UI shows "delivery pending" and offers the mailto fallback); removing the
  Supabase values makes the tool run fully embedded/offline.
