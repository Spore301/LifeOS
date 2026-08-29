import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { computeDueReminders } from '@/lib/reminders';
import { deliverReminder } from '@/lib/notifications';

/**
 * POST /api/reminders/send
 * Cron/worker calls this periodically to actually deliver due reminders.
 * Delivery targets the user's most recently active online chat session when possible;
 * in local POC it returns the reminders for the frontend to render.
 */
export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const due = computeDueReminders(userId);
  const delivered = await deliverReminder(userId, due);

  return NextResponse.json({ userId, delivered, count: delivered.length });
}
