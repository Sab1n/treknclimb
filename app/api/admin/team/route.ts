import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../lib/db';
import { requireAdmin } from '../../../../lib/adminAuth';
import TeamMember from '../../../../models/TeamMember';
import { adminTeamMemberSchema } from '../../../../lib/validators/adminContent';
import { revalidateAll } from '../../../../lib/revalidation';
import { isOwnPublicId } from '../../../../lib/cloudinary';
import type { PublishStatus } from '../../../../models/shared/status';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/team — create a team member.
 *
 * One form for create and edit, like activities and unlike trips: nothing here
 * has to exist before the record does. The photo is optional, so there is no
 * `coverImage` deadlock to work around.
 *
 * Every published member renders on `/about` and nowhere else, which makes the
 * purge list a constant rather than something to derive.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    // 404, not 403 — an auth challenge confirms the endpoint exists.
    return new NextResponse(null, { status: 404 });
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (origin && new URL(origin).host !== host) {
    return new NextResponse(null, { status: 403 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  const parsed = adminTeamMemberSchema.safeParse(body);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};

    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }

    return NextResponse.json(
      { error: 'Some fields need checking.', fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;

  /*
   * The stored reference is interpolated into a Cloudinary URL on a public
   * page, so it is checked to be one of ours rather than trusted because it
   * arrived from an admin session. An absolute URL is the shape an injected
   * value would take, and this rejects it.
   */
  if (data.photo && !isOwnPublicId(data.photo)) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: {
          photo:
            'That is not a Cloudinary reference this site issued. Upload the photo rather than pasting a URL.',
        },
      },
      { status: 400 }
    );
  }

  await connectDB();

  const member = new TeamMember({
    name: data.name,
    role: data.role,
    photo: data.photo,
    photoAlt: data.photoAlt,
    bio: data.bio,
    credentials: data.credentials,
    languages: data.languages,
    yearsExperience: data.yearsExperience,
    displayOrder: data.displayOrder,
    status: data.status as PublishStatus,
  });

  try {
    await member.save();
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      const fieldErrors: Record<string, string> = {};

      for (const [path, detail] of Object.entries(error.errors)) {
        fieldErrors[path] = detail.message;
      }

      return NextResponse.json(
        { error: 'Some fields need checking.', fieldErrors },
        { status: 400 }
      );
    }

    console.error('[admin/team] Create failed:', error);

    return NextResponse.json(
      { error: 'Could not create the team member. Nothing was saved.' },
      { status: 500 }
    );
  }

  // A draft appears nowhere public, so there is no cached page to purge.
  const revalidated =
    member.status === 'published' ? revalidateAll(['/about']) : [];

  return NextResponse.json(
    { ok: true, id: String(member._id), revalidated },
    { status: 201 }
  );
}
