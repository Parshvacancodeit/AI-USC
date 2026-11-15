// P3. Server only. Demo email through Resend's REST API (no SDK). Always delivers to DEMO_OFFICE_INBOX.
export type EmailResult = { sent: boolean; id?: string; error?: string };

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.DEMO_OFFICE_INBOX);
}

/** Send to the demo inbox only. Never throws: returns { sent: false, error } instead. */
export async function sendDemoEmail(m: { subject: string; text: string; html?: string }): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.DEMO_OFFICE_INBOX;
  if (!key || !to) return { sent: false, error: "Email isn't configured (RESEND_API_KEY / DEMO_OFFICE_INBOX)" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || "Ripple <onboarding@resend.dev>", to: [to], subject: m.subject.slice(0, 200), text: m.text, ...(m.html ? { html: m.html } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { sent: false, error: `Resend ${res.status}: ${json.message ?? "send failed"}` };
    return { sent: true, id: json.id };
  } catch (err) {
    return { sent: false, error: `Resend unreachable: ${(err as Error).message}` };
  }
}
