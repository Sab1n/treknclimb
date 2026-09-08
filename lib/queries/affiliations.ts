import { connectDB } from '../db';
import Affiliation, { IAffiliation } from '../../models/Affiliation';

/**
 * The licensing and membership bodies, in display order.
 *
 * Read by the affiliation strip beside the booking CTA, in the footer and on
 * the About page, and by the Organization JSON-LD's `memberOf`.
 */
export async function getAffiliations(): Promise<IAffiliation[]> {
  await connectDB();

  return Affiliation.find()
    .sort({ displayOrder: 1, name: 1 })
    .lean<IAffiliation[]>()
    .exec();
}
