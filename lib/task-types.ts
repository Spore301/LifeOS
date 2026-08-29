export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export type TaskState = 'not_started' | 'in_progress' | 'blocked' | 'done' | 'deferred';

export interface Task {
  id: string;
  title: string;
  project?: string;
  description?: string;
  durationMinutes: number; // calibrated/planned
  estimatedMinutes?: number; // user's raw estimate
  actualMinutes?: number; // recorded on completion
  deadline?: string; // ISO
  priority: Priority;
  state: TaskState;
  isBlocked: boolean;
  blockerReason?: string;
  dependsOn?: string[]; // task ids
  subtasks?: string[];
  nextAction?: string;
  completionCriterion?: string;
  snoozeUntil?: string;
  reminderAcknowledged?: boolean;
  /** Recurrence for calendar events. 'weekly' = repeat weekly on the slot's
   *  weekday/time; or a raw RRULE string (e.g. 'RRULE:FREQ=WEEKLY;BYDAY=MO'). */
  recurrence?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ReminderResponseInput {
  taskId: string;
  intent: 'ACCEPT' | 'DONE' | 'DELAYED' | 'SNOOZE' | 'DROP';
  reason?: string;
  snoozeUntil?: string;
  actualDurationMinutes?: number;
}
