import { getTasks } from './store/tasks';
import { Task } from './task-types';

/**
 * Reminder scheduling policy (JITAI) per docs/01 §6 and docs/04.
 * A task is "due to be reminded" when:
 *  - it is active (not_started / in_progress) and not done/deferred/dropped,
 *  - not already acknowledged (unless snooze has elapsed),
 *  - outside the configured quiet window (default 22:00–08:00),
 *  - has reached its lead time.
 */
interface ReminderDueConfig {
  quietStartHour: number;
  quietEndHour: number;
  now: Date;
}

const defaultConfig = (): ReminderDueConfig => {
  const now = new Date();
  return {
    quietStartHour: parseInt(process.env.LIFEOS_QUIET_START || '22', 10),
    quietEndHour: parseInt(process.env.LIFEOS_QUIET_END || '8', 10),
    now,
  };
};

export interface DueReminder {
  taskId: string;
  title: string;
  project?: string;
  deadline?: string;
  durationMinutes: number;
  priority: string;
  suggestion: string; // if-then implementation-intention wording
}

function inQuietWindow(cfg: ReminderDueConfig): boolean {
  const h = cfg.now.getHours();
  if (cfg.quietStartHour <= cfg.quietEndHour) {
    return h >= cfg.quietStartHour && h < cfg.quietEndHour;
  }
  // quiet window wraps midnight, e.g. 22..08
  return h >= cfg.quietStartHour || h < cfg.quietEndHour;
}

/**
 * Compute which active tasks are due for a reminder right now.
 */
export function computeDueReminders(userId: string): DueReminder[] {
  const cfg = defaultConfig();
  if (inQuietWindow(cfg)) return [];

  const tasks = getTasks(userId).filter(
    (t) => (t.state === 'not_started' || t.state === 'in_progress') && !t.isBlocked
  );

  const out: DueReminder[] = [];

  for (const t of tasks) {
    // If snoozed and snooze time hasn't passed, skip.
    if (t.snoozeUntil && new Date(t.snoozeUntil).getTime() > cfg.now.getTime()) {
      continue;
    }

    // Only remind when we are within the lead window of the deadline (or overdue).
    if (t.deadline) {
      const due = new Date(t.deadline).getTime();
      const leadMs = leadTimeMs(t);
      const windowStart = due - leadMs;
      if (cfg.now.getTime() < windowStart && cfg.now.getTime() < due) {
        continue; // too early
      }
    }

    out.push({
      taskId: t.id,
      title: t.title,
      project: t.project,
      deadline: t.deadline,
      durationMinutes: t.durationMinutes,
      priority: t.priority,
      suggestion: implementationIntention(t),
    });
  }

  return out;
}

function leadTimeMs(t: Task): number {
  switch (t.priority) {
    case 'urgent':
      return 15 * 60 * 1000;
    case 'high':
      return 45 * 60 * 1000;
    case 'medium':
      return 2 * 60 * 60 * 1000;
    default:
      return 6 * 60 * 60 * 1000;
  }
}

/**
 * Frame the reminder as an implementation intention (Gollwitzer):
 * "When <cue>, then <next action>."
 */
function implementationIntention(t: Task): string {
  const cue =
    t.nextAction
      ? `after you ${t.nextAction}`
      : t.deadline
      ? `when it reaches ${new Date(t.deadline).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : 'when you have a free slot';
  return `When ${cue}, then work on "${t.title}" for ${t.durationMinutes} minutes.`;
}
