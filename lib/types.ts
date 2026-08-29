export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
  id: string;
  title: string;
  durationMinutes: number;
  deadline?: string; // ISO date string or description (e.g. "today by 5pm")
  priority: Priority;
  isBlocked?: boolean;
  blockerReason?: string;
  category?: string;
  /** Recurrence for calendar events. 'weekly' = repeat weekly on the slot's
   *  weekday/time; or a raw RRULE string (e.g. 'RRULE:FREQ=WEEKLY;BYDAY=MO'). */
  recurrence?: string;
}

export interface ClarificationQuestion {
  id: string;
  taskId?: string;
  question: string;
  fieldMissing: 'duration' | 'title' | 'deadline' | 'priority' | 'general';
  options?: string[];
}

export interface ParseResult {
  tasks: Task[];
  clarifications: ClarificationQuestion[];
  intent: 'NEW_TASKS' | 'FLAG_BLOCKER' | 'ADD_URGENT' | 'ANSWER_CLARIFICATION' | 'UNKNOWN';
  rawTranscript: string;
  assistantSummary: string;
}

export interface TimeSlot {
  start: string; // ISO timestamp
  end: string;   // ISO timestamp
}

export interface ScheduledTask {
  task: Task;
  slot: TimeSlot;
  googleEventId?: string;
}

export interface ProposedSchedule {
  scheduledTasks: ScheduledTask[];
  unscheduledTasks: Task[];
  bumpedTasks: Task[];
  conflictWarnings: string[];
}

export interface LifeOSPrivateProperties {
  lifeos_task_id: string;
  lifeos_priority: Priority;
  lifeos_blocker_status?: 'active' | 'cleared';
  lifeos_managed: 'true';
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  recurrence?: string[];
  extendedProperties?: {
    private?: Partial<LifeOSPrivateProperties>;
  };
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  audioUrl?: string;
  timestamp: string;
  tasksExtracted?: Task[];
  clarificationRequired?: ClarificationQuestion;
  proposedSchedule?: ProposedSchedule;
}
