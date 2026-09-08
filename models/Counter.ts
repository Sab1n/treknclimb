import mongoose, { Schema, Model } from 'mongoose';

/**
 * Atomic sequence counters. One document per sequence, keyed by name.
 *
 * The only writer is `lib/reference.ts`. This is not content and never appears
 * in the admin — it exists because MongoDB has no auto-increment and a
 * human-readable reference number needs one.
 *
 * `_id` is a string here rather than an ObjectId, deliberately: the key *is*
 * the identity ("booking:2026"), so an upsert on it needs no lookup first.
 */
export interface ICounter {
  _id: string;
  seq: number;
}

const CounterSchema = new Schema<ICounter>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false }
);

const Counter: Model<ICounter> =
  mongoose.models.Counter || mongoose.model<ICounter>('Counter', CounterSchema);

export default Counter;
