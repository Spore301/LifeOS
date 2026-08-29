'use client';

import React, { useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';

export interface DueReminderUi {
  taskId: string;
  title: string;
  project?: string;
  deadline?: string;
  durationMinutes: number;
  priority: string;
  suggestion: string;
}

interface ReminderToastProps {
  reminder: DueReminderUi | null;
  onResolved: (taskId: string) => void;
}

export default function ReminderToast({ reminder, onResolved }: ReminderToastProps) {
  const [pendingIntent, setPendingIntent] = useState<string | null>(null);
  const [snoozeMinutes, setSnoozeMinutes] = useState(30);

  if (!reminder) return null;

  const sendIntent = async (intent: string) => {
    setPendingIntent(intent);
    try {
      const body: Record<string, unknown> = { intent };
      if (intent === 'SNOOZE') {
        const until = new Date(Date.now() + snoozeMinutes * 60000).toISOString();
        body.snoozeUntil = until;
      }
      await fetch(`/api/tasks/${reminder.taskId}/reminder-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      onResolved(reminder.taskId);
    } catch (e) {
      console.error('Reminder response error:', e);
    } finally {
      setPendingIntent(null);
    }
  };

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[min(520px,92vw)] animate-bounce">
      <div className="bg-white border border-amber-200 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
            <Bell className="w-5 h-5 animate-mic-light" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-amber-900 tracking-wide uppercase">
              Reminder
            </div>
            <p className="text-sm font-medium text-slate-900 mt-0.5">{reminder.title}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{reminder.suggestion}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => sendIntent('ACCEPT')}
                disabled={!!pendingIntent}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-all"
              >
                {pendingIntent === 'ACCEPT' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Got it - do it'}
              </button>
              <button
                onClick={() => sendIntent('DONE')}
                disabled={!!pendingIntent}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-all"
              >
                {pendingIntent === 'DONE' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Done'}
              </button>
              <button
                onClick={() => sendIntent('DELAYED')}
                disabled={!!pendingIntent}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition-all"
              >
                {pendingIntent === 'DELAYED' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Can't do now"}
              </button>

              <div className="flex items-center gap-1.5 ml-auto">
                <select
                  value={snoozeMinutes}
                  onChange={(e) => setSnoozeMinutes(Number(e.target.value))}
                  className="text-[11px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white text-slate-700 outline-none"
                  disabled={!!pendingIntent}
                >
                  <option value={15}>15m</option>
                  <option value={30}>30m</option>
                  <option value={60}>1h</option>
                  <option value={120}>2h</option>
                </select>
                <button
                  onClick={() => sendIntent('SNOOZE')}
                  disabled={!!pendingIntent}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-all"
                >
                  {pendingIntent === 'SNOOZE' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Snooze'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
