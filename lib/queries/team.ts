import { cache } from 'react';

import { connectDB } from '../db';
import TeamMember, { ITeamMember } from '../../models/TeamMember';

/**
 * Published team members, in display order.
 *
 * `cache()` because the About page reads them twice — once to render the
 * section and once to decide whether to emit the section at all. Next
 * deduplicates `fetch()` on its own and does nothing for Mongoose.
 *
 * Published only. A draft member is one the client is part-way through adding,
 * and a half-filled person on the trust page is worse than one fewer.
 */
export const getPublishedTeam = cache(async (): Promise<ITeamMember[]> => {
  await connectDB();

  return TeamMember.find({ status: 'published' })
    .sort({ displayOrder: 1, name: 1 })
    .lean<ITeamMember[]>()
    .exec();
});
