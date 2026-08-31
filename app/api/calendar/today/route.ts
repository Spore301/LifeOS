import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { getTimeZone, zonedDayBounds } from '@/lib/timezone';
import { getAccessToken } from '@/lib/google-auth';
import { fetchGoogleCalendarEvents } from '@/lib/calendar';

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accessToken = await getAccessToken(userId);

    // The day window is the USER's calendar day. setHours() here is server-local
    // (UTC in the container), which asked Google for 05:30 IST -> 05:29 next day.
    const bounds = zonedDayBounds(new Date(), getTimeZone());
    const timeMin = bounds.start.toISOString();
    const timeMax = bounds.end.toISOString();

    const events = await fetchGoogleCalendarEvents(accessToken, timeMin, timeMax);
    // `mocked` matters: without a token these are placeholders, and the agent must
    // not describe them as the user's calendar.
    return NextResponse.json({ events, mocked: !accessToken, timeMin, timeMax });
  } catch (error: any) {
    console.error('Calendar today route error:', error);
    return NextResponse.json({ error: 'Failed to fetch calendar events' }, { status: 500 });
  }
}
