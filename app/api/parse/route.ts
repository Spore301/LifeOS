import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { parseTranscriptWithDeepSeek } from '@/lib/deepseek';

export async function POST(req: NextRequest) {
  // This route spends credit on a third-party API, so it must never run for an
  // unauthenticated caller - it was previously an open proxy onto the billing key.
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { transcript, historySummary } = body;

    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json({ error: 'Transcript string is required' }, { status: 400 });
    }

    const parseResult = await parseTranscriptWithDeepSeek(transcript, historySummary || '');
    return NextResponse.json(parseResult);
  } catch (error: any) {
    console.error('Parse route error:', error);
    return NextResponse.json({ error: 'Failed to parse transcript' }, { status: 500 });
  }
}
