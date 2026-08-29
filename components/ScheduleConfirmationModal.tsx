'use client';

import React from 'react';
import { ProposedSchedule } from '@/lib/types';
import { Clock, AlertTriangle, Check, X, ShieldCheck, Loader2 } from 'lucide-react';

interface ScheduleConfirmationModalProps {
  isOpen: boolean;
  proposedSchedule: ProposedSchedule | null;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  isWriting: boolean;
}

export default function ScheduleConfirmationModal({
  isOpen,
  proposedSchedule,
  onConfirm,
  onCancel,
  isWriting,
}: ScheduleConfirmationModalProps) {
  if (!isOpen || !proposedSchedule) return null;

  const formatTimeRange = (startIso: string, endIso: string) => {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const timeFormat: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
    return `${start.toLocaleTimeString([], timeFormat)} – ${end.toLocaleTimeString([], timeFormat)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-xl rounded-2xl border border-slate-200 p-6 shadow-2xl relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Confirm Calendar Write</h2>
              <p className="text-xs text-slate-500">Review proposed event slots before writing to Google Calendar</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isWriting}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Warnings Banner */}
        {proposedSchedule.conflictWarnings.length > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
            <div className="font-semibold flex items-center gap-1.5 text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Schedule Notes & Reschedule Cascades:</span>
            </div>
            {proposedSchedule.conflictWarnings.map((warn, i) => (
              <p key={i} className="pl-5 text-[11px] text-amber-800">• {warn}</p>
            ))}
          </div>
        )}

        {/* Proposed Slots List */}
        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Proposed Event Slots ({proposedSchedule.scheduledTasks.length})
          </h3>

          {proposedSchedule.scheduledTasks.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">No active tasks available to schedule.</p>
          ) : (
            proposedSchedule.scheduledTasks.map((st, idx) => (
              <div
                key={idx}
                className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between hover:border-indigo-300 transition-all"
              >
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 flex items-center gap-2">
                    <span>{st.task.title}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded-full uppercase font-medium border ${
                      st.task.priority === 'urgent' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                      st.task.priority === 'high' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-indigo-50 text-indigo-700 border-indigo-200'
                    }`}>
                      {st.task.priority}
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{formatTimeRange(st.slot.start, st.slot.end)}</span>
                    <span className="text-slate-400">({st.task.durationMinutes} mins)</span>
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 border-t border-slate-100 pt-4 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Google Calendar Single Source of Truth
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              disabled={isWriting}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isWriting || proposedSchedule.scheduledTasks.length === 0}
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-xl shadow-sm flex items-center gap-2 transition-all"
            >
              {isWriting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Writing to Google Calendar...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Confirm & Write to Calendar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
