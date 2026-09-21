/**
 * ============================================================================
 * PLACEHOLDER DEVELOPMENT CONTENT — NOT CLIENT COPY. DO NOT SHIP.
 * ============================================================================
 *
 * Six published trips so the destination and listing pages have something to
 * render during development. Every word of it was written here, not supplied
 * by Trek & Climb Adventure.
 *
 * The trek names, regions, altitudes and seasons are real geography, and the
 * durations and route profiles are plausible. **The prices, inclusions,
 * exclusions, FAQ answers, highlights and all marketing copy are invented.**
 * They are the right shape, not the right content. Every one of these
 * documents must be replaced or rewritten by the client before launch.
 *
 * Deliberately NOT part of `seed.ts`. That script seeds fixed reference data
 * that the CMS never creates — destinations, activities, affiliations, the
 * blog taxonomy, the settings singleton. Trips are ordinary CMS content, so
 * they do not belong in the same place. This file exists only so that pages
 * are not all empty states while the admin is being built, and should be
 * deleted once real trips are entered.
 *
 *   npx tsx --env-file=.env.local scripts/seed-trips.ts
 *   npx tsx --env-file=.env.local scripts/seed-trips.ts --force
 *
 * Cloudinary IDs used are listed at the bottom of this file.
 *
 * Deliberately left unset: ratingAverage, ratingCount, ratingSource and
 * travellersCompleted. Inventing review counts and traveller numbers would put
 * fabricated social proof on the site, which is a different class of mistake
 * from placeholder prose.
 */

import mongoose from 'mongoose';
import { connectDB } from '../lib/db';
import Destination from '../models/Destination';
import Activity from '../models/Activity';
import Region from '../models/Region';
import Trip, { ITrip, IItineraryDay } from '../models/Trip';

/**
 * `Partial<T>` makes every field of T optional, so `extra` can carry any
 * subset of the remaining itinerary-day fields without listing them.
 */
function day(
  n: number,
  title: string,
  maxAltitudeM: number,
  description: string,
  extra: Partial<IItineraryDay> = {}
): IItineraryDay {
  return { day: n, title, maxAltitudeM, description, ...extra };
}

/**
 * What a seed literal supplies. The refs are resolved from slugs below, and
 * everything the schema defaults is stripped out.
 */
type TripSeed = Omit<
  ITrip,
  | '_id'
  | 'createdAt'
  | 'updatedAt'
  | 'slugHistory'
  | 'noIndex'
  // Trips can only be related to each other once they all have ObjectIds,
  // so this stays empty here and is set in the admin.
  | 'relatedTrips'
  | 'destination'
  | 'activity'
  | 'region'
  // Added after this seed ran, and both default to [] on the schema. Seeded
  // separately by scripts/seed-departures.ts, never by re-running this.
  | 'departureSeasons'
  | 'blackoutPeriods'
> & {
  destinationSlug: string;
  /** null for India, Tibet and Bhutan — the asymmetry, in seed form. */
  activitySlug: string | null;
  /**
   * A `Region` slug, resolved to an ObjectId at insert like the other two refs.
   *
   * null where no region record exists for the place. Ladakh and Paro/Thimphu
   * were real free-text values before regions became a collection, and there
   * are no India or Bhutan region records to point them at — nor any route that
   * would render one, since the only region URL sits under an activity segment.
   * Left null rather than invented.
   */
  regionSlug: string | null;
};

const trips: TripSeed[] = [
  /* ---------------------------------------------------------------- *
   * NEPAL · TREKKING
   * ---------------------------------------------------------------- */
  {
    destinationSlug: 'nepal',
    activitySlug: 'trekking',
    title: 'Everest Base Camp Trek',
    slug: 'everest-base-camp-trek',
    tripCode: 'TNC-EBC-14',
    summary:
      'The classic route into the Khumbu, with two acclimatisation days built in rather than one.',
    answerBlock:
      'The Everest Base Camp trek costs from USD 1,295 per person and takes 14 days from Lukla and back. It reaches 5,364 m at base camp and 5,545 m at Kala Patthar. It is graded moderate: no climbing skill is needed, but you walk 5 to 7 hours on most days. The best months are late September to November and March to May.',
    description:
      'This is the classic route into the Khumbu, following the Dudh Koshi from Lukla to Namche Bazaar, then up through Tengboche and Dingboche to Gorak Shep and base camp itself. We build in two acclimatisation days rather than one, which is the single biggest factor in whether people reach Kala Patthar feeling well.\n\nYou sleep in teahouses throughout. A porter carries the main duffel and you walk with a daypack. Group size is capped at twelve, above which we add a second guide.',
    coverImage: 'treknclimb/trips/everest-base-camp-trek',
    coverImageAlt: 'Trekkers on the trail below Ama Dablam in the Khumbu valley',
    gallery: [
      {
        url: 'treknclimb/trips/everest-base-camp-trek-namche',
        alt: 'Namche Bazaar spread across its terraced hillside',
        caption: 'Namche Bazaar, 3,440 m',
      },
      {
        url: 'treknclimb/trips/everest-base-camp-trek-kala-patthar',
        alt: 'Sunrise on the Everest south face seen from Kala Patthar',
      },
    ],
    durationDays: 14,
    difficulty: 'Moderate',
    hasElevationProfile: true,
    tripGrade: 'Teahouse trek, high altitude',
    maxAltitudeM: 5545,
    regionSlug: 'everest',
    minGroupSize: 1,
    maxGroupSize: 12,
    bestMonths: ['March', 'April', 'May', 'September', 'October', 'November'],
    startPoint: 'Kathmandu',
    endPoint: 'Kathmandu',
    accommodation: 'Teahouses throughout the trek',
    meals: 'Three meals a day while trekking',
    transportation: 'Return flights Kathmandu–Lukla, airport transfers',
    price: 1295,
    priceLabel: 'From USD 1,295 per person',
    groupPricing: [
      { minPeople: 1, maxPeople: 1, pricePerPerson: 1795, label: 'Private guide throughout' },
      { minPeople: 2, maxPeople: 4, pricePerPerson: 1495, label: 'One guide, one porter per two' },
      { minPeople: 5, maxPeople: 8, pricePerPerson: 1395, label: 'Most common group size' },
      { minPeople: 9, maxPeople: 12, pricePerPerson: 1295, label: 'Second guide added' },
    ],
    highlights: [
      'Two acclimatisation days, at Namche and Dingboche, rather than one',
      'Sunrise from Kala Patthar at 5,545 m, the classic view of the Everest south face',
      'Tengboche monastery, the largest gompa in the Khumbu',
      'A contingency day built in for Lukla flight delays',
    ],
    itinerary: [
      day(1, 'Fly to Lukla, trek to Phakding', 2610, 'Early flight into Lukla, then a gentle descent along the Dudh Koshi to Phakding. Three to four hours walking.', { accommodation: 'Teahouse', meals: 'L, D', durationHours: 3.5, distanceKm: 8 }),
      day(2, 'Phakding to Namche Bazaar', 3440, 'Cross the Hillary Suspension Bridge and climb through pine forest. First view of Everest on the ridge before Namche if the cloud lifts.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 6.5, distanceKm: 11 }),
      day(3, 'Acclimatisation day at Namche', 3860, 'A rest day that is not a rest: we walk up to the Everest View Hotel and back down to sleep low.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 4 }),
      day(4, 'Namche to Tengboche', 3860, 'Contour above the Dudh Koshi, drop to Phunki Tenga, then climb to the monastery.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 5.5, distanceKm: 10 }),
      day(5, 'Tengboche to Dingboche', 4410, 'Through rhododendron forest to Pangboche, then out above the treeline into the Imja valley.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 5.5, distanceKm: 12 }),
      day(6, 'Acclimatisation day at Dingboche', 4730, 'Climb Nangkartshang ridge for the altitude, then back down to Dingboche to sleep.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 4 }),
      day(7, 'Dingboche to Lobuche', 4940, 'Up the Khumbu glacier moraine past the memorials at Thukla pass.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 5, distanceKm: 8 }),
      day(8, 'Lobuche to Gorak Shep, then Base Camp', 5364, 'A short morning to Gorak Shep, then out along the glacier to base camp and back.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 7, distanceKm: 13 }),
      day(9, 'Kala Patthar, descend to Pheriche', 5545, 'Pre-dawn climb to Kala Patthar for sunrise on Everest, then a long descent.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 7 }),
      day(10, 'Pheriche to Namche Bazaar', 3440, 'Retrace the valley, dropping back below the treeline.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 6.5 }),
      day(11, 'Namche to Lukla', 2860, 'The last long day on the trail, back across the suspension bridges.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 7 }),
      day(12, 'Contingency day at Lukla', 2860, 'Held in reserve for weather. Lukla flights are cancelled often enough that a spare day is not optional.', { accommodation: 'Teahouse', meals: 'B, L, D' }),
      day(13, 'Fly Lukla to Kathmandu', 1400, 'Morning flight back to Kathmandu, afternoon free.', { accommodation: 'Hotel', meals: 'B' }),
      day(14, 'Departure', 1400, 'Transfer to the airport.', { meals: 'B' }),
    ],
    includes: [
      'Return Kathmandu–Lukla flights',
      'All teahouse accommodation on trek',
      'Three meals a day while trekking',
      'Licensed English-speaking guide',
      'Porter, one per two trekkers',
      'TIMS card and Sagarmatha National Park fee',
      'Airport transfers in Kathmandu',
    ],
    excludes: [
      'International flights to Kathmandu',
      'Nepal visa fee',
      'Travel and evacuation insurance',
      'Kathmandu hotel and meals',
      'Drinks, hot showers and device charging',
      'Tips for guide and porter',
    ],
    faqs: [
      {
        question: 'How much does the Everest Base Camp trek cost?',
        answer:
          'From USD 1,295 per person in a group of nine to twelve, rising to USD 1,795 for a solo traveller with a private guide. That includes Lukla flights, permits, teahouse accommodation and all meals on trek. There are no permit fees to pay on the trail.',
      },
      {
        question: 'Do I need previous high-altitude experience?',
        answer:
          'No. You need to be comfortable walking five to seven hours on consecutive days on uneven ground. Altitude tolerance matters more than speed, which is why the itinerary includes two acclimatisation days rather than one.',
      },
      {
        question: 'What happens if the Lukla flight is cancelled?',
        answer:
          'There is a contingency day built into the itinerary. If weather closes Lukla for longer than that, we rebook the next available flight or arrange a helicopter transfer at cost.',
      },
    ],
    metaTitle: 'Everest Base Camp Trek — 14 Days, Permits and Lukla Flights Included',
    metaDescription:
      'Guided 14-day Everest Base Camp trek with two acclimatisation days, Lukla flights, permits and all meals on trek included. From USD 1,295 per person.',
    status: 'published',
    featured: true,
    badge: 'Most booked',
    displayOrder: 1,
  },

  {
    destinationSlug: 'nepal',
    activitySlug: 'trekking',
    title: 'Annapurna Base Camp Trek',
    slug: 'annapurna-base-camp-trek',
    tripCode: 'TNC-ABC-11',
    summary:
      'Into the Annapurna Sanctuary through bamboo forest and terraced villages, with no altitude above 4,200 m.',
    answerBlock:
      'The Annapurna Base Camp trek costs from USD 840 per person and takes 11 days from Pokhara. It reaches 4,130 m at the sanctuary. It is graded moderate, with five to six hours of walking on most days and a great many stone steps. The best months are March to May and October to November.',
    description:
      'The route climbs from Nayapul through Ghandruk and the Modi Khola gorge into the Annapurna Sanctuary, a glacial basin ringed by peaks on every side. It is lower than the Everest routes and can be walked comfortably by anyone used to consecutive days on hills.\n\nThe descent takes in the hot springs at Jhinu Danda, which is the most popular afternoon of the whole trip.',
    coverImage: 'treknclimb/trips/annapurna-base-camp-trek',
    coverImageAlt: 'The Annapurna Sanctuary ringed by peaks at first light',
    gallery: [
      {
        url: 'treknclimb/trips/annapurna-base-camp-trek-ghandruk',
        alt: 'Stone houses and terraced fields at Ghandruk with Annapurna South behind',
      },
      {
        url: 'treknclimb/trips/annapurna-base-camp-trek-machhapuchhre',
        alt: 'Machhapuchhre rising above the Modi Khola valley',
      },
    ],
    durationDays: 11,
    difficulty: 'Moderate',
    hasElevationProfile: true,
    tripGrade: 'Teahouse trek, moderate altitude',
    maxAltitudeM: 4130,
    regionSlug: 'annapurna',
    minGroupSize: 1,
    maxGroupSize: 12,
    bestMonths: ['March', 'April', 'May', 'October', 'November'],
    startPoint: 'Pokhara',
    endPoint: 'Pokhara',
    accommodation: 'Teahouses throughout the trek',
    meals: 'Three meals a day while trekking',
    transportation: 'Private vehicle Pokhara–Nayapul and Siwai–Pokhara',
    price: 840,
    priceLabel: 'From USD 840 per person',
    groupPricing: [
      { minPeople: 1, maxPeople: 1, pricePerPerson: 1180, label: 'Private guide throughout' },
      { minPeople: 2, maxPeople: 4, pricePerPerson: 980, label: 'One guide, one porter per two' },
      { minPeople: 5, maxPeople: 12, pricePerPerson: 840, label: 'Most common group size' },
    ],
    highlights: [
      'The Annapurna Sanctuary, a glacial basin enclosed by peaks on all sides',
      'Ghandruk, one of the largest Gurung villages in the region',
      'Hot springs at Jhinu Danda on the way down',
      'No altitude above 4,200 m, so acclimatisation is straightforward',
    ],
    itinerary: [
      day(1, 'Pokhara to Nayapul, trek to Tikhedhunga', 1540, 'Short drive to the trailhead, then a gentle first afternoon along the Bhurungdi Khola.', { accommodation: 'Teahouse', meals: 'L, D', durationHours: 4 }),
      day(2, 'Tikhedhunga to Ghorepani', 2874, 'The long stone staircase to Ulleri, then forest to Ghorepani.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 6.5 }),
      day(3, 'Poon Hill, then on to Tadapani', 3210, 'Pre-dawn climb to Poon Hill for the Dhaulagiri panorama, then a traverse to Tadapani.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 6 }),
      day(4, 'Tadapani to Chhomrong', 2170, 'Down through rhododendron forest to Ghandruk, then across to Chhomrong.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 5 }),
      day(5, 'Chhomrong to Dovan', 2600, 'Into the Modi Khola gorge, through bamboo forest.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 5.5 }),
      day(6, 'Dovan to Deurali', 3230, 'The valley narrows and steepens as the treeline drops away.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 4.5 }),
      day(7, 'Deurali to Annapurna Base Camp', 4130, 'Past Machhapuchhre Base Camp and into the sanctuary itself. Afternoon free for the moraine.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 5 }),
      day(8, 'Base Camp to Bamboo', 2310, 'Sunrise on the sanctuary rim, then a long descent.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 6.5 }),
      day(9, 'Bamboo to Jhinu Danda', 1780, 'Back out of the gorge, with the hot springs below the village in the afternoon.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 5 }),
      day(10, 'Jhinu Danda to Siwai, drive to Pokhara', 900, 'Short walk to the road head and a two-hour drive back.', { accommodation: 'Hotel', meals: 'B, L' }),
      day(11, 'Departure', 900, 'Transfer to Pokhara airport or the tourist bus stand.', { meals: 'B' }),
    ],
    includes: [
      'Private vehicle transfers Pokhara–Nayapul and Siwai–Pokhara',
      'All teahouse accommodation on trek',
      'Three meals a day while trekking',
      'Licensed English-speaking guide',
      'Porter, one per two trekkers',
      'ACAP permit and TIMS card',
    ],
    excludes: [
      'Flights to Pokhara',
      'Nepal visa fee',
      'Travel and evacuation insurance',
      'Pokhara hotel and meals',
      'Hot springs entry, drinks and charging',
      'Tips for guide and porter',
    ],
    faqs: [
      {
        question: 'How fit do I need to be for Annapurna Base Camp?',
        answer:
          'Comfortable walking five to six hours on consecutive days. The route has a great many stone steps rather than sustained altitude, so leg strength matters more here than acclimatisation.',
      },
      {
        question: 'Can this be combined with Poon Hill?',
        answer:
          'It already is. The standard itinerary goes over Poon Hill on day three, which adds the Dhaulagiri panorama without extending the trip.',
      },
    ],
    metaTitle: 'Annapurna Base Camp Trek — 11 Days from Pokhara',
    metaDescription:
      'Guided 11-day Annapurna Base Camp trek via Poon Hill and Ghandruk, with permits, teahouse accommodation and all meals on trek. From USD 840 per person.',
    status: 'published',
    featured: true,
    displayOrder: 2,
  },

  /* ---------------------------------------------------------------- *
   * NEPAL · PEAK CLIMBING
   * ---------------------------------------------------------------- */
  {
    destinationSlug: 'nepal',
    activitySlug: 'peak-climbing',
    title: 'Island Peak Climbing',
    slug: 'island-peak-climbing',
    tripCode: 'TNC-IMJ-16',
    summary:
      'A 6,189 m trekking peak in the Khumbu, with rope and crampon training days built into the approach.',
    answerBlock:
      'Island Peak (Imja Tse) costs from USD 2,150 per person and takes 16 days. It reaches 6,189 m at the summit. It is graded challenging: you need no previous climbing experience, but you will use a harness, crampons, an ice axe and fixed ropes on summit day. The best months are April to May and October to November.',
    description:
      'Island Peak is the most climbed of Nepal’s trekking peaks and the usual first 6,000 m summit. The approach follows the Everest Base Camp trail as far as Dingboche before turning east into the Imja valley.\n\nTwo training days are built in — one at Chhukung on rope technique and crampon work, one at base camp on the fixed lines. Summit day starts around one in the morning and runs to twelve hours.',
    coverImage: 'treknclimb/trips/island-peak-climbing',
    coverImageAlt: 'Climber on the fixed ropes of the Island Peak headwall at dawn',
    gallery: [
      {
        url: 'treknclimb/trips/island-peak-climbing-basecamp',
        alt: 'Tents at Island Peak base camp below the glacier',
      },
      {
        url: 'treknclimb/trips/island-peak-climbing-summit-ridge',
        alt: 'The summit ridge of Island Peak with Lhotse behind',
      },
    ],
    durationDays: 16,
    difficulty: 'Challenging',
    hasElevationProfile: true,
    tripGrade: 'Trekking peak, PD',
    maxAltitudeM: 6189,
    regionSlug: 'everest',
    peakName: 'Island Peak (Imja Tse)',
    minGroupSize: 1,
    maxGroupSize: 8,
    bestMonths: ['April', 'May', 'October', 'November'],
    startPoint: 'Kathmandu',
    endPoint: 'Kathmandu',
    accommodation: 'Teahouses on trek, tented base camp for two nights',
    meals: 'Three meals a day while trekking and climbing',
    transportation: 'Return flights Kathmandu–Lukla, airport transfers',
    price: 2150,
    priceLabel: 'From USD 2,150 per person',
    groupPricing: [
      { minPeople: 1, maxPeople: 1, pricePerPerson: 2850, label: 'One climbing guide to one climber' },
      { minPeople: 2, maxPeople: 4, pricePerPerson: 2450, label: 'One climbing guide per two on summit day' },
      { minPeople: 5, maxPeople: 8, pricePerPerson: 2150, label: 'Additional climbing guide added' },
    ],
    highlights: [
      'A 6,189 m summit reachable without prior climbing experience',
      'Two dedicated training days on rope, crampon and fixed-line technique',
      'One climbing guide per two climbers on summit day',
      'Acclimatisation follows the Everest Base Camp profile before turning east',
    ],
    itinerary: [
      day(1, 'Fly to Lukla, trek to Phakding', 2610, 'Morning flight to Lukla and a short first day down the valley.', { accommodation: 'Teahouse', meals: 'L, D', durationHours: 3.5 }),
      day(2, 'Phakding to Namche Bazaar', 3440, 'The long climb to Namche through the pine forest above the river.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 6.5 }),
      day(3, 'Acclimatisation day at Namche', 3860, 'Walk high to the Everest View Hotel, sleep low at Namche.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 4 }),
      day(4, 'Namche to Tengboche', 3860, 'Across the Dudh Koshi and up to the monastery.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 5.5 }),
      day(5, 'Tengboche to Dingboche', 4410, 'Above the treeline into the Imja valley.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 5.5 }),
      day(6, 'Acclimatisation day at Dingboche', 4730, 'Nangkartshang ridge for the altitude, back down to sleep.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 4 }),
      day(7, 'Dingboche to Chhukung', 4730, 'A short day east up the valley, saving legs for the training day.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 3 }),
      day(8, 'Training day at Chhukung', 5000, 'Harness, crampons, ice axe, ascender and abseil practice on a nearby slope.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 5 }),
      day(9, 'Chhukung to Island Peak Base Camp', 5100, 'Move up to the tented base camp below the glacier.', { accommodation: 'Tented camp', meals: 'B, L, D', durationHours: 3.5 }),
      day(10, 'Fixed-line practice at base camp', 5200, 'A second session on the lines, then an early night.', { accommodation: 'Tented camp', meals: 'B, L, D', durationHours: 3 }),
      day(11, 'Summit day, descend to Chhukung', 6189, 'A one a.m. start, the headwall on fixed ropes, the summit ridge, then all the way back down. Ten to twelve hours.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 12 }),
      day(12, 'Contingency day', 5100, 'Held in reserve for weather or a second summit attempt.', { accommodation: 'Teahouse', meals: 'B, L, D' }),
      day(13, 'Chhukung to Tengboche', 3860, 'Back down the Imja valley.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 6.5 }),
      day(14, 'Tengboche to Lukla', 2860, 'The last long descent to the airstrip.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 7.5 }),
      day(15, 'Fly Lukla to Kathmandu', 1400, 'Morning flight, afternoon free.', { accommodation: 'Hotel', meals: 'B' }),
      day(16, 'Departure', 1400, 'Transfer to the airport.', { meals: 'B' }),
    ],
    includes: [
      'Return Kathmandu–Lukla flights',
      'Island Peak climbing permit and Sagarmatha National Park fee',
      'Climbing guide, one per two climbers on summit day',
      'Group climbing equipment — ropes, ice screws, snow bar',
      'Tented base camp with cook and kitchen crew',
      'All teahouse accommodation and meals on trek',
    ],
    excludes: [
      'International flights to Kathmandu',
      'Personal climbing gear — boots, harness, crampons, axe (rental available in Kathmandu)',
      'Travel and high-altitude evacuation insurance',
      'Nepal visa fee',
      'Kathmandu hotel and meals',
      'Tips for guide, porter and kitchen crew',
    ],
    faqs: [
      {
        question: 'Do I need climbing experience for Island Peak?',
        answer:
          'No, but you need to be a strong trekker. Two training days cover the rope work, crampon technique and fixed-line ascent you will use on summit day. Previous experience on a via ferrata or a glacier course helps but is not required.',
      },
      {
        question: 'How long is summit day?',
        answer:
          'Ten to twelve hours, starting around one in the morning from base camp and returning to Chhukung the same day.',
      },
      {
        question: 'Can I rent climbing equipment?',
        answer:
          'Yes. Boots, crampons, harness, axe and a down jacket can all be hired in Kathmandu. We send a checklist once your dates are confirmed.',
      },
    ],
    metaTitle: 'Island Peak Climbing — 16 Days, 6,189 m, Training Days Included',
    metaDescription:
      'Guided 16-day Island Peak (Imja Tse) climb in the Khumbu with two rope and crampon training days, permits and tented base camp. From USD 2,150 per person.',
    status: 'published',
    featured: false,
    displayOrder: 3,
  },

  /* ---------------------------------------------------------------- *
   * NEPAL · HIKING
   * ---------------------------------------------------------------- */
  {
    destinationSlug: 'nepal',
    activitySlug: 'hiking',
    title: 'Poon Hill Trek',
    slug: 'poon-hill-trek',
    tripCode: 'TNC-PH-05',
    summary:
      'Five days out of Pokhara for the Dhaulagiri sunrise, with no night above 3,000 m.',
    answerBlock:
      'The Poon Hill trek costs from USD 520 per person and takes 5 days from Pokhara. It reaches 3,210 m at the Poon Hill viewpoint and sleeps no higher than 2,874 m. It is graded easy and suits first-time trekkers with no altitude experience. The best months are March to May and October to December.',
    description:
      'The shortest route we run that still gets a full Himalayan panorama. From Nayapul the trail climbs through Gurung and Magar villages to Ghorepani, and a pre-dawn walk up Poon Hill puts Dhaulagiri, Annapurna South and Machhapuchhre in one view.\n\nNothing here needs altitude experience, and the trail is well served by teahouses the whole way.',
    coverImage: 'treknclimb/trips/poon-hill-trek',
    coverImageAlt: 'Sunrise over Dhaulagiri from the Poon Hill viewpoint',
    gallery: [
      {
        url: 'treknclimb/trips/poon-hill-trek-rhododendron',
        alt: 'Rhododendron forest in bloom on the trail above Ghorepani',
      },
      {
        url: 'treknclimb/trips/poon-hill-trek-ulleri',
        alt: 'The stone staircase climbing to Ulleri village',
      },
    ],
    durationDays: 5,
    difficulty: 'Easy',
    hasElevationProfile: true,
    tripGrade: 'Teahouse trek, low altitude',
    maxAltitudeM: 3210,
    regionSlug: 'annapurna',
    minGroupSize: 1,
    maxGroupSize: 14,
    bestMonths: ['March', 'April', 'May', 'October', 'November', 'December'],
    startPoint: 'Pokhara',
    endPoint: 'Pokhara',
    accommodation: 'Teahouses throughout the trek',
    meals: 'Three meals a day while trekking',
    transportation: 'Private vehicle Pokhara–Nayapul and Nayapul–Pokhara',
    price: 520,
    priceLabel: 'From USD 520 per person',
    groupPricing: [
      { minPeople: 1, maxPeople: 1, pricePerPerson: 720, label: 'Private guide throughout' },
      { minPeople: 2, maxPeople: 5, pricePerPerson: 620, label: 'One guide for the group' },
      { minPeople: 6, maxPeople: 14, pricePerPerson: 520, label: 'Second guide added' },
    ],
    highlights: [
      'Sunrise over Dhaulagiri, Annapurna South and Machhapuchhre from Poon Hill',
      'Rhododendron forest in bloom through March and April',
      'No night above 2,874 m, so altitude is not a factor',
      'Five days door to door from Pokhara',
    ],
    itinerary: [
      day(1, 'Pokhara to Nayapul, trek to Tikhedhunga', 1540, 'An hour and a half by road, then a gentle valley walk to the first teahouse.', { accommodation: 'Teahouse', meals: 'L, D', durationHours: 4 }),
      day(2, 'Tikhedhunga to Ghorepani', 2874, 'The Ulleri staircase — around 3,300 stone steps — then oak and rhododendron forest.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 6.5 }),
      day(3, 'Poon Hill sunrise, on to Tadapani', 3210, 'Up in the dark for the viewpoint, back for breakfast, then a forest traverse to Tadapani.', { accommodation: 'Teahouse', meals: 'B, L, D', durationHours: 6 }),
      day(4, 'Tadapani to Ghandruk, drive to Pokhara', 1940, 'Down to Ghandruk for lunch and a look at the Gurung museum, then the road back.', { accommodation: 'Hotel', meals: 'B, L' }),
      day(5, 'Departure', 900, 'Transfer to Pokhara airport or the tourist bus stand.', { meals: 'B' }),
    ],
    includes: [
      'Private vehicle transfers to and from the trailhead',
      'All teahouse accommodation on trek',
      'Three meals a day while trekking',
      'Licensed English-speaking guide',
      'ACAP permit and TIMS card',
    ],
    excludes: [
      'Flights to Pokhara',
      'Nepal visa fee',
      'Travel insurance',
      'Pokhara hotel and meals',
      'Porter (available on request)',
      'Drinks, charging and tips',
    ],
    faqs: [
      {
        question: 'Is Poon Hill suitable for a first trek?',
        answer:
          'Yes. It is the route we most often suggest for a first time at altitude. Nothing is above 3,210 m, every night is in a teahouse, and the longest day is around six and a half hours.',
      },
      {
        question: 'Can children do this trek?',
        answer:
          'Comfortably, from about ten years old if they are used to day walks. The Ulleri staircase on day two is the only part that tends to be remembered as hard work.',
      },
    ],
    metaTitle: 'Poon Hill Trek — 5 Days from Pokhara, No Altitude Experience Needed',
    metaDescription:
      'Guided 5-day Poon Hill trek from Pokhara for the Dhaulagiri and Annapurna sunrise. Teahouse accommodation, permits and meals included. From USD 520.',
    status: 'published',
    featured: false,
    badge: 'Best for a first trek',
    displayOrder: 4,
  },

  /* ---------------------------------------------------------------- *
   * INDIA · no activity layer
   * ---------------------------------------------------------------- */
  {
    destinationSlug: 'india',
    activitySlug: null,
    title: 'Markha Valley Trek',
    slug: 'markha-valley-trek',
    tripCode: 'TNC-MKV-09',
    summary:
      'Nine days across Ladakh’s high desert, over two passes, while Nepal is under monsoon.',
    answerBlock:
      'The Markha Valley trek costs from USD 1,050 per person and takes 9 days from Leh. It crosses the Kongmaru La at 5,150 m. It is graded moderate, with river crossings and two pass days. The best months are June to September, when the Nepal Himalaya is under monsoon.',
    description:
      'Markha is the classic Ladakh traverse: a high-desert valley of ochre and grey rock, Buddhist villages with homestays, and two passes over 4,900 m. The Nimaling plain below Kang Yatse is the high point of the route in every sense.\n\nWe run it as a homestay trek rather than a camping one, which keeps the money in the villages and the packs light.',
    coverImage: 'treknclimb/trips/markha-valley-trek',
    coverImageAlt: 'The Markha valley cutting through ochre rock below snow peaks',
    gallery: [
      {
        url: 'treknclimb/trips/markha-valley-trek-nimaling',
        alt: 'Tents and grazing horses on the Nimaling plain below Kang Yatse',
      },
      {
        url: 'treknclimb/trips/markha-valley-trek-homestay',
        alt: 'A Ladakhi homestay kitchen with copper pots on the shelves',
      },
    ],
    durationDays: 9,
    difficulty: 'Moderate',
    hasElevationProfile: true,
    tripGrade: 'Homestay trek, high altitude desert',
    maxAltitudeM: 5150,
    // Ladakh is a real region with no record and no route. See regionSlug above.
    regionSlug: null,
    minGroupSize: 2,
    maxGroupSize: 10,
    bestMonths: ['June', 'July', 'August', 'September'],
    startPoint: 'Leh',
    endPoint: 'Leh',
    accommodation: 'Village homestays, one night in tents at Nimaling',
    meals: 'Three meals a day while trekking',
    transportation: 'Road transfers Leh–Chilling and Shang Sumdo–Leh',
    price: 1050,
    priceLabel: 'From USD 1,050 per person',
    groupPricing: [
      { minPeople: 2, maxPeople: 4, pricePerPerson: 1290, label: 'One guide, horses for the group' },
      { minPeople: 5, maxPeople: 10, pricePerPerson: 1050, label: 'Second guide added' },
    ],
    highlights: [
      'Two acclimatisation days in Leh before the trek starts',
      'Village homestays rather than a camping crew',
      'The Nimaling plain under the Kang Yatse face',
      'Crossing the Kongmaru La at 5,150 m',
    ],
    itinerary: [
      day(1, 'Arrive Leh', 3500, 'Fly into Leh and do nothing at all. Altitude on arrival is 3,500 m and the first day is for resting.', { accommodation: 'Guesthouse', meals: 'D' }),
      day(2, 'Acclimatisation day in Leh', 3800, 'A short walk to Shanti Stupa and Leh Palace, plus permit paperwork.', { accommodation: 'Guesthouse', meals: 'B, L, D', durationHours: 3 }),
      day(3, 'Drive to Chilling, trek to Skiu', 3400, 'Along the Indus and Zanskar confluence, then into the Markha valley proper.', { accommodation: 'Homestay', meals: 'B, L, D', durationHours: 4 }),
      day(4, 'Skiu to Markha', 3800, 'A long, mostly level day up the valley with several river crossings.', { accommodation: 'Homestay', meals: 'B, L, D', durationHours: 7 }),
      day(5, 'Markha to Thachungtse', 4250, 'Past Techa monastery on its cliff, with Kang Yatse opening up ahead.', { accommodation: 'Homestay', meals: 'B, L, D', durationHours: 5.5 }),
      day(6, 'Thachungtse to Nimaling', 4720, 'Up onto the summer grazing plain below Kang Yatse. Cold at night.', { accommodation: 'Tented camp', meals: 'B, L, D', durationHours: 4 }),
      day(7, 'Kongmaru La to Shang Sumdo', 5150, 'The high point of the trek, then a long gorge descent to the road head.', { accommodation: 'Homestay', meals: 'B, L, D', durationHours: 8 }),
      day(8, 'Drive to Leh', 3500, 'Back to Leh by mid-morning, afternoon free in the bazaar.', { accommodation: 'Guesthouse', meals: 'B' }),
      day(9, 'Departure', 3500, 'Transfer to Leh airport.', { meals: 'B' }),
    ],
    includes: [
      'Two acclimatisation nights in Leh',
      'All homestay and camping accommodation on trek',
      'Three meals a day while trekking',
      'Licensed English-speaking guide',
      'Horses for baggage',
      'Hemis National Park fee and Inner Line Permit where required',
      'Road transfers to and from the trailheads',
    ],
    excludes: [
      'Flights to Leh',
      'Indian visa',
      'Travel and evacuation insurance',
      'Leh hotel meals outside the itinerary',
      'Drinks and personal expenses',
      'Tips for guide and horsemen',
    ],
    faqs: [
      {
        question: 'When is the Markha valley open?',
        answer:
          'June to September. It sits in the rain shadow of the main Himalaya, so it is walkable through the months when Nepal is under monsoon.',
      },
      {
        question: 'How high is Leh, and does that matter?',
        answer:
          'Leh is at 3,500 m, which is high enough that arriving by air needs respect. The itinerary builds in two nights there before the trek starts, and the first of those is deliberately a day of doing nothing.',
      },
    ],
    metaTitle: 'Markha Valley Trek, Ladakh — 9 Days with Village Homestays',
    metaDescription:
      'Guided 9-day Markha Valley trek in Ladakh crossing the Kongmaru La at 5,150 m, with village homestays, permits and acclimatisation days in Leh.',
    status: 'published',
    featured: true,
    displayOrder: 1,
  },

  /* ---------------------------------------------------------------- *
   * BHUTAN · no activity layer
   * ---------------------------------------------------------------- */
  {
    destinationSlug: 'bhutan',
    activitySlug: null,
    title: 'Druk Path Trek',
    slug: 'druk-path-trek',
    tripCode: 'TNC-DRK-07',
    summary:
      'The old trading route from Paro to Thimphu over high lakes, with the Tiger’s Nest at the start.',
    answerBlock:
      'The Druk Path trek costs from USD 1,890 per person and takes 7 days from Paro. It reaches 4,200 m at Phume La. It is graded moderate, with four days of trekking between 3,500 m and 4,200 m. The best months are March to May and September to November. The price includes Bhutan’s Sustainable Development Fee.',
    description:
      'The Druk Path is the short, high traverse between Paro and Thimphu, following an old trading route past a string of glacial lakes. It is only four days of actual trekking, which makes it the most accessible route in Bhutan without being a soft one — the camps sit between 3,500 m and 4,200 m.\n\nThe itinerary opens with the walk up to Taktsang, the Tiger’s Nest, which doubles as the acclimatisation day.',
    coverImage: 'treknclimb/trips/druk-path-trek',
    coverImageAlt: 'Taktsang monastery on the cliff face above the Paro valley',
    gallery: [
      {
        url: 'treknclimb/trips/druk-path-trek-jimilangtsho',
        alt: 'Camp beside Jimilangtsho lake under bare ridgelines',
      },
      {
        url: 'treknclimb/trips/druk-path-trek-dzong',
        alt: 'Paro Dzong above the river with its covered wooden bridge',
      },
    ],
    durationDays: 7,
    difficulty: 'Moderate',
    hasElevationProfile: true,
    tripGrade: 'Camping trek, moderate altitude',
    maxAltitudeM: 4200,
    // Paro/Thimphu, likewise.
    regionSlug: null,
    minGroupSize: 2,
    maxGroupSize: 10,
    bestMonths: ['March', 'April', 'May', 'September', 'October', 'November'],
    startPoint: 'Paro',
    endPoint: 'Thimphu',
    accommodation: 'Hotels in Paro and Thimphu, tented camps on trek',
    meals: 'All meals throughout',
    transportation: 'Private vehicle and all internal transfers',
    price: 1890,
    priceLabel: 'From USD 1,890 per person',
    groupPricing: [
      { minPeople: 2, maxPeople: 4, pricePerPerson: 2150, label: 'Guide, cook and pony crew' },
      { minPeople: 5, maxPeople: 10, pricePerPerson: 1890, label: 'Larger group, same crew ratio' },
    ],
    highlights: [
      'Taktsang, the Tiger’s Nest, on the acclimatisation day',
      'A string of glacial lakes — Jimilangtsho, Janetsho, Simkotra',
      'Only four days of trekking, but none of them low',
      'Bhutan’s Sustainable Development Fee included in the price we quote',
    ],
    itinerary: [
      day(1, 'Arrive Paro', 2250, 'Fly into Paro, transfer to the hotel, afternoon walk to Paro Dzong and the National Museum.', { accommodation: 'Hotel', meals: 'L, D', durationHours: 2 }),
      day(2, 'Taktsang — the Tiger’s Nest', 3140, 'The climb to the monastery on its cliff and back. This is the acclimatisation day as much as the sightseeing one.', { accommodation: 'Hotel', meals: 'B, L, D', durationHours: 5 }),
      day(3, 'Paro to Jele Dzong', 3480, 'A steep first afternoon out of the valley to camp below the old dzong.', { accommodation: 'Tented camp', meals: 'B, L, D', durationHours: 4 }),
      day(4, 'Jele Dzong to Jangchulakha', 3780, 'A ridge day through rhododendron and blue pine, with yak herder camps.', { accommodation: 'Tented camp', meals: 'B, L, D', durationHours: 5 }),
      day(5, 'Jangchulakha to Jimilangtsho', 3870, 'Along the ridge to camp beside the lake, known for its trout.', { accommodation: 'Tented camp', meals: 'B, L, D', durationHours: 4.5 }),
      day(6, 'Jimilangtsho to Phume La, descend to Thimphu', 4200, 'Past Janetsho and Simkotra lakes, over the pass at 4,200 m, then a long descent to the road.', { accommodation: 'Hotel', meals: 'B, L, D', durationHours: 7 }),
      day(7, 'Thimphu and departure', 2320, 'Morning in Thimphu, then the transfer back to Paro airport.', { meals: 'B' }),
    ],
    includes: [
      'Bhutan Sustainable Development Fee',
      'Bhutan visa processing',
      'All accommodation — hotels in Paro and Thimphu, tented camps on trek',
      'All meals throughout',
      'Licensed Bhutanese guide, cook and pony crew',
      'All internal transport and entry fees',
    ],
    excludes: [
      'International flights to Paro',
      'Travel and evacuation insurance',
      'Drinks and personal expenses',
      'Laundry and phone calls',
      'Tips for guide and crew',
    ],
    faqs: [
      {
        question: 'Is the Sustainable Development Fee included?',
        answer:
          'Yes. Bhutan charges a daily Sustainable Development Fee per visitor, and it is inside the price we quote rather than added later. We show you the breakdown on request.',
      },
      {
        question: 'How hard is the Druk Path?',
        answer:
          'Four trekking days, none longer than about seven hours, but the camps sit between 3,480 m and 3,870 m and the pass is 4,200 m. The Tiger’s Nest walk on day two is there to get you used to the altitude before the trek starts.',
      },
    ],
    metaTitle: 'Druk Path Trek, Bhutan — 7 Days Paro to Thimphu',
    metaDescription:
      'Guided 7-day Druk Path trek from Paro to Thimphu over high glacial lakes, with the Tiger’s Nest, all meals, permits and the Sustainable Development Fee included.',
    status: 'published',
    featured: true,
    displayOrder: 1,
  },
];

async function seedTrips() {
  const force = process.argv.includes('--force');

  await connectDB();

  const existing = await Trip.countDocuments();

  if (existing > 0 && !force) {
    console.log(
      `${existing} trips already exist. This script only creates placeholder development data, ` +
        'so it will not overwrite anything. Re-run with --force to replace them.'
    );
    await mongoose.disconnect();
    return;
  }

  if (force) {
    await Trip.deleteMany({});
    console.log('Cleared existing trips.');
  }

  // Resolve the slugs in the seed data to real ObjectIds.
  const [destinations, activities, regions] = await Promise.all([
    Destination.find().select('_id slug name hasActivities').lean(),
    Activity.find().select('_id slug').lean(),
    Region.find().select('_id slug').lean(),
  ]);

  const destinationBySlug = new Map(destinations.map((d) => [d.slug, d]));
  const activityBySlug = new Map(activities.map((a) => [a.slug, a]));
  const regionBySlug = new Map(regions.map((r) => [r.slug, r]));

  const documents = trips.map(
    ({ destinationSlug, activitySlug, regionSlug, ...trip }) => {
    const destination = destinationBySlug.get(destinationSlug);

    if (!destination) {
      throw new Error(
        `Destination "${destinationSlug}" not found — run scripts/seed.ts first.`
      );
    }

    const activity = activitySlug ? activityBySlug.get(activitySlug) : null;

    if (activitySlug && !activity) {
      throw new Error(`Activity "${activitySlug}" not found.`);
    }

    const region = regionSlug ? regionBySlug.get(regionSlug) : null;

    /*
     * A named region that does not exist is a typo, not an empty field — fail
     * rather than silently storing null and leaving a trip off its own region
     * page with nothing to explain why.
     */
    if (regionSlug && !region) {
      throw new Error(
        `Region "${regionSlug}" not found — run scripts/seed-regions.ts first.`
      );
    }

    return {
      ...trip,
      destination: destination._id,
      activity: activity ? activity._id : null,
      region: region ? region._id : null,
    };
  });

  /*
   * insertMany fires pre('validate') on every document, so Trip's asymmetry
   * hook runs here — each of these does a Destination lookup to check that the
   * activity pairing is legal. That is exactly what we want: if a Nepal trip
   * were missing its activity, or a Bhutan trip had one, this would fail loudly
   * rather than writing a broken document.
   */
  const inserted = await Trip.insertMany(documents);

  console.log(`Inserted ${inserted.length} placeholder trips:`);
  for (const destination of destinations) {
    const count = documents.filter((d) =>
      d.destination.equals(destination._id)
    ).length;
    if (count > 0) console.log(`  ${destination.name}: ${count}`);
  }

  await mongoose.disconnect();
  console.log('Done. This is placeholder content — replace it before launch.');
}

seedTrips().catch(async (error) => {
  console.error('Trip seed failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});

/*
 * ============================================================================
 * CLOUDINARY PUBLIC IDs USED
 * ============================================================================
 *
 * Cover images (needed now — the cards and destination hero render these):
 *   treknclimb/trips/everest-base-camp-trek
 *   treknclimb/trips/annapurna-base-camp-trek
 *   treknclimb/trips/island-peak-climbing
 *   treknclimb/trips/poon-hill-trek
 *   treknclimb/trips/markha-valley-trek
 *   treknclimb/trips/druk-path-trek
 *
 * Gallery images (not rendered by any page yet — upload when the trip detail
 * page is built):
 *   treknclimb/trips/everest-base-camp-trek-namche
 *   treknclimb/trips/everest-base-camp-trek-kala-patthar
 *   treknclimb/trips/annapurna-base-camp-trek-ghandruk
 *   treknclimb/trips/annapurna-base-camp-trek-machhapuchhre
 *   treknclimb/trips/island-peak-climbing-basecamp
 *   treknclimb/trips/island-peak-climbing-summit-ridge
 *   treknclimb/trips/poon-hill-trek-rhododendron
 *   treknclimb/trips/poon-hill-trek-ulleri
 *   treknclimb/trips/markha-valley-trek-nimaling
 *   treknclimb/trips/markha-valley-trek-homestay
 *   treknclimb/trips/druk-path-trek-jimilangtsho
 *   treknclimb/trips/druk-path-trek-dzong
 *
 * Note the existing destination covers were uploaded to the Cloudinary root
 * (`nepal`, `india`, `tibet`, `bhutan`) while activities use the
 * `treknclimb/activities/` prefix. These follow the prefixed convention.
 * ============================================================================
 */
