# GTM ExitIQ - handoff notes

Prototype: `ExitIQ GTM.dc.html` (previous flat-design version: `ExitIQ GTM v1 flat.dc.html`).

## Scope
GTM-branded light version of the Exit IQ calculator: no AI report, no email report, no
48h report SLA. The flow ends on screen and routes the lead to the member firm in the
selected country.

Flow: landing -> sector -> company details -> 21 questions -> on-screen result
(pillar scores, 9-zone matrix, three priority gaps, intro request).

## Branding (per GTM CD sheet, `uploads/00 - GTM - CD/`)
- Primary: navy `#0f283e`, grey `#999999`, white `#ffffff`.
- Secondary (signal): cyan `#01f0fc`, orange `#fc9c0a` - accents only, never as
  large background washes (background glows use white at 6-9% alpha over the navy).
- Open Sans (light/regular/semibold/bold/extrabold + italic); headings use 800,
  since Open Sans has no 900 weight.
- Logos: official "ohne Member of" lockups (`assets/gtm-logo-white.png`,
  `assets/gtm-logo-navy.png`) plus `Motiv-Welt-weiss` as the globe watermark.
- Zone/score colours stay semantic (red -> green), as in the live tool; severity
  markers use the CD orange for "partially met".

## Languages
EN and DE, switchable in the header. German terminology follows the live tool's own
strings (`PILLAR_LABELS`, `PILLAR_SHORT`, `ZONE_NAMES_DE`).

## Content sources
- Questions, pillars, axis weights, zones: mirrored from `src/lib/constants.ts`
  (21 of the 31 core questions, 3 per pillar). The full DB bank plugs in unchanged.
- GTM facts: `uploads/250301_Introduction to GTM Group.pptx` - six member firms
  (atares, Ceres Advisors, JTech Advisory, Paxinosa Tech, Samira Advisors,
  White Crown International), ~350 advised transactions across members, EV range
  EUR 5-200m, EU-US cross-border volume ~$450bn p.a. (38% tech).
- Positioning line: globaltechmergers.com.

## Lead notification
When a respondent enters name + email and generates the summary, the prototype:
1. stores the lead in `localStorage['exitiq-gtm-leads']` (name, email, company, sector,
   country, revenue band, both scores, zone, ISO timestamp);
2. POSTs the same JSON to `Component.LEAD_ENDPOINT` if that constant is set, with
   `to: contact@globaltechmergers.com` in the body;
3. offers a `mailto:contact@globaltechmergers.com` fallback with the lead prefilled,
   so the notification reaches the inbox even without a backend.

`LEAD_ENDPOINT` is intentionally empty in the preview - a browser page cannot send
mail itself. Until it is set, the UI states "Delivery pending - no mail endpoint
configured", never that mail was sent.

### Production wiring on Strato (recommended - no Supabase/Resend needed)
Strato covers both halves: the mailbox and a place to run the sender.
1. Create `contact@globaltechmergers.com` and `noreply@globaltechmergers.com` as
   mailboxes in the Strato panel (the From address must exist on the domain, or
   SPF/Strato will reject the mail).
2. Upload `send-lead.php` (in this project) to the ExitIQ domain, e.g.
   `https://exitiq.globaltechmergers.com/send-lead.php`. Strato hosting packages
   include PHP, so `mail()` relays through Strato's own MTA - no SMTP credentials
   in the browser, nothing to install.
3. Set `Component.LEAD_ENDPOINT` in `ExitIQ GTM.dc.html` to that URL. The existing
   POST body already matches what the script expects.
4. Check `ALLOWED_ORIGINS` in the script matches the domain serving the tool.

The script validates the email, strips header-injection characters, sets `Reply-To`
to the respondent so replying reaches them directly, and appends every submission to
`leads.log` next to the script as an audit trail. If Strato's package has no PHP,
the alternative is SMTP (`smtp.strato.de`, port 465 SSL or 587 STARTTLS) from any
small server-side function - never from the browser.

### Partner routing runs through the same Strato endpoint
Both flows POST to `send-lead.php`; only the recipient differs:
- summary submission (name + email) -> `contact@globaltechmergers.com`;
- introduction request -> the selected member firm, from `PARTNER_RECIPIENTS`
  keyed by the dropdown value (`absolvo` Hungary, `atares` Germany,
  `ceres` Sweden, `venture` United Kingdom, `whitecrown` France, `any` = GTM
  central). Unset or invalid addresses fall back to GTM central.

Only `exitiq@atares.team` (Germany) is filled in so far. Two points that matter on
Strato: the `From` address must stay the authenticated domain mailbox
(`noreply@globaltechmergers.com`) even when the mail goes to an external partner
domain - sending "as" a partner address would fail SPF/DMARC; and `Reply-To`
carries the respondent, so a partner replying reaches the company directly.
Introduction requests send the client-built subject and body verbatim, so the
per-partner template in the design is exactly what the firm receives.

## Supabase (read-only reference, nothing written)
- Project URL: `https://vhdtfhakqbaipdmprdqd.supabase.co`
- Publishable key: `sb_publishable_BAfemOOp6Mp3rsMPfq0JcQ_SqQkN6z7`

The prototype does not call Supabase - question content is embedded so the page works
offline at the conference. When the GTM build goes live on the website, point the same
front end at this project (tables `qv_categories`, `qv_questions`, `qv_options`) and the
embedded bank can be dropped; the scoring maths in the prototype already matches
`src/lib/scoring.ts` (weighted per-pillar average, x = readiness weights,
y = value weights, bands at 40 / 70).
