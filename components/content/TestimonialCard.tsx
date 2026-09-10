import CloudinaryImage from '../ui/CloudinaryImage';
import { ITestimonialPopulated } from '../../models/Testimonial';

/**
 * One customer quote.
 *
 * **No stars, and no rating of any kind.** Testimonials are admin-curated
 * display content, not a review system — there is no first-party collection
 * behind them, so a star row would be decoration implying data we do not have.
 * Trip-level ratings, where they exist, are shown with their source named
 * ("4.9 on TripAdvisor from 186 reviews") and are never emitted as
 * `aggregateRating` in JSON-LD.
 *
 * The trip is named but not linked: `testimonial.trip` is populated one level
 * deep, so it carries a title but only ObjectIds for its destination and
 * activity — and a trip URL needs those slugs. A two-level populate for one
 * link is not worth it here.
 */
export default function TestimonialCard({
  testimonial,
}: {
  testimonial: ITestimonialPopulated;
}) {
  return (
    <figure className="flex h-full flex-col rounded-lg border border-hairline bg-white p-6">
      <blockquote className="flex-1 text-base leading-relaxed">
        <p>&ldquo;{testimonial.quote}&rdquo;</p>
      </blockquote>

      <figcaption className="mt-5 flex items-center gap-3 border-t border-hairline pt-5">
        {testimonial.photo && testimonial.photoAlt && (
          <CloudinaryImage
            src={testimonial.photo}
            alt={testimonial.photoAlt}
            width={80}
            height={80}
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        )}

        <div className="min-w-0">
          <p className="text-sm font-semibold">{testimonial.name}</p>
          <p className="truncate text-xs text-muted">
            {[testimonial.country, testimonial.trip?.title]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </figcaption>
    </figure>
  );
}
