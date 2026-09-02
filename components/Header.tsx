'use client';

import React from 'react';
import { Sparkles, Calendar, Menu } from 'lucide-react';

interface HeaderProps {
  onToggleCalendarPreview?: () => void;
  showCalendarPreview?: boolean;
  /** Opens the chat drawer. Only rendered below `md`, where the sidebar is hidden. */
  onOpenSidebar?: () => void;
}

// Account identity and sign-out live in the sidebar footer (one place, not two).
// This bar stays quiet: brand mark plus the one global view toggle.
export default function Header({
  onToggleCalendarPreview,
  showCalendarPreview,
  onOpenSidebar,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 lg:px-8 py-3 shadow-sm">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {onOpenSidebar && (
            <button
              onClick={onOpenSidebar}
              // 40px target: below the 44px guideline is where taps start missing.
              className="md:hidden -ml-1.5 w-10 h-10 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors"
              aria-label="Open chats"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-indigo-400 flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-sm font-semibold tracking-tight text-slate-900">LifeOS</h1>
        </div>

        {onToggleCalendarPreview && (
          <button
            onClick={onToggleCalendarPreview}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              showCalendarPreview
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden sm:inline">Timeline Preview</span>
          </button>
        )}
      </div>
    </header>
  );
}
