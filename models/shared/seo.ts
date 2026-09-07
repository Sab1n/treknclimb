import { SchemaDefinition } from 'mongoose';

/**
 * The shared SEO field set, applied to every indexable content type.
 *
 * Two exports that have to stay in step: an interface for the TypeScript side
 * and a schema-definition fragment for the Mongoose side. A model picks up
 * both — `interface ITrip extends ISeoFields` and `...seoFields` spread into
 * its schema definition.
 *
 * No `focusKeyword`. It was a note-to-self field that affected nothing.
 */
export interface ISeoFields {
  metaTitle?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  schemaType?: string;
  noIndex: boolean;
}

/**
 * `SchemaDefinition<ISeoFields>` is Mongoose's type for "the object you hand
 * to `new Schema()`", narrowed to these eight fields. It spreads into a larger
 * definition because every key it declares also exists, with the same type, on
 * the model spreading it — which is exactly what `extends ISeoFields` on the
 * interface guarantees.
 */
export const seoFields: SchemaDefinition<ISeoFields> = {
  metaTitle: { type: String, trim: true },
  metaDescription: { type: String, trim: true },
  canonicalUrl: { type: String, trim: true },
  ogTitle: { type: String, trim: true },
  ogDescription: { type: String, trim: true },
  ogImage: { type: String, trim: true },
  schemaType: { type: String, trim: true },
  noIndex: { type: Boolean, default: false },
};
