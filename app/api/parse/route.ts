import { NextRequest, NextResponse } from 'next/server';
import { parseTranscriptWithDeepSeek } from '@/lib/deepseek';

export async function POST(req: NextRequest) {
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
