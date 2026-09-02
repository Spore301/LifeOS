import { Task, Priority } from '../task-types';
import { ensureDir, userDir, tasksFile, readJson, writeJson, nowIso } from './paths';

interface TaskLedger {
  tasks: Task[];
}

export function getTasks(userId: string): Task[] {
  return readJson<TaskLedger>(tasksFile(userId), { tasks: [] }).tasks;
}

export function getTask(userId: string, taskId: string): Task | null {
  return getTasks(userId).find((t) => t.id === taskId) || null;
}

function save(userId: string, tasks: Task[]): void {
  writeJson<TaskLedger>(tasksFile(userId), { tasks });
}

export function createTask(userId: string, input: Partial<Task>): Task {
  const now = nowIso();
  const task: Task = {
    id: input.id || `task-${Date.now()}`,
    title: input.title || 'Untitled task',
    project: input.project,
    description: input.description,
    durationMinutes: input.durationMinutes ?? 30,
    estimatedMinutes: input.estimatedMinutes,
    deadline: input.deadline,
    priority: input.priority || 'medium',
    state: input.state || 'not_started',
    isBlocked: input.isBlocked ?? false,
    blockerReason: input.blockerReason,
    dependsOn: input.dependsOn,
    subtasks: input.subtasks,
    nextAction: input.nextAction,
    completionCriterion: input.completionCriterion,
    snoozeUntil: input.snoozeUntil,
    recurrence: input.recurrence,
    fixedStart: input.fixedStart,
    fixedEnd: input.fixedEnd,
    scheduledStart: input.scheduledStart,
    scheduledEnd: input.scheduledEnd,
    reminderAcknowledged: input.reminderAcknowledged ?? false,
    createdAt: now,
    updatedAt: now,
  };
  const tasks = getTasks(userId);
  tasks.push(task);
  save(userId, tasks);
  return task;
}

export function updateTask(userId: string, taskId: string, patch: Partial<Task>): Task | null {
  const tasks = getTasks(userId);
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return null;
  const updated: Task = {
    ...tasks[idx],
    ...patch,
    id: taskId,
    updatedAt: nowIso(),
  };
  tasks[idx] = updated;
  save(userId, tasks);
  return updated;
}

export function deleteTask(userId: string, taskId: string): boolean {
  const tasks = getTasks(userId);
  const next = tasks.filter((t) => t.id !== taskId);
  if (next.length === tasks.length) return false;
  save(userId, next);
  return true;
}

export function setBlocked(userId: string, taskId: string, isBlocked: boolean, reason?: string): Task | null {
  return updateTask(userId, taskId, {
    isBlocked,
    state: isBlocked ? 'blocked' : 'not_started',
    blockerReason: reason,
  });
}

export function completeTask(userId: string, taskId: string, actualMinutes?: number): Task | null {
  ensureDir(userDir(userId)); // ensure dir for write
  return updateTask(userId, taskId, {
    state: 'done',
    actualMinutes: actualMinutes ?? undefined,
    completedAt: nowIso(),
    reminderAcknowledged: true,
  });
}

export function sanitizePriority(p: string): Priority {
  return ['low', 'medium', 'high', 'urgent'].includes(p) ? (p as Priority) : 'medium';
}

export function sanitizeState(s: string): Task['state'] {
  return ['not_started', 'in_progress', 'blocked', 'done', 'deferred'].includes(s)
    ? (s as Task['state'])
    : 'not_started';
}
