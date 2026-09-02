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
  /** When the task is booked. A CACHE of the calendar block, written in the same
   *  operation that writes the block, never independently. The calendar remains
   *  the source of truth; this exists so overdue detection does not need a Google
   *  round-trip on every reminder poll. */
  scheduledStart?: string;
  scheduledEnd?: string;
  /** Why the task slipped or was moved. Feeds estimate calibration (docs/01). */
  slipReason?: string;
  /** How many times the user has pushed this task. High counts are a signal the
   *  task is mis-scoped or being avoided, not that the estimate was unlucky. */
  rescheduleCount?: number;
  /** Recurrence for calendar events. 'weekly' = repeat weekly on the slot's
   *  weekday/time; or a raw RRULE string (e.g. 'RRULE:FREQ=WEEKLY;BYDAY=MO'). */
  recurrence?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/**
 * What the user pressed on a reminder. Every one of these writes through to
 * Google Calendar in the same operation - the action IS the sync, which is why
 * there is no separate reconciliation step.
 *
 * SNOOZE is deliberately gone: it hid the decision rather than making one, and
 * left the calendar block sitting at a time the user had already rejected.
 */
export type ReminderIntent =
  /** Finished. Block stays on the calendar, retitled, as a record of the day. */
  | 'DONE'
  /** Move it. The block moves with it. */
  | 'RESCHEDULE'
  /** Drop the task entirely and remove its block. Confirmed before it applies. */
  | 'CANCEL'
  /** Seen it, changing nothing. Stops the nagging without touching the calendar. */
  | 'ACK';

/** Where RESCHEDULE puts it. 'agent' hands the choice to the scheduler. */
export type RescheduleMode = '30m' | '1h' | 'agent';

export interface ReminderResponseInput {
  taskId: string;
  intent: ReminderIntent;
  reason?: string;
  mode?: RescheduleMode;
  actualDurationMinutes?: number;
}
