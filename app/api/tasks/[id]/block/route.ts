import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { getTask, setBlocked } from '@/lib/store/tasks';

export async function PATCH(req: NextRequest, ctx: any) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const taskId = ctx.params?.id as string;
  const existing = getTask(userId, taskId);
  if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const isBlocked = body.isBlocked !== undefined ? Boolean(body.isBlocked) : !existing.isBlocked;
  const updated = setBlocked(userId, taskId, isBlocked, body.reason || undefined);

  return NextResponse.json({ task: updated, blocked: isBlocked });
}
