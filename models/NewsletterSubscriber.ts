import mongoose, { Schema, Model, Types } from 'mongoose';

/**
 * A newsletter signup collected through this website.
 *
 * ## This collection is not the source of truth
 *
 * **The marketing provider owns sending and unsubscribes.** Someone who
 * unsubscribes does it from a link in a broadcast, which the provider handles;
 * that never reaches us, because there is deliberately no unsubscribe webhook
 * (see CLAUDE.md — a public write endpoint is the highest-risk surface on this
 * site, and it would only buy a tidier number in the admin).
 *
 * So `status` here is **advisory**:
 *
 * - **Never send based on it.** Sending is the provider's job, against the
 *   provider's list. A local `confirmed` may be stale by months.
 * - **Never present the count as "current subscribers."** It is
 *   *"subscribers added via this site"*, and the admin screen says exactly
 *   that.
 *
 * What this collection *is* good for: proving consent (`confirmedAt`, plus the
 * source page), knowing whether the site is producing signups, and having a
 * local record if the provider account is ever lost or changed.
 *
 * ## Double opt-in
 *
 * submit → `pending` + token → confirmation email via Resend → click →
 * `confirmed` → synced to the provider. **Only confirmed subscribers sync**, so
 * an address typed in by someone else never reaches the marketing platform.
 * The click on the confirmation link is the consent record, not the submit.
 */

export const SUBSCRIBER_STATUSES = [
  /** Submitted the form; has not clicked the confirmation link yet. */
  'pending',
  /** Clicked the link. The only status that syncs to the provider. */
  'confirmed',
  /**
   * Known to have unsubscribed. Only ever set by hand or by a future
   * reconciliation — the provider does not tell us, by design.
   */
  'unsubscribed',
] as const;

export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

export interface INewsletterSubscriber {
  _id: Types.ObjectId;
  email: string;
  status: SubscriberStatus;

  /**
   * Single-use double-opt-in token, and `null` once spent.
   *
   * Nulled rather than left in place on confirmation so a leaked or archived
   * link cannot be replayed. `sparse` on the index because most rows have no
   * token and a unique index would otherwise collide on null.
   */
  confirmToken: string | null;
  confirmTokenExpiresAt: Date | null;

  /** When they clicked the link. The actual consent evidence. */
  confirmedAt: Date | null;
  /** Only set if we are told. Usually null — see the note above. */
  unsubscribedAt: Date | null;

  /** The page the form was submitted from, e.g. /blog/lukla-flights. */
  source?: string;

  /** The provider's id for this contact, once synced. Null until then. */
  providerContactId: string | null;
  /** When the last successful sync happened. Null means never synced. */
  syncedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const NewsletterSubscriberSchema = new Schema<INewsletterSubscriber>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: [...SUBSCRIBER_STATUSES],
      default: 'pending',
      index: true,
    },

    confirmToken: { type: String, default: null, index: { sparse: true } },
    confirmTokenExpiresAt: { type: Date, default: null },

    confirmedAt: { type: Date, default: null },
    unsubscribedAt: { type: Date, default: null },

    source: { type: String, trim: true },

    providerContactId: { type: String, default: null },
    syncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The admin list is "newest first, optionally filtered by status".
NewsletterSubscriberSchema.index({ status: 1, createdAt: -1 });

/*
 * Deliberately NOT a TTL index on pending rows.
 *
 * A TTL would delete a pending signup mid-confirmation if someone opened the
 * email a week later, with no record that it happened. The purge is a script
 * instead — `scripts/purge-pending-subscribers.ts` — so it runs when someone
 * decides it should, logs what it removed, and can be run with --dry-run first.
 * The rejected-submissions log is the opposite case: nothing there is ever
 * waited on, so a TTL is right there and wrong here.
 */

const NewsletterSubscriber: Model<INewsletterSubscriber> =
  mongoose.models.NewsletterSubscriber ||
  mongoose.model<INewsletterSubscriber>(
    'NewsletterSubscriber',
    NewsletterSubscriberSchema
  );

export default NewsletterSubscriber;
