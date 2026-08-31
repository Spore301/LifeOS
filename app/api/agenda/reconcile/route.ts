import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { reconcileToday } from '@/lib/agenda';

/**
 * GET /api/agenda/reconcile
 *   Compares today's Google Calendar against the task ledger and reports blocks
 *   that should not be there: duplicates, and events whose task was deleted,
 *   deferred or blocked.
 *
 *   Planning only ever reads the ledger, so a calendar event whose task is gone
 *   is invisible to it and lingers as a phantom duplicate. This is how the agent
 *   can find one without the user having to spot it themselves.
 */
export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await reconcileToday(userId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Agenda reconcile error:', err);
    return NextResponse.json(
      { error: 'Failed to reconcile calendar', detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}
