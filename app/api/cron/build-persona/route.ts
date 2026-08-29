import { NextRequest, NextResponse } from 'next/server';
import { buildPersona } from '@/lib/opencode/personaBuilder';
import { resolveUserId } from '@/lib/auth-user';

/**
 * POST /api/cron/build-persona
 * Nightly persona builder. Admin-gated by the LifeOS cron secret header.
 * If no web session, requires a valid cron secret.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.LIFEOS_CRON_SECRET;
  const header = req.headers.get('x-lifeos-cron');
  if (cronSecret && header !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Resolve target user: a specific user from query, else a session user.
  const userId = req.nextUrl.searchParams.get('userId') || (await resolveUserId(req));
  if (!userId) return NextResponse.json({ error: 'No user specified' }, { status: 400 });

  const day = req.nextUrl.searchParams.get('day') || new Date().toISOString().slice(0, 10);
  const result = await buildPersona({ userId, day });
  return NextResponse.json(result);
}
