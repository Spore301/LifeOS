import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { sendToChat, getChatHistory } from '@/lib/opencode/sessionManager';
import { getChatRecord } from '@/lib/store/chats';

/**
 * POST /api/chat/{chatId}/message   { text }
 *   Drives the user's OpenCode session for this chat. Creates it if needed.
 * GET  /api/chat/{chatId}/message
 *   Returns the local transcript (history) for the chat.
 */
export async function POST(req: NextRequest, ctx: any) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chatId = ctx.params?.chatId as string;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });

  // Optional: allow a caller to provide an explicit system/model override for testing.
  try {
    const result = await sendToChat(userId, chatId, text, { createIfMissing: true });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Chat message error:', err);
    return NextResponse.json(
      { error: 'Failed to process chat message', detail: err?.message || String(err) },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, ctx: any) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chatId = ctx.params?.chatId as string;
  const record = getChatRecord(userId, chatId);
  if (!record) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });

  return NextResponse.json({
    chatId,
    sessionId: record.sessionId,
    transcript: getChatHistory(userId, chatId),
  });
}
