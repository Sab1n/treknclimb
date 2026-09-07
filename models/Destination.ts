import mongoose, { Schema, Model } from 'mongoose';

export interface IDestination {
  _id: string;
  name: string;
  slug: string;
  description: string;
  coverImage: string;
  coverImageAlt: string;
  hasActivities: boolean;
  metaTitle?: string;
  metaDescription?: string;
  displayOrder: number;
}

const DestinationSchema = new Schema<IDestination>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, required: true },
    coverImage: { type: String, required: true },
    coverImageAlt: { type: String, required: true },
    hasActivities: { type: Boolean, default: false },
    metaTitle: { type: String },
    metaDescription: { type: String },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Destination: Model<IDestination> =
  mongoose.models.Destination ||
  mongoose.model<IDestination>('Destination', DestinationSchema);

export default Destination;