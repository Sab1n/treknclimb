import { z } from 'zod';

/**
 * The newsletter signup schema, shared by the form and the route handler.
 *
 * Far smaller than the booking schema on purpose: an email address and a
 * consent act. Every extra field is a reason not to subscribe, and everything
 * else we might want (name, interests) can be collected later in the marketing
 * platform by people who have already said yes.
 */

/** Submissions completed faster than this are rejected as automated. */
export const MIN_COMPLETION_MS = 2000;

export const newsletterFormSchema = z.object({
  email: z.email('That does not look like an email address').max(254),

  /**
   * Consent. Always required, and `true` is the only accepted value.
   *
   * In the checkbox placements a person has to tick it. In the inline
   * placements the act of submitting under visible consent text is the
   * agreement, and the component sends `true`.
   *
   * Either way this is not the consent *record* — clicking the link in the
   * confirmation email is, because that is the only step that proves the
   * address belongs to whoever agreed. This field stops an unticked box being
   * submitted; `confirmedAt` is the evidence.
   */
  consent: z
    .boolean()
    .refine((value) => value === true, 'Please tick this to subscribe'),
});

export type NewsletterFormValues = z.input<typeof newsletterFormSchema>;

/** What the endpoint receives: the form plus the anti-spam fields. */
export const newsletterSubmissionSchema = newsletterFormSchema.extend({
  /** Honeypot. Any value at all means spam. */
  company: z.string().max(200).optional(),

  /** When the form was rendered, epoch ms. Feeds the time trap. */
  renderedAt: z.coerce.number().int().nonnegative(),

  /** Cloudflare Turnstile token. Absent when Turnstile is not configured. */
  turnstileToken: z.string().max(4096).optional(),

  /**
   * The page the form was on. Client-supplied and therefore untrusted, so it is
   * length-capped and only ever stored and displayed as text — never used to
   * build a redirect or a query.
   */
  source: z.string().max(300).optional(),
});

export type NewsletterSubmission = z.output<typeof newsletterSubmissionSchema>;
