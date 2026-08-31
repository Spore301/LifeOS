import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { getPersona, setPersona, appendPersona } from '@/lib/store/persona';

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ userId, persona: getPersona(userId) });
}


/**
 * POST /api/persona
 *   { append: 'always schedules in IST' }  -> add one durable fact
 *   { persona: <full markdown> }           -> replace the whole persona
 *
 * The agent needs a real write path here: without it, telling the user
 * "saved to memory" was false and the preference was lost next session.
 */
export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const append = typeof body.append === 'string' ? body.append.trim() : '';
  const full = typeof body.persona === 'string' ? body.persona : null;

  if (!append && full === null) {
    return NextResponse.json({ error: 'append or persona is required' }, { status: 400 });
  }

  if (full !== null) {
    setPersona(userId, full);
    return NextResponse.json({ userId, saved: true, persona: getPersona(userId) });
  }

  const persona = appendPersona(userId, append);
  return NextResponse.json({ userId, saved: true, persona });
}