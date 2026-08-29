import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { computeDueReminders } from '@/lib/reminders';

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const due = computeDueReminders(userId);
  return NextResponse.json({ userId, due, count: due.length });
}
