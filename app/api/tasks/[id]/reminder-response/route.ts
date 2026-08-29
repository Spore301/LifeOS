import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { applyReminderResponse, getTask } from '@/lib/store/tasks';
import { ReminderResponseInput } from '@/lib/task-types';

const VALID_INTENTS = ['ACCEPT', 'DONE', 'DELAYED', 'SNOOZE', 'DROP'];

/**
 * Endpoint for the reminder intent loop (see docs/04).
 * body: { intent, reason?, snoozeUntil?, actualDurationMinutes? }
 */
export async function POST(req: NextRequest, ctx: any) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const taskId = ctx.params?.id as string;
  const existing = getTask(userId, taskId);
  if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const intent = (body.intent || '').toUpperCase();
  if (!VALID_INTENTS.includes(intent)) {
    return NextResponse.json(
      { error: `intent must be one of ${VALID_INTENTS.join(', ')}` },
      { status: 400 }
    );
  }

  const input: ReminderResponseInput = {
    taskId,
    intent: intent as ReminderResponseInput['intent'],
    reason: body.reason,
    snoozeUntil: body.snoozeUntil,
    actualDurationMinutes:
      typeof body.actualDurationMinutes === 'number' ? body.actualDurationMinutes : undefined,
  };

  const updated = applyReminderResponse(userId, input);

  // Cascade-aware message for the agent (postpone dependents is handled by the agent, the
  // store marks the task blocked/deferred here).
  return NextResponse.json({
    task: updated,
    acknowledged: true,
    note:
      intent === 'DELAYED'
        ? 'Task marked blocked. The agent should cascade downstream dependents to new slots.'
        : `Reminder response '${intent}' applied.`,
  });
}
