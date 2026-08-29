import { DueReminder } from './reminders';
import { listChatRecords } from './store/chats';

export interface DeliveredNotification {
  type: 'reminder';
  taskId: string;
  message: string;
  choices: string[];
  targetChatId?: string;
  timestamp: string;
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

  const activeChats = listChatRecords(userId)
    .filter((c) => c.online)
    .sort((a, b) => (a.lastActivity && b.lastActivity && a.lastActivity < b.lastActivity ? 1 : -1));
  const target = activeChats[0];

  return due.map((r) => ({
    type: 'reminder' as const,
    taskId: r.taskId,
    message: reminderText(r),
    choices: [
      "Got it - I'll do it",
      `Can't do right now`,
      'Snooze until __:__',
      'Done',
    ],
    targetChatId: target?.chatId,
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
