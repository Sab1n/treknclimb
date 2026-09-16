import mongoose, { Schema, Model, Types } from 'mongoose';
import { IDestination } from './Destination';
import { PublishStatus, PUBLISH_STATUSES } from './shared/status';

/**
 * FAQs shown on the general /faq page and, where associated, on a destination
 * page. Both render with FAQPage JSON-LD.
 *
 * **There is no trip association, deliberately.** A trip's own questions live
 * in `Trip.faqs`, the embedded array, which is what the trip page renders and
 * what the trip editor writes. CLAUDE.md settles that trip FAQs are embedded
 * rather than a separate collection, and a single `trip` ref here could not
 * express 'this answer applies to these five trips' anyway — so it bought no
 * reuse over the embedded array while costing two sources for one section of
 * one page. Removed rather than left unread.
 *
 * `destination` stays nullable rather than optional: the key is always present
 * and null is a real value meaning 'this is a general answer', not missing
 * data. Same reasoning as `Trip.activity`.
 */
export interface IFaq {
  _id: Types.ObjectId;
  question: string;
  answer: string;
  /** Grouping on the general FAQ page — "Booking", "On the trail", "Money". */
  category?: string;
  destination: Types.ObjectId | null;
  displayOrder: number;
  status: PublishStatus;

  createdAt: Date;
  updatedAt: Date;
}

/** After `.populate('destination')`. */
export interface IFaqPopulated extends Omit<IFaq, 'destination'> {
  destination: IDestination | null;
}

const FaqSchema = new Schema<IFaq>(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true },
    category: { type: String, trim: true },
    destination: {
      type: Schema.Types.ObjectId,
      ref: 'Destination',
      default: null,
      index: true,
    },
    displayOrder: { type: Number, default: 0 },
    status: {
      type: String,
      required: true,
      enum: [...PUBLISH_STATUSES],
      default: 'draft',
      index: true,
    },
  },
  { timestamps: true }
);

const Faq: Model<IFaq> =
  mongoose.models.Faq || mongoose.model<IFaq>('Faq', FaqSchema);

export default Faq;
