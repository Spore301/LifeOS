import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { applyReminderAction } from '@/lib/reminderActions';
import { getPreferences } from '@/lib/store/preferences';
import { ReminderIntent, RescheduleMode } from '@/lib/task-types';

const INTENTS: ReminderIntent[] = ['DONE', 'RESCHEDULE', 'CANCEL', 'ACK'];
const MODES: RescheduleMode[] = ['30m', '1h', 'agent'];

/**
 * POST /api/tasks/{id}/reminder-response
 *   { intent, mode?, reason?, confirmed?, actualDurationMinutes? }
 *
 * Applies what the user pressed on a reminder, writing the task AND its Google
 * Calendar block together. DONE retitles the block, RESCHEDULE moves it, CANCEL
 * removes it — but only once `confirmed` is set, since it deletes the task.
 */
export async function POST(req: NextRequest, ctx: any) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const taskId = ctx.params?.id as string;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const intent = body.intent as ReminderIntent;
  if (!INTENTS.includes(intent)) {
    return NextResponse.json(
      { error: `intent must be one of ${INTENTS.join(', ')}` },
      { status: 400 }
    );
  }

  // No explicit mode on a reschedule falls back to the user's saved preference,
  // which is what "always let the agent decide" means in practice.
  let mode: RescheduleMode | undefined = MODES.includes(body.mode) ? body.mode : undefined;
  if (intent === 'RESCHEDULE' && !mode) {
    mode = getPreferences(userId).alwaysLetAgentDecide ? 'agent' : undefined;
  }

  try {
    const result = await applyReminderAction(userId, {
      taskId,
      intent,
      mode,
      reason: typeof body.reason === 'string' ? body.reason : undefined,
      actualDurationMinutes:
        typeof body.actualDurationMinutes === 'number' ? body.actualDurationMinutes : undefined,
      confirmed: body.confirmed === true,
    });

    return NextResponse.json({ taskId, intent, ...result });
  } catch (err: any) {
    console.error('Reminder response error:', err);
    return NextResponse.json(
      { error: 'Failed to apply reminder response', detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}
