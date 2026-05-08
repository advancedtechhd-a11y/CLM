/**
 * HTML email template for the monthly narrative report.
 *
 * Design constraints:
 *   - Inline CSS only (Gmail / Outlook strip <style> blocks)
 *   - No JavaScript (most clients block it)
 *   - Single column, max-width 600px (mobile-readable)
 *   - Markdown-to-HTML inline (same renderer as the dashboard report viewer)
 */

type Args = {
  merchant_name: string;
  period_label: string;          // "April 2026"
  body_markdown: string;
  dashboard_url: string;         // deep link to the report in the app
  recipient_first_name?: string;
};

export function buildMonthlyReportEmail(args: Args): { subject: string; html: string; text: string } {
  const subject = `Your ${args.period_label} CLM report — ${args.merchant_name}`;

  const html = renderEmail(args);
  const text = renderText(args);

  return { subject, html, text };
}

function renderEmail({ merchant_name, period_label, body_markdown, dashboard_url, recipient_first_name }: Args): string {
  const greeting = recipient_first_name ? `Hi ${recipient_first_name},` : "Hi there,";
  const bodyHtml = markdownToInlineHtml(body_markdown);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(period_label)} CLM report</title>
</head>
<body style="margin:0; padding:0; background-color:#f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#111827; line-height:1.6;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
              <div style="font-size: 20px; font-weight: 700; color: #111827;">
                Lifecycle<span style="color: #2563eb;">AI</span>
              </div>
              <div style="font-size: 13px; color: #6b7280; margin-top: 4px;">
                ${escapeHtml(merchant_name)} · ${escapeHtml(period_label)} report
              </div>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding: 28px 32px 8px 32px;">
              <p style="margin: 0; font-size: 16px;">${escapeHtml(greeting)}</p>
              <p style="margin: 12px 0 0 0; font-size: 15px; color: #374151;">
                Here's your customer lifecycle digest for ${escapeHtml(period_label)}. The full report and underlying numbers live in your dashboard.
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 16px 32px 24px 32px; font-size: 15px; color: #1f2937;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding: 8px 32px 32px 32px;">
              <a href="${escapeHtml(dashboard_url)}"
                 style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
                Open dashboard →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center;">
              You're receiving this because you connected ${escapeHtml(merchant_name)} to LifecycleAI.<br>
              Manage email preferences in your dashboard settings.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderText({ merchant_name, period_label, body_markdown, dashboard_url, recipient_first_name }: Args): string {
  const greeting = recipient_first_name ? `Hi ${recipient_first_name},` : "Hi there,";
  // Strip markdown for plain-text version
  const plain = body_markdown
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*([^*\n]+?)\*/g, "$1")
    .replace(/^## (.+)$/gm, "$1")
    .replace(/^### (.+)$/gm, "$1")
    .replace(/`([^`]+?)`/g, "$1");
  return `${greeting}

Your ${period_label} customer lifecycle digest for ${merchant_name}:

${plain}

Open the dashboard: ${dashboard_url}

You're receiving this because you connected ${merchant_name} to LifecycleAI.`;
}

// ── Minimal markdown → inline HTML (matches the in-app report viewer) ──
function markdownToInlineHtml(md: string): string {
  const blocks = md.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      if (block.startsWith("## ")) {
        return `<h2 style="font-size:18px; font-weight:700; color:#111827; margin:24px 0 8px 0;">${inline(block.slice(3))}</h2>`;
      }
      if (block.startsWith("### ")) {
        return `<h3 style="font-size:16px; font-weight:600; color:#111827; margin:16px 0 8px 0;">${inline(block.slice(4))}</h3>`;
      }
      if (/^- /.test(block)) {
        const items = block.split(/\n/).map((l) => l.replace(/^- /, ""));
        return `<ul style="padding-left:20px; margin:8px 0;">${items.map((i) => `<li style="margin:4px 0;">${inline(i)}</li>`).join("")}</ul>`;
      }
      if (/^\d+\.\s/.test(block)) {
        const items = block.split(/\n/).map((l) => l.replace(/^\d+\.\s/, ""));
        return `<ol style="padding-left:20px; margin:8px 0;">${items.map((i) => `<li style="margin:4px 0;">${inline(i)}</li>`).join("")}</ol>`;
      }
      return `<p style="margin:0 0 12px 0;">${inline(block.replace(/\n/g, "<br>"))}</p>`;
    })
    .join("\n");
}

function inline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:600;">$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "<em>$1</em>")
    .replace(/`([^`]+?)`/g, '<code style="background:#f3f4f6; padding:1px 4px; border-radius:3px; font-size:90%;">$1</code>');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
