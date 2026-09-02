'use client';

import React from 'react';
import { Plus, MessageSquare, Trash2, Loader2, LogOut } from 'lucide-react';

export interface ChatListItem {
  chatId: string;
  title: string;
  sessionId?: string | null;
  online: boolean;
  updatedAt?: string;
}

interface ChatSidebarProps {
  chats: ChatListItem[];
  activeChatId: string | null;
  isLoading: boolean;
  onSelect: (chatId: string) => void;
  onCreate: () => void;
  onDelete: (chatId: string) => void;
  onSignOut: () => void;
  userLabel?: string;
  userImage?: string | null;
}

// A short, glanceable "last touched" label — not a precise timestamp.
function relativeTime(iso?: string): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ChatSidebar({
  chats,
  activeChatId,
  isLoading,
  onSelect,
  onCreate,
  onDelete,
  onSignOut,
  userLabel,
  userImage,
}: ChatSidebarProps) {
  return (
    <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col h-full">
      <div className="p-3">
        <button
          onClick={onCreate}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-sm transition-all"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          <span>New Chat</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {chats.length > 0 && (
          <div className="px-2.5 pt-1 pb-2 text-[11px] font-medium tracking-wide text-slate-400 uppercase">
            Chats
          </div>
        )}

        {chats.length === 0 && !isLoading && (
          <p className="text-[11px] text-slate-400 text-center mt-6 px-2 leading-relaxed">
            No chats yet.
            <br />
            Speak or type below to start one.
          </p>
        )}

        <div className="space-y-1">
          {chats.map((chat) => {
            const active = chat.chatId === activeChatId;
            const title =
              chat.title && chat.title.trim()
                ? chat.title
                : chat.chatId.replace(/^chat-/, '').slice(-8);
            const when = relativeTime(chat.updatedAt);
            return (
              <div
                key={chat.chatId}
                onClick={() => onSelect(chat.chatId)}
                className={`group flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer border transition-colors ${
                  active
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                    : 'border-transparent text-slate-700 hover:bg-slate-50 hover:border-slate-200'
                }`}
              >
                <MessageSquare
                  className={`w-4 h-4 flex-shrink-0 ${active ? 'text-indigo-500' : 'text-slate-400'}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{title}</div>
                  {chat.online ? (
                    <div className="text-[10px] text-emerald-600 flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      active
                    </div>
                  ) : (
                    when && <div className="text-[10px] text-slate-400 mt-0.5">{when}</div>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this chat and its agent session?')) {
                      onDelete(chat.chatId);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  title="Delete chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-3 border-t border-slate-200">
        <div className="group flex items-center gap-2.5 rounded-xl px-2 py-2 -mx-2 hover:bg-slate-50 transition-colors">
          {userImage ? (
            <img src={userImage} alt={userLabel || 'User'} className="w-7 h-7 rounded-full border border-indigo-200 flex-shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-medium text-xs flex-shrink-0">
              {userLabel?.[0]?.toUpperCase() || 'U'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-800 truncate">{userLabel || 'Local user'}</div>
          </div>
          <button
            onClick={onSignOut}
            className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex-shrink-0"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
