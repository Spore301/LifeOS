import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { getAccessToken } from '@/lib/google-auth';
import { fetchGoogleCalendarEvents } from '@/lib/calendar';

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accessToken = await getAccessToken(userId);

    const today = new Date();
    const timeMin = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const timeMax = new Date(today.setHours(23, 59, 59, 999)).toISOString();

    const events = await fetchGoogleCalendarEvents(accessToken, timeMin, timeMax);
    return NextResponse.json({ events });
  } catch (error: any) {
    console.error('Calendar today route error:', error);
    return NextResponse.json({ error: 'Failed to fetch calendar events' }, { status: 500 });
  }
}
