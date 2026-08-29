import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { confirmWrite } from '@/lib/agenda';

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const scheduledTasks = body.scheduledTasks;
  if (!Array.isArray(scheduledTasks)) {
    return NextResponse.json({ error: 'scheduledTasks array is required' }, { status: 400 });
  }

  try {
    const result = await confirmWrite(userId, scheduledTasks as any);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Agenda confirm error:', err);
    return NextResponse.json({ error: 'Failed to write schedule to Google Calendar' }, { status: 500 });
  }
}
