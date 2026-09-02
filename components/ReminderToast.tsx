'use client';

import React, { useState } from 'react';
import { Bell, Loader2, AlertTriangle, Check, Clock, X, Sparkles } from 'lucide-react';

export interface DueReminderUi {
  taskId: string;
  title: string;
  project?: string;
  deadline?: string;
  durationMinutes: number;
  priority: string;
  suggestion?: string;
  /** The block's window closed while the task was still open. */
  needsAction?: boolean;
  /** How many other tasks are in the same state right now. */
  alsoOverdue?: number;
  rescheduleCount?: number;
}

interface ReminderToastProps {
  reminder: DueReminderUi | null;
  onResolved: (taskId: string) => void;
  /** Saved "always let the agent decide" setting. */
  alwaysLetAgentDecide?: boolean;
  onPreferenceChange?: (value: boolean) => void;
}

type Panel = 'actions' | 'reschedule' | 'confirmCancel';

/**
 * The reminder is the control surface: every button here writes the task AND its
 * Google Calendar block in one request. Nothing is queued for later
 * reconciliation, which is why the calendar cannot drift from the answer given.
 */
export default function ReminderToast({
  reminder,
  onResolved,
  alwaysLetAgentDecide = false,
  onPreferenceChange,
}: ReminderToastProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('actions');
  const [outcome, setOutcome] = useState<string | null>(null);

  if (!reminder) return null;

  const send = async (
    intent: string,
    extra: Record<string, unknown> = {},
    keepOpen = false
  ) => {
    setPending(intent);
    try {
      const res = await fetch(`/api/tasks/${reminder.taskId}/reminder-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, ...extra }),
      });
      const data = await res.json();

      // Tell the user where it actually landed - the whole point of letting the
      // agent choose is that you still find out what it chose.
      if (data.newSlotLabel) {
        setOutcome(`Moved to ${data.newSlotLabel}`);
        setTimeout(() => onResolved(reminder.taskId), 2200);
        return;
      }
      if (!keepOpen) onResolved(reminder.taskId);
    } catch (e) {
      console.error('Reminder response error:', e);
      setOutcome('Could not reach the server - nothing was changed.');
    } finally {
      setPending(null);
    }
  };

  const reschedule = () => {
    // The saved preference exists to skip this menu entirely.
    if (alwaysLetAgentDecide) return send('RESCHEDULE', { mode: 'agent' });
    setPanel('reschedule');
  };

  const overdue = reminder.needsAction;
  const busy = pending !== null;

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-50 animate-toast-in">
      <div
        className={`rounded-2xl border shadow-xl bg-white overflow-hidden ${
          overdue ? 'border-amber-300' : 'border-slate-200'
        }`}
      >
        <div
          className={`flex items-start gap-3 px-4 py-3 ${
            overdue ? 'bg-amber-50' : 'bg-slate-50'
          }`}
        >
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              overdue ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'
            }`}
          >
            {overdue ? <AlertTriangle className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 leading-snug">
              {reminder.title}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {overdue ? 'Time is up - needs a decision' : `${reminder.durationMinutes} min`}
              {reminder.project ? ` · ${reminder.project}` : ''}
              {reminder.alsoOverdue ? ` · +${reminder.alsoOverdue} more waiting` : ''}
            </p>
            {(reminder.rescheduleCount ?? 0) >= 3 && (
              <p className="text-xs text-amber-700 mt-1">
                Moved {reminder.rescheduleCount} times already - worth breaking down?
              </p>
            )}
          </div>
        </div>

        <div className="px-4 py-3">
          {outcome ? (
            <p className="text-sm text-slate-700 py-1">{outcome}</p>
          ) : panel === 'actions' ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => send('DONE')}
                disabled={busy}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                {pending === 'DONE' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Done
              </button>

              <button
                onClick={reschedule}
                disabled={busy}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors"
              >
                {pending === 'RESCHEDULE' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Clock className="w-3.5 h-3.5" />
                )}
                Reschedule
              </button>

              <button
                onClick={() => setPanel('confirmCancel')}
                disabled={busy}
                className="px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 rounded-lg transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={() => send('ACK')}
                disabled={busy}
                className="px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50 rounded-lg transition-colors"
              >
                Got it
              </button>
            </div>
          ) : panel === 'reschedule' ? (
            <div>
              <p className="text-xs text-slate-500 mb-2">Move it to:</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => send('RESCHEDULE', { mode: '30m' })}
                  disabled={busy}
                  className="px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors"
                >
                  +30 min
                </button>
                <button
                  onClick={() => send('RESCHEDULE', { mode: '1h' })}
                  disabled={busy}
                  className="px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors"
                >
                  +1 hour
                </button>
                <button
                  onClick={() => send('RESCHEDULE', { mode: 'agent' })}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {pending === 'RESCHEDULE' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  Let the agent decide
                </button>
              </div>

              <label className="flex items-center gap-2 mt-3 text-xs text-slate-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alwaysLetAgentDecide}
                  onChange={(e) => onPreferenceChange?.(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Always let the agent decide
              </label>

              <button
                onClick={() => setPanel('actions')}
                className="mt-2 text-xs text-slate-400 hover:text-slate-600"
              >
                Back
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-slate-700 mb-1">Delete this task?</p>
              <p className="text-xs text-slate-500 mb-3">
                It will be removed from your list and its calendar block deleted.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => send('CANCEL', { confirmed: true })}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {pending === 'CANCEL' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <X className="w-3.5 h-3.5" />
                  )}
                  Yes, delete
                </button>
                <button
                  onClick={reschedule}
                  disabled={busy}
                  className="px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors"
                >
                  Reschedule instead
                </button>
                <button
                  onClick={() => setPanel('actions')}
                  className="px-3 py-2 text-sm text-slate-400 hover:text-slate-600"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
