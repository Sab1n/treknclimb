import { TripDifficulty } from '../models/Trip';

/**
 * What each difficulty grade means, as shown on activity pages.
 *
 * **Hardcoded reference data, not CMS content.** The grades are a property of
 * the company's grading system, not of any one activity — the same four apply
 * to trekking, peak climbing and hiking alike. `Activity` has no fields for
 * them, and adding four per activity would mean maintaining the same table
 * three times over and letting the copies drift.
 *
 * If the client ever needs to edit this without a deploy it belongs in
 * `SiteSettings`, not on `Activity`.
 *
 * `Record<TripDifficulty, GradeExplainer>` is what keeps it honest: the key
 * type is the difficulty union itself, so adding a fifth grade to
 * `TRIP_DIFFICULTIES` turns this object into a compile error until the new row
 * is written. A plain array would have let the table silently fall behind.
 */
export interface GradeExplainer {
  dailyWalking: string;
  altitude: string;
  suits: string;
}

export const DIFFICULTY_GRADES: Record<TripDifficulty, GradeExplainer> = {
  Easy: {
    dailyWalking: '3–5 hrs',
    altitude: 'under 4,000 m',
    suits: 'First-timers, families with teenagers',
  },
  Moderate: {
    dailyWalking: '5–7 hrs',
    altitude: '4,000–5,500 m',
    suits: 'Regular hillwalkers, no altitude experience needed',
  },
  Challenging: {
    dailyWalking: '6–8 hrs',
    altitude: '5,000–5,600 m',
    suits: 'Previous multi-day trekking, good cardio base',
  },
  Extreme: {
    dailyWalking: '7–10 hrs',
    altitude: 'above 5,600 m',
    suits: 'Prior high-altitude experience required',
  },
};

/** Ordered easiest to hardest, for rendering the table in a sensible sequence. */
export const GRADE_ORDER: TripDifficulty[] = [
  'Easy',
  'Moderate',
  'Challenging',
  'Extreme',
];
