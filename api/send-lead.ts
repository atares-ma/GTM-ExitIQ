/**
 * POST /api/send-lead
 *
 * Vercel serverless function (Node runtime) that emails a completed ExitIQ
 * self-assessment to contact@globaltechmergers.com via Strato SMTP.
 *
 * Place at:  api/send-lead.ts   (works alongside a Vite SPA on Vercel)
 * Install:   npm i nodemailer && npm i -D @types/nodemailer
 *
 * Environment variables (Vercel → Settings → Environment Variables):
 *   SMTP_HOST=smtp.strato.de
 *   SMTP_PORT=465
 *   SMTP_USER=contact@globaltechmergers.com     # a real Strato mailbox; also the From address
 *   SMTP_PASS=********                          # never in client code
 *   LEAD_RECIPIENT=contact@globaltechmergers.com
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

const FALLBACK_RECIPIENT = process.env.LEAD_RECIPIENT ?? 'contact@globaltechmergers.com';

/**
 * Introduction requests go to the member firm the respondent picked in the
 * dropdown. Add each firm's inbox here as they send you the address: put it
 * between the quotes, commit (editing on github.com is fine), and Vercel
 * redeploys. A matching Vercel environment variable (LEAD_TO_ABSOLVO,
 * LEAD_TO_CERES, …) overrides the value here if you'd rather not touch code.
 * Any firm left blank falls back to GTM central (contact@globaltechmergers.com).
 */
const PARTNER_EMAILS: Record<string, string> = {
  atares: 'exitiq@atares.team', // Germany
  absolvo: 'contact@globaltechmergers.com', // Hungary — placeholder until the firm's inbox arrives
  ceres: 'contact@globaltechmergers.com', // Sweden — placeholder
  venture: 'contact@globaltechmergers.com', // United Kingdom — placeholder
  whitecrown: 'contact@globaltechmergers.com', // France — placeholder
};

const PARTNER_RECIPIENTS: Record<string, string | undefined> = {
  absolvo: process.env.LEAD_TO_ABSOLVO || PARTNER_EMAILS.absolvo,
  atares: process.env.LEAD_TO_ATARES || PARTNER_EMAILS.atares,
  ceres: process.env.LEAD_TO_CERES || PARTNER_EMAILS.ceres,
  venture: process.env.LEAD_TO_VENTURE || PARTNER_EMAILS.venture,
  whitecrown: process.env.LEAD_TO_WHITECROWN || PARTNER_EMAILS.whitecrown,
  any: FALLBACK_RECIPIENT,
};

const ALLOWED_ORIGINS = [
  'https://globaltechmergers.com',
  'https://www.globaltechmergers.com',
  'https://exitiq.globaltechmergers.com',
];

export interface LeadPayload {
  name: string;
  email: string;
  company?: string;
  sector?: string;
  country?: string;
  revenue?: string;
  exitReadiness?: number;
  valuePotential?: number;
  zone?: string;
  submittedAt?: string;
  /** Partner dropdown key: absolvo | atares | ceres | venture | whitecrown | any */
  partnerKey?: string;
  partner?: string;
  /** Ready-made subject/body built by the client for introduction requests. */
  subject?: string;
  message?: string;
}

/** Single-line, header-injection-safe value. */
const clean = (v: unknown, max = 200): string =>
  String(v ?? '')
    .replace(/[\r\n\0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const isEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as LeadPayload;

  const name = clean(body?.name);
  const email = clean(body?.email);
  if (!name || !isEmail(email)) {
    return res.status(422).json({ error: 'name and a valid email are required' });
  }

  // Lead-notification fields only: who completed the assessment, not the result.
  // The scored result stays on the respondent's screen and in the Supabase leads
  // table; it is deliberately NOT included in this email.
  const rows: Array<[string, string]> = [
    ['Name', name],
    ['Email', email],
    ['Company', clean(body.company)],
    ['Sector', clean(body.sector)],
    ['Country', clean(body.country)],
    ['Revenue', clean(body.revenue)],
    ['Submitted', clean(body.submittedAt, 40)],
  ];

  const partnerKey = clean(body.partnerKey, 40);
  const routed = PARTNER_RECIPIENTS[partnerKey];
  const recipient = routed && isEmail(routed) ? routed : FALLBACK_RECIPIENT;

  const defaultText = [
    'New ExitIQ lead: someone completed the self-assessment and left their contact details.',
    '',
    ...rows.map(([k, v]) => `${(k + ':').padEnd(26)}${v || '-'}`),
    '',
    'This is a notification only. The assessment result was shown to the respondent',
    'on screen and is not included here. Reply directly to this email to reach them.',
  ].join('\n');

  // Introduction requests arrive with a partner-specific subject and body.
  const text = typeof body.message === 'string' && body.message.trim() ? body.message.slice(0, 8000) : defaultText;
  const subject = clean(body.subject) || `New ExitIQ lead - ${clean(body.company) || 'unnamed company'} (${name})`;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.strato.de',
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465, // 465 = SSL, 587 = STARTTLS
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });

  try {
    await transporter.sendMail({
      from: `ExitIQ <${process.env.SMTP_USER}>`, // must be the authenticated mailbox
      to: recipient,
      replyTo: `${name} <${email}>`,
      subject,
      text,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[send-lead] SMTP failure', err);
    return res.status(502).json({ error: 'mail relay failed' });
  }
}
