import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { getTasks, createTask } from '@/lib/store/tasks';
import { sanitizePriority } from '@/lib/store/tasks';

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const state = searchParams.get('state');
  const project = searchParams.get('project');

  let tasks = getTasks(userId);
  if (state) tasks = tasks.filter((t) => t.state === state);
  if (project) tasks = tasks.filter((t) => t.project === project);
  tasks.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return NextResponse.json({ userId, tasks });
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'title (string) is required' }, { status: 400 });
  }

  const task = createTask(userId, {
    title: body.title,
    project: body.project,
    description: body.description,
    durationMinutes:
      typeof body.durationMinutes === 'number' ? body.durationMinutes : undefined,
    estimatedMinutes:
      typeof body.estimatedMinutes === 'number' ? body.estimatedMinutes : undefined,
    deadline: body.deadline,
    priority: sanitizePriority(body.priority),
    dependsOn: body.dependsOn,
    subtasks: body.subtasks,
    nextAction: body.nextAction,
    completionCriterion: body.completionCriterion,
    recurrence: body.recurrence,
    // An immovable meeting time, if this is a commitment rather than work.
    fixedStart: typeof body.fixedStart === 'string' ? body.fixedStart : undefined,
    fixedEnd: typeof body.fixedEnd === 'string' ? body.fixedEnd : undefined,
  });

  return NextResponse.json({ task }, { status: 201 });
}
