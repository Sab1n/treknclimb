import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../../lib/db';
import { requireAdmin } from '../../../../../lib/adminAuth';
import TeamMember from '../../../../../models/TeamMember';
import { adminTeamMemberSchema } from '../../../../../lib/validators/adminContent';
import { revalidateAll } from '../../../../../lib/revalidation';
import { isOwnPublicId } from '../../../../../lib/cloudinary';
import type { PublishStatus } from '../../../../../models/shared/status';

export const dynamic = 'force-dynamic';

/**
 * PATCH and DELETE for one team member.
 *
 * Both address a single record, which in Express would be
 * `router.route('/:id')`. Here the folder is the path and the exported function
 * name is the method, so there is no router to register and no ordering to get
 * wrong.
 *
 * ## The purge is decided by the old status as well as the new one
 *
 * `/about` is the only page involved, but *whether* to purge it depends on both
 * states. A member going from published to draft has nothing to add to the page
 * and everything to remove from it — skipping the purge because the new status
 * is not `published` would leave them on the trust page after they left the
 * company, which is the worst version of this bug.
 */
async function guard(request: Request): Promise<NextResponse | null> {
  try {
    await requireAdmin();
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  // SameSite=Lax already blocks a cross-site form post; this covers what it
  // does not, since Lax is a same-*site* rather than same-origin policy.
  if (origin && new URL(origin).host !== host) {
    return new NextResponse(null, { status: 403 });
  }

  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const { id } = await params;

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

  /*
   * `findById` → assign → `save()`, per CLAUDE.md. Here it is load-bearing:
   * `photoAlt`'s requirement is a conditional function, which query middleware
   * skips silently — the trap the `pre('findOneAndUpdate')` on the model exists
   * to close, and which this path avoids entirely.
   */
  let member;

  try {
    member = await TeamMember.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!member) return new NextResponse(null, { status: 404 });

  const wasPublished = member.status === 'published';

  member.name = data.name;
  member.role = data.role;
  member.photo = data.photo;
  member.photoAlt = data.photoAlt;
  member.bio = data.bio;
  member.credentials = data.credentials;
  member.languages = data.languages;
  member.yearsExperience = data.yearsExperience;
  member.displayOrder = data.displayOrder;
  member.status = data.status as PublishStatus;

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

    console.error('[admin/team] Save failed:', error);

    return NextResponse.json(
      { error: 'Could not save. Nothing was changed.' },
      { status: 500 }
    );
  }

  // Either state being `published` means /about is now wrong — see the note.
  const revalidated =
    wasPublished || member.status === 'published' ? revalidateAll(['/about']) : [];

  return NextResponse.json({
    ok: true,
    updatedAt: member.updatedAt,
    revalidated,
  });
}

/**
 * DELETE /api/admin/team/[id]
 *
 * No dependant guard, unlike an activity: nothing references a team member, so
 * deleting one strands nothing. `archived` exists for someone who has left but
 * whose record should survive; delete is for a duplicate or a mistake.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const { id } = await params;

  await connectDB();

  let member;

  try {
    member = await TeamMember.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!member) return new NextResponse(null, { status: 404 });

  const wasPublished = member.status === 'published';

  await member.deleteOne();

  return NextResponse.json({
    ok: true,
    revalidated: wasPublished ? revalidateAll(['/about']) : [],
  });
}
