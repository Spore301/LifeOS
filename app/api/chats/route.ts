import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { listChatRecords, getChatRecord } from '@/lib/store/chats';
import { openChat } from '@/lib/opencode/sessionManager';

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chats = listChatRecords(userId).map((c) => ({
    chatId: c.chatId,
    title: c.title,
    sessionId: c.sessionId,
    online: c.online,
    updatedAt: c.updatedAt,
  }));

  return NextResponse.json({ userId, chats });
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const { chatId } = openChat(userId, body.chatId, body.title);
  const record = getChatRecord(userId, chatId);
  return NextResponse.json({ chatId, sessionId: record?.sessionId }, { status: 201 });
}
