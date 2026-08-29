'use client';

import React, { useState } from 'react';
import { ChatMessage, ClarificationQuestion, Task } from '@/lib/types';
import { Bot, User, HelpCircle, CheckCircle2, Clock, AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';

interface ChatThreadProps {
  messages: ChatMessage[];
  activeClarification: ClarificationQuestion | null;
  onClarificationAnswered: (answer: string, clarification: ClarificationQuestion) => void;
  onTaskBlockerToggle?: (taskId: string, isBlocked: boolean) => void;
}

export default function ChatThread({
  messages,
  activeClarification,
  onClarificationAnswered,
  onTaskBlockerToggle,
}: ChatThreadProps) {
  const [customClarificationInput, setCustomClarificationInput] = useState('');

  const handleAnswerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customClarificationInput.trim() || !activeClarification) return;
    onClarificationAnswered(customClarificationInput.trim(), activeClarification);
    setCustomClarificationInput('');
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      case 'high':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'medium':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
      default:
        return 'bg-slate-700/30 text-slate-400 border-slate-700/50';
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-4 border border-slate-800/90 flex flex-col h-[520px] shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 px-1">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Assistant Thread</h2>
        </div>
        <span className="text-[11px] text-slate-400">{messages.length} interaction{messages.length === 1 ? '' : 's'}</span>
      </div>

      {/* Messages Scroll View */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <Bot className="w-10 h-10 mb-2 opacity-30 text-indigo-400" />
            <p className="text-xs font-medium text-slate-400">No scheduling inputs yet</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
              Speak or type your raw brain dump using the control panel to see task extraction and CoT clarification in action.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none shadow-glow'
                    : 'bg-slate-900/90 border border-slate-800 text-slate-200 rounded-bl-none shadow-md'
                }`}
              >
                <p>{msg.content}</p>

                {/* Render Extracted Tasks if present */}
                {msg.tasksExtracted && msg.tasksExtracted.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-slate-800/80 pt-2.5">
                    <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                      Extracted Tasks ({msg.tasksExtracted.length})
                    </span>
                    <div className="grid gap-2">
                      {msg.tasksExtracted.map((task) => (
                        <div
                          key={task.id}
                          className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className={`w-4 h-4 ${task.isBlocked ? 'text-rose-400' : 'text-teal-400'}`} />
                            <div>
                              <div className="font-medium text-slate-200 flex items-center gap-1.5">
                                <span className={task.isBlocked ? 'line-through text-slate-400' : ''}>
                                  {task.title}
                                </span>
                                {task.isBlocked && (
                                  <span className="px-1.5 py-0.2 text-[9px] bg-rose-500/20 text-rose-300 rounded border border-rose-500/30">
                                    BLOCKED
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-500" />
                                  {task.durationMinutes} mins
                                </span>
                                {task.deadline && (
                                  <span>• Deadline: {task.deadline}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-medium border rounded-full uppercase ${getPriorityBadgeClass(
                                task.priority
                              )}`}
                            >
                              {task.priority}
                            </span>
                            {onTaskBlockerToggle && (
                              <button
                                onClick={() => onTaskBlockerToggle(task.id, !task.isBlocked)}
                                className={`p-1 rounded text-[10px] border transition-all ${
                                  task.isBlocked
                                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/30 hover:bg-teal-500/30'
                                    : 'bg-rose-500/10 text-rose-300 border-rose-500/20 hover:bg-rose-500/20'
                                }`}
                                title={task.isBlocked ? 'Unblock task' : 'Flag as blocked'}
                              >
                                {task.isBlocked ? 'Unblock' : 'Flag Blocker'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {msg.sender === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 flex-shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Chain-of-Thought (CoT) Single Clarification Question Banner */}
      {activeClarification && (
        <div className="mt-3 bg-indigo-950/60 border border-indigo-500/40 rounded-xl p-3 shadow-lg">
          <div className="flex items-center gap-2 text-indigo-300 text-xs font-semibold mb-1.5">
            <HelpCircle className="w-4 h-4 text-indigo-400 animate-bounce" />
            <span>Chain-of-Thought Clarification Required (1 Question)</span>
          </div>
          <p className="text-xs text-slate-200 mb-2.5 font-medium">
            {activeClarification.question}
          </p>

          <form onSubmit={handleAnswerSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={customClarificationInput}
              onChange={(e) => setCustomClarificationInput(e.target.value)}
              placeholder="Type your clarification (e.g. 'It takes 45 mins and due by 6pm')"
              className="flex-1 bg-slate-900 border border-indigo-500/30 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-400"
            />
            <button
              type="submit"
              disabled={!customClarificationInput.trim()}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-xs font-medium flex items-center gap-1 shadow-glow"
            >
              <span>Resolve</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
