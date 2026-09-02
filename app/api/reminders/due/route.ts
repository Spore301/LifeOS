import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { computeDueReminders } from '@/lib/reminders';
import { deliverOverdue } from '@/lib/notifications';
import { overdueTasks } from '@/lib/reminderActions';
import { getTasks } from '@/lib/store/tasks';

/**
 * GET /api/reminders/due
 *
 * Returns two distinct things:
 *  - `due`      tasks approaching their deadline (the lead-time nudge)
 *  - `overdue`  tasks whose booked window closed while still open. These need a
 *               decision from the user, not a nudge, and are batched into a
 *               single prompt so a busy day is one interruption, not six.
 */
export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tasks = getTasks(userId);
  const overdue = overdueTasks(userId, tasks);

  return NextResponse.json({
    userId,
    due: computeDueReminders(userId),
    overdue: overdue.map((t) => ({
      taskId: t.id,
      title: t.title,
      project: t.project,
      durationMinutes: t.durationMinutes,
      priority: t.priority,
      scheduledStart: t.scheduledStart,
      scheduledEnd: t.scheduledEnd,
      rescheduleCount: t.rescheduleCount ?? 0,
    })),
    prompts: deliverOverdue(userId, overdue),
  });
}
