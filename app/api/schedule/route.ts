import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { getTimeZone, zonedDayBounds } from '@/lib/timezone';
import { getAccessToken } from '@/lib/google-auth';
import { fetchGoogleFreeBusy } from '@/lib/calendar';
import { calculateProposedSchedule } from '@/lib/scheduler';
import { getTasks } from '@/lib/store/tasks';
import { Task } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accessToken = await getAccessToken(userId);

    let tasks: Task[] = [];
    try {
      const body = await req.json();
      if (Array.isArray(body?.tasks)) {
        tasks = body.tasks;
      }
    } catch {
      // Body optional
    }

    if (tasks.length === 0) {
      const storedTasks = getTasks(userId);
      tasks = storedTasks
        .filter((t) => t.state !== 'done' && t.state !== 'deferred')
        .map((t) => ({
          id: t.id,
          title: t.title,
          durationMinutes: t.durationMinutes || 30,
          deadline: t.deadline,
          priority: t.priority,
          isBlocked: t.isBlocked || t.state === 'blocked',
          blockerReason: t.blockerReason,
          category: t.project,
          recurrence: t.recurrence,
        })) as any[];
    }

    // Determine today's timeMin and timeMax
    // The day window is the USER's calendar day. setHours() here is server-local
    // (UTC in the container), which asked Google for 05:30 IST -> 05:29 next day.
    const bounds = zonedDayBounds(new Date(), getTimeZone());
    const timeMin = bounds.start.toISOString();
    const timeMax = bounds.end.toISOString();

    // Query Google Calendar FreeBusy
    const busySlots = await fetchGoogleFreeBusy(accessToken, timeMin, timeMax);

    // Calculate proposed schedule
    const proposedSchedule = calculateProposedSchedule(tasks, busySlots);

    return NextResponse.json({
      ...proposedSchedule,
      needsCalendarAuth: !accessToken,
    });
  } catch (error: any) {
    console.error('Schedule calculation route error:', error);
    return NextResponse.json({ error: 'Failed to calculate schedule' }, { status: 500 });
  }
}
