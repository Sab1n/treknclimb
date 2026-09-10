import { connectDB } from '../db';
import Testimonial, { ITestimonialPopulated } from '../../models/Testimonial';

/*
 * Side-effect import: `.populate('trip')` resolves the ref by model name at
 * query time, and a model only registers when its module is first imported.
 * Nothing here uses the binding — importing it bare is the point.
 */
import '../../models/Trip';

/**
 * Published testimonials in display order, with their trip populated.
 *
 * The trip is populated because a quote attributed to a named route is worth
 * more than a floating one. `trip` is nullable — a general testimonial is a
 * real case, not missing data — so the card handles null.
 *
 * Nothing here feeds `aggregateRating`. These are display content with visible
 * attribution; see the JSON-LD prohibition in CLAUDE.md.
 */
export async function getPublishedTestimonials(
  limit?: number
): Promise<ITestimonialPopulated[]> {
  await connectDB();

  const query = Testimonial.find({ status: 'published' })
    .sort({ displayOrder: 1, createdAt: -1 })
    .populate('trip');

  if (limit) query.limit(limit);

  return query.lean<ITestimonialPopulated[]>().exec();
}
