import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { endAllUserChats } from '@/lib/opencode/sessionManager';

/**
 * POST /api/user/offline  -- call when the user goes offline/logs out.
 * Gracefully ends all of the user's sessions.
 */
export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await endAllUserChats(userId);
  return NextResponse.json({ success: true });
}
