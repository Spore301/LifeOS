import { userDir, readJson, writeJson, nowIso } from './paths';

export interface ChatRecord {
  chatId: string;
  sessionId?: string; // opencode session id
  /** Working directory the opencode session was created with. If the layout moves,
   *  a session bound to the old path can no longer run and must be recreated. */
  sessionDirectory?: string;
  title?: string;
  directory?: string;
  createdAt: string;
  updatedAt: string;
  online: boolean; // whether the session is currently active/online
  lastActivity?: string;
}

interface ChatRegistry {
  chats: Record<string, ChatRecord>;
}

const empty = (): ChatRegistry => ({ chats: {} });

function fileFor(userId: string): string {
  return `${userDir(userId)}/chats.json`;
}

function registry(userId: string): ChatRegistry {
  const reg = readJson<ChatRegistry>(fileFor(userId), empty());
  reg.chats = reg.chats || {};
  return reg;
}

function save(userId: string, reg: ChatRegistry): void {
  writeJson<ChatRegistry>(fileFor(userId), reg);
}

export function getChatRecord(userId: string, chatId: string): ChatRecord | undefined {
  return registry(userId).chats[chatId];
}

export function listChatRecords(userId: string): ChatRecord[] {
  const reg = registry(userId);
  return Object.values(reg.chats).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getOrCreateChat(
  userId: string,
  chatId: string,
  opts: { title?: string; directory?: string } = {}
): ChatRecord {
  const reg = registry(userId);
  const now = nowIso();
  let rec = reg.chats[chatId];
  if (!rec) {
    rec = {
      chatId,
      sessionId: undefined,
      title: opts.title || 'New LifeOS chat',
      directory: opts.directory,
      createdAt: now,
      updatedAt: now,
      online: true,
      lastActivity: now,
    };
    reg.chats[chatId] = rec;
    save(userId, reg);
  } else {
    rec = {
      ...rec,
      title: opts.title ?? rec.title,
      directory: opts.directory ?? rec.directory,
      online: true,
      updatedAt: now,
      lastActivity: now,
    };
    reg.chats[chatId] = rec;
    save(userId, reg);
  }
  return rec;
}

export function setSessionId(
  userId: string,
  chatId: string,
  sessionId: string,
  sessionDirectory?: string
): void {
  const reg = registry(userId);
  if (reg.chats[chatId]) {
    reg.chats[chatId].sessionId = sessionId;
    if (sessionDirectory) reg.chats[chatId].sessionDirectory = sessionDirectory;
    reg.chats[chatId].updatedAt = nowIso();
    save(userId, reg);
  }
}

export function setOnline(userId: string, chatId: string, online: boolean): void {
  const reg = registry(userId);
  if (reg.chats[chatId]) {
    reg.chats[chatId].online = online;
    reg.chats[chatId].updatedAt = nowIso();
    save(userId, reg);
  }
}

export function touchActivity(userId: string, chatId: string): void {
  const reg = registry(userId);
  if (reg.chats[chatId]) {
    reg.chats[chatId].lastActivity = nowIso();
    reg.chats[chatId].updatedAt = nowIso();
    save(userId, reg);
  }
}

/** Mark every chat for a user offline (e.g. on logout / idle sweep). */
export function setAllOffline(userId: string): void {
  const reg = registry(userId);
  for (const chatId of Object.keys(reg.chats)) {
    reg.chats[chatId].online = false;
  }
  save(userId, reg);
}

export function removeChat(userId: string, chatId: string): void {
  const reg = registry(userId);
  delete reg.chats[chatId];
  save(userId, reg);
}
