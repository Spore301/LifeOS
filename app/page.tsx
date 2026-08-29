'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from '@/components/Header';
import ChatInterface, { UiChatMessage } from '@/components/ChatInterface';
import ChatSidebar, { ChatListItem } from '@/components/ChatSidebar';
import ReminderToast, { DueReminderUi } from '@/components/ReminderToast';
import { CalendarEvent } from '@/lib/types';
import { useSession, signIn, signOut } from 'next-auth/react';

// Map server-side JSON chat records to the sidebar shape.
function normalizeChats(raw: any[]): ChatListItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => ({
    chatId: c.chatId,
    title: c.title || '',
    sessionId: c.sessionId,
    online: !!c.online,
    updatedAt: c.updatedAt,
  }));
}

// Map the server transcript to a UI message shape.
function normalizeMessages(raw: any[]): UiChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((m: any) => ({
    id: m.id || `msg-${m.timestamp}-${Math.random()}`,
    sender: m.sender === 'user' ? 'user' : m.sender === 'system' ? 'system' : 'assistant',
    content: m.content,
    timestamp: m.timestamp,
  }));
}

function normalizeReminders(raw: any[]): DueReminderUi[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: any) => ({
    taskId: r.taskId,
    title: r.title,
    project: r.project,
    deadline: r.deadline,
    durationMinutes: r.durationMinutes,
    priority: r.priority,
    suggestion: r.suggestion,
  }));
}

export default function Home() {
  const { data: session, status } = useSession();

  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, UiChatMessage[]>>({});
  const [isChatsLoading, setIsChatsLoading] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [existingEvents, setExistingEvents] = useState<CalendarEvent[]>([]);
  const [showCalendarPreview, setShowCalendarPreview] = useState(false);
  const [dueReminders, setDueReminders] = useState<DueReminderUi[]>([]);
  const [activeReminder, setActiveReminder] = useState<DueReminderUi | null>(null);

  const processingRef = useRef(false);

  const fetchChats = useCallback(async () => {
    setIsChatsLoading(true);
    try {
      const res = await fetch('/api/chats');
      const data = await res.json();
      setChats(normalizeChats(data.chats));
    } catch (e) {
      console.error('Error fetching chats:', e);
    } finally {
      setIsChatsLoading(false);
    }
  }, []);

  const fetchTodayEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/today');
      const data = await res.json();
      if (data.events) setExistingEvents(data.events);
    } catch (err) {
      console.error('Error fetching calendar events:', err);
    }
  }, []);

  // Load initial chat list + calendar.
  useEffect(() => {
    fetchChats();
    fetchTodayEvents();
  }, [fetchChats, fetchTodayEvents]);

  // Load history for a newly selected chat.
  const loadChat = useCallback(
    async (chatId: string) => {
      if (chatMessages[chatId]) return;
      setIsChatLoading(true);
      try {
        const res = await fetch(`/api/chat/${chatId}/message`);
        const data = await res.json();
        setChatMessages((prev) => ({ ...prev, [chatId]: normalizeMessages(data.transcript) }));
      } catch (e) {
        console.error('Error loading chat:', e);
        setChatMessages((prev) => ({ ...prev, [chatId]: [] }));
      } finally {
        setIsChatLoading(false);
      }
    },
    [chatMessages]
  );

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    loadChat(chatId);
  };

  const handleCreateChat = async () => {
    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      const chatId = data.chatId;
      setChatMessages((prev) => ({ ...prev, [chatId]: [] }));
      setChats((prev) => [{ chatId, title: '', online: false }, ...prev]);
      setActiveChatId(chatId);
    } catch (e) {
      console.error('Error creating chat:', e);
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      await fetch(`/api/chat/${chatId}/destroy`, { method: 'POST' });
      setChats((prev) => prev.filter((c) => c.chatId !== chatId));
      setChatMessages((prev) => {
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
      if (activeChatId === chatId) setActiveChatId(null);
    } catch (e) {
      console.error('Error deleting chat:', e);
    }
  };

  // Send a message to the active (or a freshly created) chat through the agent API.
  const handleSend = async (text: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);

    try {
      let chatId: string | null = activeChatId;
      if (!chatId) {
        const res = await fetch('/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        chatId = data.chatId;
        setActiveChatId(chatId);
        setChats((prev) => [{ chatId: chatId as string, title: '', online: false }, ...prev]);
      }
      if (!chatId) return;

      // Optimistically append the user message.
      const userMsg: UiChatMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => ({ ...prev, [chatId!]: [...(prev[chatId!] || []), userMsg] }));

      const res = await fetch(`/api/chat/${chatId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();

      if (!res.ok) {
        const errMsg: UiChatMessage = {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          content: `Sorry, the assistant could not respond: ${data.error || data.detail || 'unknown error'}`,
          timestamp: new Date().toISOString(),
        };
        setChatMessages((prev) => ({ ...prev, [chatId!]: [...(prev[chatId!] || []), errMsg] }));
        return;
      }

      // Use the authoritative transcript returned by the server.
      setChatMessages((prev) => ({
        ...prev,
        [chatId!]: normalizeMessages(data.transcript),
      }));
    } catch (e: any) {
      console.error('Send error:', e);
      const chatId = activeChatId;
      if (chatId) {
        const errMsg: UiChatMessage = {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          content: `Sorry, something went wrong communicating with the assistant.`,
          timestamp: new Date().toISOString(),
        };
        setChatMessages((prev) => ({ ...prev, [chatId]: [...(prev[chatId] || []), errMsg] }));
      }
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  };

  // Reminder polling (JITAI pipeline).
  const pollReminders = useCallback(async () => {
    try {
      const res = await fetch('/api/reminders/due');
      const data = await res.json();
      setDueReminders(normalizeReminders(data.due));
    } catch (e) {
      console.error('Reminder poll error:', e);
    }
  }, []);

  useEffect(() => {
    pollReminders();
    const id = setInterval(pollReminders, 20000);
    return () => clearInterval(id);
  }, [pollReminders]);

  // Surface the first unresolved reminder as the active toast.
  useEffect(() => {
    setActiveReminder(dueReminders[0] || null);
  }, [dueReminders]);

  const handleReminderResolved = (taskId: string) => {
    setDueReminders((prev) => prev.filter((r) => r.taskId !== taskId));
  };

  const userLabel = session?.user?.name || session?.user?.email || '';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-indigo-600 selection:text-white">
      <Header
        onToggleCalendarPreview={() => setShowCalendarPreview((prev) => !prev)}
        showCalendarPreview={showCalendarPreview}
      />

      <main className="flex-1 flex overflow-hidden">
        <ChatSidebar
          chats={chats}
          activeChatId={activeChatId}
          isLoading={isChatsLoading}
          onSelect={handleSelectChat}
          onCreate={handleCreateChat}
          onDelete={handleDeleteChat}
          onSignOut={() => (status === 'authenticated' ? signOut() : signIn('google'))}
          userLabel={userLabel || undefined}
        />

        <ChatInterface
          chatId={activeChatId}
          messages={activeChatId ? chatMessages[activeChatId] || [] : []}
          onSend={handleSend}
          isProcessing={isProcessing}
          isChatLoading={isChatLoading}
        />
      </main>

      <ReminderToast reminder={activeReminder} onResolved={handleReminderResolved} />

      {showCalendarPreview && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-slate-200 shadow-2xl z-40 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Today&apos;s Calendar</h2>
            <button
              onClick={() => setShowCalendarPreview(false)}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium"
            >
              Close
            </button>
          </div>
          {existingEvents.length === 0 ? (
            <p className="text-xs text-slate-400">No events fetched (mock or empty calendar).</p>
          ) : (
            <div className="space-y-2">
              {existingEvents.map((evt, i) => (
                <div
                  key={evt.id || i}
                  className="border border-slate-200 rounded-xl p-3 text-xs text-slate-700"
                >
                  <div className="font-medium">{evt.summary}</div>
                  <div className="text-slate-400 mt-0.5">
                    {(evt.start as any)?.dateTime || (evt.start as any)?.date} →{' '}
                    {(evt.end as any)?.dateTime || (evt.end as any)?.date}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
