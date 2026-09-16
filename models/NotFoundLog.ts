import mongoose, { Schema, Model, Types } from 'mongoose';

/**
 * Paths that 404'd and had no redirect pointing anywhere.
 *
 * This is the worklist for the two weeks after cutover: every row is a URL
 * somebody or something asked for and the site could not answer. CLAUDE.md
 * makes "unmapped 404s" part of the migration screen, and without a record of
 * them the only way to find a missed redirect is Search Console, which reports
 * days late and only for URLs Google already knew about.
 *
 * Infrastructure, not content — written by the system, never authored.
 *
 * ## One row per path, not one per hit
 *
 * A scanner asking for `/wp-login.php` four hundred times is one problem, not
 * four hundred rows. Each hit upserts and `$inc`s, so the collection stays the
 * size of the *distinct* 404 surface rather than the traffic to it — which is
 * also what makes "sort by hits" the right way to find the redirect worth
 * writing first.
 *
 * ## The TTL hangs off `lastSeenAt`, not `createdAt`
 *
 * So a path drops out 30 days after anyone last asked for it, rather than 30
 * days after it first appeared. A URL still being requested is still a live
 * problem however old it is, and one nobody has asked for in a month is not.
 */
export interface INotFoundLog {
  _id: Types.ObjectId;
  /** Path only, leading slash, no query string or domain. */
  path: string;
  hits: number;
  firstSeenAt: Date;
  /** Write-once per hit, and the field the TTL index is built on. */
  lastSeenAt: Date;
  /** The `referer` of the most recent hit — where the dead link lives. */
  referer?: string;
  userAgent?: string;
  /**
   * Dismissed by an admin as not worth a redirect.
   *
   * Kept rather than deleted: a deleted row reappears on the next hit and
   * re-clutters the list, so "I have looked at this and it needs nothing" has
   * to be a state the record can hold.
   */
  ignored: boolean;
}

const NotFoundLogSchema = new Schema<INotFoundLog>(
  {
    path: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    hits: { type: Number, default: 1, min: 1 },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: {
      type: Date,
      default: Date.now,
      // 30 days, in seconds. A path nobody has requested in a month is not a
      // migration problem any more.
      expires: 60 * 60 * 24 * 30,
    },
    referer: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    ignored: { type: Boolean, default: false, index: true },
  },
  // No `timestamps`: `firstSeenAt` and `lastSeenAt` say what those would say,
  // and `lastSeenAt` is declared by hand because the TTL index hangs off it.
  { timestamps: false, versionKey: false }
);

// The admin list is "most-requested unmapped 404s first".
NotFoundLogSchema.index({ ignored: 1, hits: -1 });

const NotFoundLog: Model<INotFoundLog> =
  mongoose.models.NotFoundLog ||
  mongoose.model<INotFoundLog>('NotFoundLog', NotFoundLogSchema);

export default NotFoundLog;
