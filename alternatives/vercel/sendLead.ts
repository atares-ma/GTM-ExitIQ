/**
 * Client-side lead notification for the ExitIQ app.
 *
 * Place at: src/lib/sendLead.ts
 * Call it where the respondent submits name + email to see their summary.
 *
 * Never put SMTP credentials here - this runs in the browser. It only POSTs to
 * the serverless function, which holds the mailbox password.
 */

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
}

/**
 * Fire-and-forget: never let a mail failure block the respondent from seeing
 * their result. Returns true when the notification was accepted.
 */
export async function sendLead(lead: LeadPayload): Promise<boolean> {
  const payload: LeadPayload = { ...lead, submittedAt: lead.submittedAt ?? new Date().toISOString() };

  try {
    const res = await fetch('/api/send-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true, // survives an immediate navigation
    });
    if (!res.ok) throw new Error(`send-lead responded ${res.status}`);
    return true;
  } catch (err) {
    console.warn('[sendLead] notification failed, keeping a local copy', err);
    try {
      const key = 'exitiq-pending-leads';
      const prev = JSON.parse(localStorage.getItem(key) ?? '[]');
      localStorage.setItem(key, JSON.stringify([payload, ...prev].slice(0, 50)));
    } catch {
      /* storage unavailable */
    }
    return false;
  }
}

/* ---------------------------------------------------------------------------
Usage in the results view:

  import { sendLead } from '@/lib/sendLead';

  const handleShowSummary = async () => {
    setSummaryShown(true);                 // show the result immediately
    await sendLead({
      name,
      email,
      company: form.company,
      sector: sectorLabel,
      country: form.country,
      revenue: form.revenue,
      exitReadiness: scores.x,
      valuePotential: scores.y,
      zone: zone.name,
    });
  };
--------------------------------------------------------------------------- */
