import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { getPreferences, setPreferences } from '@/lib/store/preferences';

/**
 * GET  /api/preferences   read the user's explicit settings
 * POST /api/preferences   { alwaysLetAgentDecide?: boolean }
 *
 * Separate from the persona on purpose: the nightly persona build rewrites that
 * file wholesale, so a setting stored there would silently vanish overnight.
 */
export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ userId, preferences: getPreferences(userId) });
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.alwaysLetAgentDecide === 'boolean') {
    patch.alwaysLetAgentDecide = body.alwaysLetAgentDecide;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no recognised preference in body' }, { status: 400 });
  }

  return NextResponse.json({ userId, preferences: setPreferences(userId, patch) });
}
