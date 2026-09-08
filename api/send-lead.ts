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
 *   SMTP_USER=noreply@globaltechmergers.com     # a real Strato mailbox
 *   SMTP_PASS=********                          # never in client code
 *   LEAD_RECIPIENT=contact@globaltechmergers.com
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

const FALLBACK_RECIPIENT = process.env.LEAD_RECIPIENT ?? 'contact@globaltechmergers.com';

/**
 * Per-partner routing. Keys match the ExitIQ partner dropdown. Set one env var
 * per member firm; anything missing falls back to GTM central.
 */
const PARTNER_RECIPIENTS: Record<string, string | undefined> = {
  absolvo: process.env.LEAD_TO_ABSOLVO, // Hungary
  atares: process.env.LEAD_TO_ATARES ?? 'exitiq@atares.team', // Germany
  ceres: process.env.LEAD_TO_CERES, // Sweden
  venture: process.env.LEAD_TO_VENTURE, // United Kingdom
  whitecrown: process.env.LEAD_TO_WHITECROWN, // France
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

  const rows: Array<[string, string]> = [
    ['Name', name],
    ['Email', email],
    ['Company', clean(body.company)],
    ['Sector', clean(body.sector)],
    ['Country', clean(body.country)],
    ['Revenue', clean(body.revenue)],
    ['Exit readiness', body.exitReadiness != null ? `${body.exitReadiness}/100` : ''],
    ['Value creation potential', body.valuePotential != null ? `${body.valuePotential}/100` : ''],
    ['Zone', clean(body.zone)],
    ['Submitted', clean(body.submittedAt, 40)],
  ];

  const partnerKey = clean(body.partnerKey, 40);
  const routed = PARTNER_RECIPIENTS[partnerKey];
  const recipient = routed && isEmail(routed) ? routed : FALLBACK_RECIPIENT;

  const defaultText = [
    'A new ExitIQ self-assessment has been completed.',
    '',
    ...rows.map(([k, v]) => `${(k + ':').padEnd(26)}${v || '-'}`),
    '',
    'Sent automatically by the ExitIQ tool. Reply directly to contact the respondent.',
  ].join('\n');

  // Introduction requests arrive with a partner-specific subject and body.
  const text = typeof body.message === 'string' && body.message.trim() ? body.message.slice(0, 8000) : defaultText;
  const subject = clean(body.subject) || `ExitIQ assessment - ${clean(body.company) || 'new lead'} (${name})`;

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
