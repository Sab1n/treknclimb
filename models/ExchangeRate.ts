import mongoose, { Schema, Model, Types } from 'mongoose';

/**
 * Display-currency conversion. Prices are stored in USD and never stored
 * pre-converted, so this collection is read at display time only. Structured
 * data and the sitemap always emit USD regardless of what is in here.
 */

export const RATE_SOURCES = ['api', 'manual'] as const;
export type RateSource = (typeof RATE_SOURCES)[number];

export const ROUNDING_RULES = [
  'none',
  'nearest-1',
  'nearest-5',
  'nearest-10',
  'nearest-100',
] as const;
export type RoundingRule = (typeof ROUNDING_RULES)[number];

export interface IExchangeRate {
  _id: Types.ObjectId;
  /** ISO 4217, uppercase — USD, EUR, GBP, AUD, NPR, INR. */
  currencyCode: string;
  /**
   * **Units of this currency per 1 USD.** A display price is `usdPrice * rate`.
   * USD itself is stored with a rate of 1.
   *
   * The direction is easy to invert by accident and the result looks plausible
   * either way, so: NPR is roughly 133 here, not 0.0075.
   */
  rate: number;
  source: RateSource;
  /**
   * When the rate itself was last refreshed — deliberately separate from
   * `updatedAt`, which moves whenever any field is touched. The dashboard
   * warns when this is more than 7 days old, so it has to mean "rate age".
   */
  lastUpdated: Date;
  /** Values chosen during modelling — pending client confirmation. */
  roundingRule: RoundingRule;
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const ExchangeRateSchema = new Schema<IExchangeRate>(
  {
    currencyCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
    },
    rate: { type: Number, required: true, min: 0 },
    source: {
      type: String,
      required: true,
      enum: [...RATE_SOURCES],
      default: 'api',
    },
    lastUpdated: { type: Date, required: true, default: Date.now },
    roundingRule: {
      type: String,
      required: true,
      enum: [...ROUNDING_RULES],
      default: 'nearest-1',
    },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

const ExchangeRate: Model<IExchangeRate> =
  mongoose.models.ExchangeRate ||
  mongoose.model<IExchangeRate>('ExchangeRate', ExchangeRateSchema);

export default ExchangeRate;
