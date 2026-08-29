import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { destroyChat } from '@/lib/opencode/sessionManager';
import { removeChat } from '@/lib/store/chats';

export async function POST(req: NextRequest, ctx: any) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chatId = ctx.params?.chatId as string;
  await destroyChat(userId, chatId);
  removeChat(userId, chatId);
  return NextResponse.json({ success: true, chatId, removed: true });
}
