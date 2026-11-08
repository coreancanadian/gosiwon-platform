import "server-only";

export const SITE_URL = "https://www.campusflat.com";

export interface NotificationEmail {
  subject: string;
  /** Opening paragraphs, one per entry. */
  intro?: string[];
  /** Plain label/value rows. Values are escaped here, so user text is safe. */
  rows?: Array<{ label: string; value: string; href?: string }>;
  /** A longer block of user-written text, shown as-is below the rows. */
  message?: string;
  cta?: { label: string; href: string };
  /** Small print under everything else. */
  footer?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml({ intro = [], rows = [], message, cta, footer }: NotificationEmail): string {
  const introHtml = intro
    .map((line) => `<p style="margin:0 0 12px;color:#101828">${escapeHtml(line)}</p>`)
    .join("");
  const rowHtml = rows
    .map(({ label, value, href }) => {
      const shown = escapeHtml(value);
      const cell = href
        ? `<a href="${escapeHtml(href)}" style="color:#004aad">${shown}</a>`
        : shown;
      return `<tr><td style="padding:4px 16px 4px 0;color:#667085;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0;color:#101828">${cell}</td></tr>`;
    })
    .join("");
  const messageHtml = message
    ? `<div style="margin-top:16px;padding:12px 14px;background:#f2f4f7;border-radius:8px;color:#101828;white-space:pre-line">${escapeHtml(message)}</div>`
    : "";
  const ctaHtml = cta
    ? `<p style="margin-top:20px"><a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:10px 16px;background:#004aad;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(cta.label)}</a></p>`
    : "";
  const tableHtml = rowHtml ? `<table style="border-collapse:collapse">${rowHtml}</table>` : "";
  const footerHtml = footer
    ? `<p style="margin-top:20px;font-size:12px;color:#667085">${escapeHtml(footer)}</p>`
    : "";
  return `<div style="font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:14px;line-height:1.5">${introHtml}${tableHtml}${messageHtml}${ctaHtml}${footerHtml}</div>`;
}

function renderText({ intro = [], rows = [], message, cta, footer }: NotificationEmail): string {
  const lines = intro.flatMap((line) => [line, ""]);
  lines.push(
    ...rows.map(({ label, value, href }) => `${label}: ${value}${href ? ` (${href})` : ""}`),
  );
  if (message) lines.push("", message);
  if (cta) lines.push("", `${cta.label}: ${cta.href}`);
  if (footer) lines.push("", footer);
  return lines.join("\n").trim();
}

/** Sends one notification to the operator. Throws on failure. */
export async function sendOperatorEmail(email: NotificationEmail): Promise<void> {
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!to) throw new Error("Email notification settings are not configured.");
  await sendEmail(to, email);
}

/** Sends one notification through Resend. Throws on failure. */
export async function sendEmail(to: string, email: NotificationEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Email notification settings are not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: email.subject,
      html: renderHtml(email),
      text: renderText(email),
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
  }
}
