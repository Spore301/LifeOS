import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { computeDueReminders } from '@/lib/reminders';
import { deliverReminder } from '@/lib/notifications';

/**
 * POST /api/cron/reminders
 * Periodic reminder worker (JITAI pipeline). Admin-gated by cron secret.
 * Runs the due-reminder computation and delivers notifications.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.LIFEOS_CRON_SECRET;
  const header = req.headers.get('x-lifeos-cron');
  if (cronSecret && header !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = req.nextUrl.searchParams.get('userId') || (await resolveUserId(req));
  if (!userId) return NextResponse.json({ error: 'No user specified' }, { status: 400 });

  const due = computeDueReminders(userId);
  const delivered = await deliverReminder(userId, due);

  return NextResponse.json({ userId, dueCount: due.length, delivered });
}
