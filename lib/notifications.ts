import { DueReminder } from './reminders';
import { Task } from './task-types';
import { listChatRecords } from './store/chats';

export interface DeliveredNotification {
  type: 'reminder';
  taskId: string;
  message: string;
  choices: string[];
  /** Set when the block's window closed with the task still open. */
  needsAction?: boolean;
  /** How many other tasks are in the same state, for a batched prompt. */
  alsoOverdue?: number;
  targetChatId?: string;
  timestamp: string;
}

/** The four things a reminder can be answered with. See ReminderIntent. */
export const REMINDER_CHOICES = ['Done', 'Reschedule', 'Cancel', 'Got it'];

/**
 * Most recently active online chat, or undefined when the user is away.
 *
 * Sorted properly: the previous comparator returned 1 or -1 and never 0, and
 * returned -1 whenever either timestamp was missing, so "most recent" was
 * effectively arbitrary and reminders could target the wrong chat.
 */
function targetChat(userId: string): string | undefined {
  const online = listChatRecords(userId).filter((c) => c.online);
  if (online.length === 0) return undefined;

  const stamp = (v?: string) => (v ? new Date(v).getTime() : 0);
  return [...online].sort((a, b) => stamp(b.lastActivity) - stamp(a.lastActivity))[0]?.chatId;
}

/**
 * One prompt for every task whose window closed while it was still open.
 *
 * Batched on purpose: a day with six blocks would otherwise produce six separate
 * interruptions, and the reliable outcome of that is the user ignoring all of
 * them. One prompt carries the same information and costs one interruption.
 */
export function deliverOverdue(userId: string, overdue: Task[]): DeliveredNotification[] {
  if (overdue.length === 0) return [];

  const [first, ...rest] = overdue;
  const others = rest.length;

  return [
    {
      type: 'reminder' as const,
      taskId: first.id,
      message:
        others > 0
          ? `"${first.title}" and ${others} other ${others === 1 ? 'block' : 'blocks'} finished without being marked done. How did they go?`
          : `"${first.title}" finished without being marked done. How did it go?`,
      choices: REMINDER_CHOICES,
      needsAction: true,
      alsoOverdue: others,
      targetChatId: targetChat(userId),
      timestamp: new Date().toISOString(),
    },
  ];
}

/**
 * Convert due reminders into user-facing notifications, targeting the user's most
 * recently active online chat (or none if offline). In this POC the frontend renders
 * the returned notifications; delivery to WhatsApp is a Phase 2 channel.
 */
export async function deliverReminder(
  userId: string,
  due: DueReminder[]
): Promise<DeliveredNotification[]> {
  if (due.length === 0) return [];

  const target = targetChat(userId);

  return due.map((r) => ({
    type: 'reminder' as const,
    taskId: r.taskId,
    message: reminderText(r),
    choices: REMINDER_CHOICES,
    targetChatId: target,
    timestamp: new Date().toISOString(),
  }));
}

function reminderText(r: DueReminder): string {
  const line = `Task: ${r.title}${r.project ? `  (project: ${r.project})` : ''}`;
  const due = r.deadline
    ? `  Due: ${new Date(r.deadline).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : '';
  return `Reminder: ${line}${due}\n${r.suggestion}`;
}
