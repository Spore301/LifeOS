import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { getAccessToken } from '@/lib/google-auth';
import { writeTaskToGoogleCalendar } from '@/lib/calendar';
import { ScheduledTask } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accessToken = await getAccessToken(userId);

    const body = await req.json();
    const { scheduledTasks }: { scheduledTasks: ScheduledTask[] } = body;

    if (!scheduledTasks || !Array.isArray(scheduledTasks)) {
      return NextResponse.json({ error: 'scheduledTasks array is required' }, { status: 400 });
    }

    const writtenEvents = [];
    for (const st of scheduledTasks) {
      const evt = await writeTaskToGoogleCalendar(accessToken, st);
      writtenEvents.push(evt);
    }

    return NextResponse.json({
      success: true,
      writtenCount: writtenEvents.length,
      written: writtenEvents,
      events: writtenEvents,
      mocked: !accessToken,
      message: `Successfully confirmed and written ${writtenEvents.length} events to Google Calendar!`,
    });
  } catch (error: any) {
    console.error('Schedule confirm route error:', error);
    return NextResponse.json({ error: 'Failed to write schedule to Google Calendar' }, { status: 500 });
  }
}
