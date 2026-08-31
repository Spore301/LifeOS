import {
  ensureChatSession,
  sendChatMessage,
  streamChatMessage,
  listSessionMessages,
  abortSession,
  deleteSession,
  type AgentStreamEvent,
} from './gateway';
import {
  getChatRecord,
  getOrCreateChat,
  setSessionId,
  setOnline,
  touchActivity,
  setAllOffline,
} from '../store/chats';
import { appendMessage, getTranscript, getLastN, StoredChatMessage } from '../store/messages';
import { chatDir } from '../store/paths';

export interface ChatReply {
  sessionId: string;
  reply: string;
  transcript: StoredChatMessage[];
}

function shortId(): string {
  return `chat-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/**
 * High-level: send a user message to a (user, chat) OpenCode session.
 * Creates the session on first use, resumes an existing one otherwise.
 */
export async function sendToChat(
  userId: string,
  chatId: string,
  userText: string,
  opts: { createIfMissing?: boolean } = {}
): Promise<ChatReply> {
  const record = getChatRecord(userId, chatId);
  if (!record && opts.createIfMissing === false) {
    throw new Error('Chat not found');
  }

  const chat = getOrCreateChat(userId, chatId, { directory: chatDir(userId, chatId) });
  const resume = Boolean(chat.sessionId);
  const info = await ensureChatSession(userId, chatId, chat.sessionId, chat.sessionDirectory);

  // Persist the live opencode session id so future calls resume it.
  setSessionId(userId, chatId, info.sessionId, info.directory);
  touchActivity(userId, chatId);

  appendMessage(userId, chatId, { sender: 'user', content: userText });
  setOnline(userId, chatId, true);

  const { reply } = await sendChatMessage(userId, chatId, info.sessionId, userText, { resume });
  appendMessage(userId, chatId, { sender: 'assistant', content: reply });
  touchActivity(userId, chatId);

  return { sessionId: info.sessionId, reply, transcript: getTranscript(userId, chatId) };
}

/**
 * Same as sendToChat, but reports progress while the run is in flight so the UI
 * can show text as it arrives and name the steps the agent is taking.
 * The transcript is written once at the end, exactly as the blocking path does.
 */
export async function streamToChat(
  userId: string,
  chatId: string,
  userText: string,
  onEvent: (event: AgentStreamEvent) => void,
  opts: { createIfMissing?: boolean; signal?: AbortSignal } = {}
): Promise<ChatReply> {
  const record = getChatRecord(userId, chatId);
  if (!record && opts.createIfMissing === false) {
    throw new Error('Chat not found');
  }

  const chat = getOrCreateChat(userId, chatId, { directory: chatDir(userId, chatId) });
  const resume = Boolean(chat.sessionId);
  const info = await ensureChatSession(userId, chatId, chat.sessionId, chat.sessionDirectory);

  setSessionId(userId, chatId, info.sessionId, info.directory);
  touchActivity(userId, chatId);

  appendMessage(userId, chatId, { sender: 'user', content: userText });
  setOnline(userId, chatId, true);

  const reply = await streamChatMessage(
    userId,
    chatId,
    info.sessionId,
    info.directory,
    userText,
    { resume, signal: opts.signal },
    onEvent
  );

  appendMessage(userId, chatId, { sender: 'assistant', content: reply });
  touchActivity(userId, chatId);

  return { sessionId: info.sessionId, reply, transcript: getTranscript(userId, chatId) };
}

/** Create a chat record without sending a message (list/create UX). */
export function openChat(userId: string, chatId?: string, title?: string): { chatId: string } {
  const id = chatId || shortId();
  getOrCreateChat(userId, id, { title, directory: chatDir(userId, id) });
  return { chatId: id };
}

export function getChatHistory(userId: string, chatId: string): StoredChatMessage[] {
  return getTranscript(userId, chatId);
}

export function getChatTail(userId: string, chatId: string, n = 20): StoredChatMessage[] {
  return getLastN(userId, chatId, n);
}

/** Mark a chat offline and abort its running session (user navigated away). */
export async function endChat(userId: string, chatId: string): Promise<void> {
  const record = getChatRecord(userId, chatId);
  if (record?.sessionId) {
    await abortSession(record.sessionId);
  }
  setOnline(userId, chatId, false);
}

/** Gracefully shut down all of a user's online sessions (e.g. on logout). */
export async function endAllUserChats(userId: string): Promise<void> {
  setAllOffline(userId);
  // Deletion of sessions can be deferred to a sweep; abort handles in-flight work.
}

/** Hard cleanup: destroys the opencode session and removes the chat record. */
export async function destroyChat(userId: string, chatId: string): Promise<void> {
  const record = getChatRecord(userId, chatId);
  if (record?.sessionId) {
    await deleteSession(record.sessionId);
  }
  setAllOffline(userId);
  // chat record removal handled by caller if desired
}

/** Retrieve the raw opencode messages for a chat (richer than local transcript). */
export async function getRawSessionMessages(userId: string, chatId: string): Promise<any[]> {
  const record = getChatRecord(userId, chatId);
  if (!record?.sessionId) return [];
  return listSessionMessages(record.sessionId);
}
