import mongoose, { Schema, Model, Types } from 'mongoose';

/**
 * The single admin role. Credentials are seeded from environment variables on
 * first deploy — there is no public registration route.
 *
 * Note the `select: false` on every secret below. It means these fields are
 * left out of query results unless a query asks for them explicitly
 * (`.select('+passwordHash')`), so an admin document cannot leak a hash by
 * being passed somewhere careless. The login handler is the one place that
 * opts back in.
 */
export interface IAdmin {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  /**
   * Incremented on password change. Every issued JWT carries the version it was
   * signed under, so bumping this invalidates all existing sessions at once
   * without a session store to purge.
   */
  tokenVersion: number;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  /** The reset token is stored hashed, like a password — never in plain text. */
  resetTokenHash: string | null;
  resetTokenExpiresAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const AdminSchema = new Schema<IAdmin>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null, trim: true },
    resetTokenHash: { type: String, default: null, select: false },
    resetTokenExpiresAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

const Admin: Model<IAdmin> =
  mongoose.models.Admin || mongoose.model<IAdmin>('Admin', AdminSchema);

export default Admin;
