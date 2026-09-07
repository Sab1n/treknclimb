import mongoose, { Schema, Model, Types } from 'mongoose';
import { ITrip } from './Trip';
import { IDestination } from './Destination';
import { PublishStatus, PUBLISH_STATUSES } from './shared/status';

/**
 * FAQs shown on the general /faq page and, where associated, inline on a trip
 * or destination page. Both render with FAQPage JSON-LD.
 *
 * `trip` and `destination` are independent nullable associations: an entry can
 * be general (both null), trip-specific, or destination-specific.
 */
export interface IFaq {
  _id: Types.ObjectId;
  question: string;
  answer: string;
  /** Grouping on the general FAQ page — "Booking", "On the trail", "Money". */
  category?: string;
  trip: Types.ObjectId | null;
  destination: Types.ObjectId | null;
  displayOrder: number;
  status: PublishStatus;

  createdAt: Date;
  updatedAt: Date;
}

/** After `.populate('trip destination')`. */
export interface IFaqPopulated extends Omit<IFaq, 'trip' | 'destination'> {
  trip: ITrip | null;
  destination: IDestination | null;
}

const FaqSchema = new Schema<IFaq>(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true },
    category: { type: String, trim: true },
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', default: null, index: true },
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
