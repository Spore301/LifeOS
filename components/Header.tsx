'use client';

import React from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { Sparkles, Calendar, Cpu, User, LogOut, CheckCircle2 } from 'lucide-react';

interface HeaderProps {
  onToggleCalendarPreview?: () => void;
  showCalendarPreview?: boolean;
}

export default function Header({ onToggleCalendarPreview, showCalendarPreview }: HeaderProps) {
  const { data: session, status } = useSession();

  return (
    <header className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 lg:px-8 py-3.5 shadow-sm">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        {/* Brand logo & title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-indigo-400 flex items-center justify-center shadow-sm">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-slate-900">LifeOS</h1>
              <span className="px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
                POC
              </span>
            </div>
            <p className="text-xs text-slate-500 font-normal">Voice-first AI scheduling assistant</p>
          </div>
        </div>

        {/* Action Controls & Auth */}
        <div className="flex items-center gap-3">
          {/* Toggle Calendar Drawer Button */}
          {onToggleCalendarPreview && (
            <button
              onClick={onToggleCalendarPreview}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                showCalendarPreview
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Timeline Preview</span>
            </button>
          )}

          {/* User Auth Profile */}
          {status === 'authenticated' && session?.user ? (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1 pl-2.5">
              {session.user.image ? (
                <img src={session.user.image} alt={session.user.name || 'User'} className="w-6 h-6 rounded-full border border-indigo-200" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-medium text-xs">
                  {session.user.name?.[0] || 'U'}
                </div>
              )}
              <span className="text-xs font-medium text-slate-700 hidden sm:inline">{session.user.name?.split(' ')[0]}</span>
              <button
                onClick={() => signOut()}
                className="p-1 hover:bg-slate-200/80 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => signIn('google')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all"
            >
              <User className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
