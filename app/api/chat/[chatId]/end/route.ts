import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { endChat } from '@/lib/opencode/sessionManager';

export async function POST(req: NextRequest, ctx: any) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chatId = ctx.params?.chatId as string;
  await endChat(userId, chatId);
  return NextResponse.json({ success: true, chatId, online: false });
}
