import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { updateTask, deleteTask, getTask, sanitizeState } from '@/lib/store/tasks';

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

  const patch: any = {};
  if (typeof body.title === 'string') patch.title = body.title;
  if (typeof body.project === 'string') patch.project = body.project;
  if (typeof body.description === 'string') patch.description = body.description;
  if (typeof body.durationMinutes === 'number') patch.durationMinutes = body.durationMinutes;
  if (typeof body.estimatedMinutes === 'number') patch.estimatedMinutes = body.estimatedMinutes;
  if (typeof body.actualMinutes === 'number') patch.actualMinutes = body.actualMinutes;
  if (typeof body.deadline === 'string') patch.deadline = body.deadline;
  if (typeof body.dueAdjust !== 'undefined') patch.deadline = body.dueAdjust;
  patch.priority = body.priority !== undefined ? (body.priority as any) : existing.priority;
  patch.state = body.state !== undefined ? sanitizeState(body.state) : existing.state;
  if (typeof body.nextAction === 'string') patch.nextAction = body.nextAction;
  if (typeof body.completionCriterion === 'string') patch.completionCriterion = body.completionCriterion;
  if (typeof body.recurrence === 'string') patch.recurrence = body.recurrence;
  // The booked window. Kept in step with the calendar block by whatever moves it
  // (a reminder action, or a confirmed schedule), never edited on its own.
  if (typeof body.fixedStart === 'string') patch.fixedStart = body.fixedStart;
  if (typeof body.fixedEnd === 'string') patch.fixedEnd = body.fixedEnd;
  if (typeof body.scheduledStart === 'string') patch.scheduledStart = body.scheduledStart;
  if (typeof body.scheduledEnd === 'string') patch.scheduledEnd = body.scheduledEnd;
  if (typeof body.slipReason === 'string') patch.slipReason = body.slipReason;
  if (Array.isArray(body.dependsOn)) patch.dependsOn = body.dependsOn;
  if (Array.isArray(body.subtasks)) patch.subtasks = body.subtasks;

  const updated = updateTask(userId, taskId, patch);
  return NextResponse.json({ task: updated });
}

export async function DELETE(req: NextRequest, ctx: any) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const taskId = ctx.params?.id as string;
  const deleted = deleteTask(userId, taskId);
  if (!deleted) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
