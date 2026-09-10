import { connectDB } from './db';
import RejectedSubmission, {
  RejectionReason,
  RejectedForm,
} from '../models/RejectedSubmission';

/**
 * Records a public form submission the server discarded.
 *
 * Called on every rejection path in `POST /api/bookings` and
 * `POST /api/newsletter` — the silent spam traps and the ones that show the
 * visitor an error. All of them end with a real person's submission
 * potentially reaching nobody, which is the case this exists for.
 *
 * Not called for schema-validation failures. Those are returned to the browser
 * field by field, the visitor corrects them and submits again, so nothing is
 * lost — and logging them would bury the interesting rows in typos.
 *
 * **This never throws.** A logging failure must not become a failed
 * submission, and on the honeypot and time-trap paths the response is a
 * deliberate lie about success — an error escaping here would contradict it.
 *
 * It is awaited rather than fired and forgotten. On serverless hosting the
 * process can be frozen the moment the response is returned, so an un-awaited
 * write is a write that may simply not happen. One insert is cheap, and nobody
 * real is waiting on these paths.
 */
export async function logRejection(options: {
  /** Which form was rejected. Defaults to the booking form. */
  form?: RejectedForm;
  reason: RejectionReason;
  detail?: string;
  request: Request;
  ip: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { form = 'booking', reason, detail, request, ip, payload } = options;

  try {
    await connectDB();

    // The Turnstile token is a single-use credential and is noise to a human
    // reader. Everything else is kept as submitted — including the honeypot
    // value, which is the evidence.
    const rest = { ...payload };
    delete rest.turnstileToken;

    const email = typeof rest.email === 'string' ? rest.email : undefined;

    await RejectedSubmission.create({
      form,
      reason,
      detail,
      ip,
      userAgent: request.headers.get('user-agent') ?? undefined,
      sourcePage: request.headers.get('referer') ?? undefined,
      email,
      payload: rest,
    });
  } catch (error) {
    console.error(
      `[rejections] Could not record a ${reason} rejection — it now exists only in this log:`,
      error,
      payload
    );
  }
}
