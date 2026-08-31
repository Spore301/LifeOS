import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { removeFromCalendar } from '@/lib/agenda';

/**
 * DELETE /api/agenda/event   { taskId }
 *   Removes the LifeOS-created calendar block for a task (dropped or moved away).
 *   Without this the agent could only ever create events, so a rescheduled task
 *   left a stale block behind for the user to delete by hand.
 */
export async function DELETE(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
  if (!taskId) return NextResponse.json({ error: 'taskId is required' }, { status: 400 });

  try {
    const result = await removeFromCalendar(userId, taskId);
    return NextResponse.json({ taskId, ...result });
  } catch (err: any) {
    console.error('Agenda event delete error:', err);
    return NextResponse.json(
      { error: 'Failed to remove calendar event', detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}
