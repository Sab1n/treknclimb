import type { IBookingRequestPopulated } from '../../models/BookingRequest';

/**
 * Email and WhatsApp reply links, pre-filled.
 *
 * A Server Component: these are `<a href>`s and nothing more, so this ships no
 * JavaScript. The whole point is to remove the copy-paste step between reading
 * an inquiry and answering it — that is where a "we reply within 24 hours"
 * promise is actually kept or broken.
 *
 * ## Encoding
 *
 * `encodeURIComponent` on every interpolated value, without exception. A
 * customer's message can contain `&`, `#` and newlines, each of which truncates
 * a `mailto:` body at exactly the point it appears — so the draft opens looking
 * complete and is missing its second half. A name containing `&` does the same
 * to the subject line.
 *
 * The reference goes in the subject so a reply threads against something
 * searchable, and the draft opens with the customer's own words quoted below,
 * because the reply is being written from an admin screen rather than from an
 * inbox where the original would be visible.
 */

/**
 * Strips a phone number down to digits for `wa.me`.
 *
 * WhatsApp wants the full international number with no `+`, spaces, brackets or
 * dashes — `wa.me/9779812345678`. Anything else silently opens WhatsApp on a
 * "phone number shared via link is not on WhatsApp" screen, which looks like
 * the customer is unreachable rather than like the link is wrong.
 *
 * **A leading `00` is the international prefix, not part of the number**, and
 * `wa.me` rejects it. Plenty of people write their number that way.
 */
function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  return digits.startsWith('00') ? digits.slice(2) : digits;
}

/**
 * How the country code gets decided when the visitor typed a local number.
 *
 * It does not. A seven-digit local number has no country code to guess, and
 * guessing one produces a link to a real stranger's WhatsApp. Below this
 * length the button is not rendered at all and the number is shown as plain
 * text for staff to dial. Eight digits is the shortest national number in
 * general use; anything shorter is certainly not dialable internationally.
 */
const MIN_WHATSAPP_DIGITS = 8;

export default function QuickReply({
  booking,
}: {
  booking: IBookingRequestPopulated;
}) {
  const subject = `Re: your inquiry ${booking.reference} — Trek & Climb Adventure`;

  const quoted = booking.message
    ? `\n\n---\nYour message:\n${booking.message}`
    : '';

  const emailBody =
    `Dear ${booking.name},\n\n` +
    `Thank you for your inquiry about ` +
    `${booking.trip?.title ?? 'travelling with us'}.\n\n` +
    `\n\nWith best regards,\nTrek & Climb Adventure\nPokhara, Nepal` +
    quoted;

  const mailto =
    `mailto:${encodeURIComponent(booking.email)}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(emailBody)}`;

  const digits = booking.phone ? whatsappNumber(booking.phone) : '';
  const canWhatsapp = digits.length >= MIN_WHATSAPP_DIGITS;

  const whatsappText =
    `Hello ${booking.name}, this is Trek & Climb Adventure in Pokhara. ` +
    `Thank you for your inquiry ${booking.reference}` +
    `${booking.trip ? ` about the ${booking.trip.title}` : ''}.`;

  const whatsappHref = `https://wa.me/${digits}?text=${encodeURIComponent(whatsappText)}`;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <a
          href={mailto}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-opacity hover:opacity-90"
        >
          Reply by email
        </a>

        {canWhatsapp && (
          <a
            href={whatsappHref}
            target="_blank"
            /*
             * `noopener` is the one that matters: without it the opened tab gets
             * a handle on this one through `window.opener` and can navigate it
             * anywhere — from an admin screen, to a convincing login page.
             */
            rel="noopener noreferrer"
            className="rounded-full border-2 border-ink px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
          >
            Reply on WhatsApp
          </a>
        )}
      </div>

      <p className="mt-2 text-xs text-muted">
        {booking.preferredChannel === 'either'
          ? 'No channel preference given.'
          : `Asked to be contacted by ${booking.preferredChannel}.`}
        {booking.phone && !canWhatsapp && (
          <> Phone number is too short to dial internationally — {booking.phone}</>
        )}
        {!booking.phone && <> No phone number was given.</>}
      </p>
    </div>
  );
}
