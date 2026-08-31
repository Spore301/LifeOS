import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { transcribeAudioWithWhisper } from '@/lib/whisper';

export async function POST(req: NextRequest) {
  // This route spends credit on a third-party API, so it must never run for an
  // unauthenticated caller - it was previously an open proxy onto the billing key.
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as Blob | null;

    if (!file) {
      return NextResponse.json({ error: 'Audio file missing from request' }, { status: 400 });
    }

    const result = await transcribeAudioWithWhisper(file);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Transcribe route error:', error);
    return NextResponse.json({ error: 'Failed to transcribe audio' }, { status: 500 });
  }
}

