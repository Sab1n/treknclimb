import { Resend } from 'resend';
import { IBookingRequest } from '../models/BookingRequest';

/**
 * Transactional email via Resend.
 *
 * Resend only *sends*. The `from` mailbox has to exist on a real mail host or
 * customer replies bounce into nothing — which is why every notification sets
 * `replyTo` to the customer's own address, so staff can answer straight from
 * the notification.
 *
 * Nothing here throws. **The inquiry is already saved in MongoDB by the time
 * these run**, so a mail failure must degrade to a logged error, never to a
 * failed submission. The record is the source of truth; the email is a
 * notification about it.
 */

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM;
const to = process.env.EMAIL_TO;

const resend = apiKey ? new Resend(apiKey) : null;

if (!resend) {
  console.warn(
    '[email] RESEND_API_KEY not set — emails will be logged instead of sent.'
  );
}

export interface EmailOutcome {
  notificationSent: boolean;
  acknowledgementSent: boolean;
  /** True when nothing was actually sent because Resend is not configured. */
  skipped: boolean;
}

function formatDate(value?: Date | null): string {
  if (!value) return 'Not given';

  return value.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sends both emails: the notification to the company and the acknowledgement
 * to the customer. Returns what actually happened rather than throwing, so the
 * route handler can log it against a persisted inquiry.
 */
export async function sendBookingEmails(
  booking: IBookingRequest,
  tripTitle: string | null
): Promise<EmailOutcome> {
  const subjectTrip = tripTitle ?? 'a trip';

  const detailRows: [string, string][] = [
    ['Reference', booking.reference],
    ['Name', booking.name],
    ['Email', booking.email],
    ['Phone', booking.phone || 'Not given'],
    // Near the top on purpose: the permit fee and the visa answer both depend
    // on it, so whoever prices this needs it before anything else.
    ['Nationality', booking.nationality],
    ['Trip', tripTitle ?? 'Not specified — general inquiry'],
    ['Preferred date', formatDate(booking.preferredDate)],
    ['Travellers', String(booking.travellers)],
    ['Preferred channel', booking.preferredChannel],
    ['Source page', booking.sourcePage || 'Unknown'],
  ];

  const notificationHtml = `
    <h2>New inquiry — ${escapeHtml(booking.reference)}</h2>
    <table cellpadding="6" style="border-collapse:collapse">
      ${detailRows
        .map(
          ([label, value]) =>
            `<tr><td style="color:#5E7180">${escapeHtml(label)}</td><td><strong>${escapeHtml(value)}</strong></td></tr>`
        )
        .join('')}
    </table>
    ${booking.message ? `<h3>Message</h3><p>${escapeHtml(booking.message).replace(/\n/g, '<br>')}</p>` : ''}
  `;

  const acknowledgementHtml = `
    <p>Hello ${escapeHtml(booking.name)},</p>
    <p>Thank you — your inquiry about <strong>${escapeHtml(subjectTrip)}</strong> has reached our office in Pokhara.</p>
    <p>Your reference is <strong>${escapeHtml(booking.reference)}</strong>. Quote it if you message us on WhatsApp and it saves repeating everything.</p>
    <h3>What happens next</h3>
    <ol>
      <li>One of our guides reads your request and checks the dates.</li>
      <li>You get a day-by-day itinerary and a final price by email.</li>
      <li>If it looks right, a deposit confirms. If not, tell us and we will suggest something else.</li>
    </ol>
    <p><strong>No payment now.</strong> A deposit is only taken once you have read the plan and agreed the price.</p>
    <p>— Trek &amp; Climb Adventure, Pokhara</p>
  `;

  if (!resend || !from || !to) {
    console.warn(
      `[email] Not configured — would have sent notification and acknowledgement for ${booking.reference}.`,
      { missing: { apiKey: !apiKey, from: !from, to: !to } }
    );

    return { notificationSent: false, acknowledgementSent: false, skipped: true };
  }

  // Sent independently: an acknowledgement that bounces must not stop the
  // company being told about the inquiry.
  const [notification, acknowledgement] = await Promise.allSettled([
    resend.emails.send({
      from,
      to,
      subject: `Inquiry ${booking.reference} — ${subjectTrip}`,
      html: notificationHtml,
      // Staff hit Reply and reach the customer, not the no-reply mailbox.
      replyTo: booking.email,
    }),
    resend.emails.send({
      from,
      to: booking.email,
      subject: `We have your inquiry — ${booking.reference}`,
      html: acknowledgementHtml,
    }),
  ]);

  if (notification.status === 'rejected') {
    console.error(
      `[email] Company notification FAILED for ${booking.reference} — the inquiry is saved, follow it up manually:`,
      notification.reason
    );
  }

  if (acknowledgement.status === 'rejected') {
    console.error(
      `[email] Customer acknowledgement failed for ${booking.reference}:`,
      acknowledgement.reason
    );
  }

  return {
    notificationSent: notification.status === 'fulfilled',
    acknowledgementSent: acknowledgement.status === 'fulfilled',
    skipped: false,
  };
}
