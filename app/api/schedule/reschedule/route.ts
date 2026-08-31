import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { getTimeZone, zonedDayBounds } from '@/lib/timezone';
import { getAccessToken } from '@/lib/google-auth';
import { fetchGoogleFreeBusy } from '@/lib/calendar';
import { calculateProposedSchedule } from '@/lib/scheduler';
import { Task } from '@/lib/types';

export async function PATCH(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accessToken = await getAccessToken(userId);

    const body = await req.json();
    const { activeTasks, blockerUpdate }: { activeTasks: Task[]; blockerUpdate?: { taskId: string; isBlocked: boolean; reason?: string } } = body;

    let updatedTasks = [...(activeTasks || [])];

    if (blockerUpdate) {
      updatedTasks = updatedTasks.map(t => {
        if (t.id === blockerUpdate.taskId) {
          return { ...t, isBlocked: blockerUpdate.isBlocked, blockerReason: blockerUpdate.reason };
        }
        return t;
      });
    }

    // The day window is the USER's calendar day. setHours() here is server-local
    // (UTC in the container), which asked Google for 05:30 IST -> 05:29 next day.
    const bounds = zonedDayBounds(new Date(), getTimeZone());
    const timeMin = bounds.start.toISOString();
    const timeMax = bounds.end.toISOString();

    const busySlots = await fetchGoogleFreeBusy(accessToken, timeMin, timeMax);
    const rescheduledPlan = calculateProposedSchedule(updatedTasks, busySlots);

    return NextResponse.json({
      rescheduledPlan,
      updatedTasks,
      message: blockerUpdate ? 'Cascaded reschedule plan calculated after blocker update.' : 'Rescheduled plan calculated.',
    });
  } catch (error: any) {
    console.error('Reschedule route error:', error);
    return NextResponse.json({ error: 'Failed to re-calculate schedule' }, { status: 500 });
  }
}
