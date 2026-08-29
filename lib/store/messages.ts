import { chatDir, readJson, writeJson } from './paths';

export interface StoredChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

interface Transcript {
  messages: StoredChatMessage[];
}

const empty = (): Transcript => ({ messages: [] });

function fileFor(userId: string, chatId: string): string {
  return `${chatDir(userId, chatId)}/transcript.json`;
}

function transcript(userId: string, chatId: string): Transcript {
  return readJson<Transcript>(fileFor(userId, chatId), empty());
}

export function appendMessage(
  userId: string,
  chatId: string,
  msg: Omit<StoredChatMessage, 'id' | 'timestamp'>
): StoredChatMessage {
  const t = transcript(userId, chatId);
  const stored: StoredChatMessage = {
    ...msg,
    id: `${msg.sender}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    timestamp: new Date().toISOString(),
  };
  t.messages.push(stored);
  writeJson(fileFor(userId, chatId), t);
  return stored;
}

export function getTranscript(userId: string, chatId: string): StoredChatMessage[] {
  return transcript(userId, chatId).messages;
}

export function getLastN(userId: string, chatId: string, n = 20): StoredChatMessage[] {
  const all = transcript(userId, chatId).messages;
  return all.slice(-n);
}

export function clearTranscript(userId: string, chatId: string): void {
  writeJson(fileFor(userId, chatId), empty());
}
