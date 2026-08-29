import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudioWithWhisper } from '@/lib/whisper';

export async function POST(req: NextRequest) {
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

