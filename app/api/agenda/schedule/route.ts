import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { proposeToday } from '@/lib/agenda';

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const proposal = await proposeToday(userId);
    return NextResponse.json(proposal);
  } catch (err: any) {
    console.error('Agenda schedule error:', err);
    return NextResponse.json({ error: 'Failed to compute schedule' }, { status: 500 });
  }
}
