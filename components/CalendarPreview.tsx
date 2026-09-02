'use client';

import React from 'react';
import { CalendarEvent, ProposedSchedule } from '@/lib/types';
import { Calendar as CalendarIcon, Clock, Sparkles, X, AlertTriangle, Check } from 'lucide-react';

interface CalendarPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  existingEvents: CalendarEvent[];
  proposedSchedule: ProposedSchedule | null;
}

export default function CalendarPreview({
  isOpen,
  onClose,
  existingEvents,
  proposedSchedule,
}: CalendarPreviewProps) {
  if (!isOpen) return null;

  const hours = Array.from({ length: 11 }, (_, i) => i + 9); // 9am to 7pm

  const formatHour = (hour: number) => {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const formatted = hour > 12 ? hour - 12 : hour;
    return `${formatted}:00 ${ampm}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-md h-full border-l border-slate-200 p-6 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-600" />
            <h2 className="text-sm font-semibold text-slate-900">Today's Calendar Timeline</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Timeline Scroll Container */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-2">
          {hours.map((hour) => {
            const hourEvents = existingEvents.filter((evt) => {
              const evtStart = new Date(evt.start.dateTime || evt.start.date!);
              return evtStart.getHours() === hour;
            });

            const proposedInHour = proposedSchedule?.scheduledTasks.filter((st) => {
              const stStart = new Date(st.slot.start);
              return stStart.getHours() === hour;
            });

            return (
              <div key={hour} className="flex gap-3 py-2 border-b border-slate-100 min-h-[52px]">
                <div className="w-16 text-xs font-medium text-slate-400 pt-1 flex-shrink-0">
                  {formatHour(hour)}
                </div>

                <div className="flex-1 space-y-1.5">
                  {/* Existing Google Calendar Events */}
                  {hourEvents.map((evt) => {
                    // The server marks these when a block's window closed with the
                    // task still open, so the state is derived once and rendered
                    // identically here, in the toast, and in Google Calendar.
                    const needsAction = (evt.summary || '').includes('(!)');
                    const done = (evt.summary || '').includes('DONE -');

                    return (
                      <div
                        key={evt.id}
                        className={`rounded-lg p-2 flex items-center justify-between text-xs border ${
                          needsAction
                            ? 'bg-amber-50 border-amber-300'
                            : done
                            ? 'bg-emerald-50 border-emerald-200'
                            : 'bg-slate-100 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {needsAction ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                          ) : done ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-indigo-600 flex-shrink-0" />
                          )}
                          <span
                            className={`font-medium truncate ${
                              needsAction ? 'text-amber-900' : done ? 'text-emerald-900' : 'text-slate-800'
                            }`}
                          >
                            {evt.summary}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] flex-shrink-0 ml-2 ${
                            needsAction ? 'text-amber-700 font-medium' : 'text-slate-400'
                          }`}
                        >
                          {needsAction ? 'Action required' : done ? 'Done' : 'Existing'}
                        </span>
                      </div>
                    );
                  })}

                  {/* Pending Proposed Slots */}
                  {proposedInHour &&
                    proposedInHour.map((st, idx) => (
                      <div
                        key={idx}
                        className="bg-indigo-50 border border-indigo-200 rounded-lg p-2 flex items-center justify-between text-xs shadow-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                          <div>
                            <span className="font-medium text-indigo-950">{st.task.title}</span>
                            <div className="text-[10px] text-indigo-700">
                              Proposed ({st.task.durationMinutes} mins)
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 text-[9px] bg-indigo-600 text-white rounded font-medium">
                          PROPOSED
                        </span>
                      </div>
                    ))}

                  {hourEvents.length === 0 && (!proposedInHour || proposedInHour.length === 0) && (
                    <div className="h-full border-dashed border border-slate-200 rounded-lg flex items-center px-3 text-xs text-slate-300">
                      Free gap
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
