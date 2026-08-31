
/** Per-user credential directory, deliberately outside the agent-visible data root. */
export function userSecretsDir(userId: string): string {
  return path.join(SECRETS_ROOT, 'users', sanitize(userId));
}
import fs from 'fs';
import path from 'path';

/**
 * Centralised filesystem layout for LifeOS.
 *
 * data/
 *   users/
 *     <user_id>/
 *       persona.md
 *       tasks.json
 *       chats/
 *         <chat_id>/          <- workspace folder the OpenCode session runs in
 *           AGENTS.md
 *         ...
 */
const DATA_ROOT = process.env.LIFEOS_DATA_DIR || path.join(process.cwd(), 'data');

/**
 * Credentials live OUTSIDE the data root. The opencode agent container mounts the
 * data volume (it needs the per-chat workspaces) and can run file tools there, so a
 * Google refresh token sitting in the user's data folder was readable by the model.
 * This root is mounted only by the app.
 */
const SECRETS_ROOT = process.env.LIFEOS_SECRETS_DIR || path.join(process.cwd(), 'secrets');

/**
 * Chat workspaces: the only tree the OpenCode agent container mounts. Keeping it
 * separate from DATA_ROOT means an agent with shell access cannot read another
 * user's tasks, persona or transcripts straight off disk.
 */
const WORKSPACE_ROOT = process.env.LIFEOS_WORKSPACE_DIR || path.join(process.cwd(), 'workspaces');

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function userDir(userId: string): string {
  return path.join(DATA_ROOT, 'users', sanitize(userId));
}

/** Agent working directory for a chat. Agent-visible - keep user data OUT of it. */
export function chatDir(userId: string, chatId: string): string {
  return path.join(WORKSPACE_ROOT, 'users', sanitize(userId), 'chats', sanitize(chatId));
}

/** App-side storage for a chat (transcripts). Never mounted by the agent container. */
export function chatDataDir(userId: string, chatId: string): string {
  return path.join(userDir(userId), 'chats', sanitize(chatId));
}

export function personaFile(userId: string): string {
  return path.join(userDir(userId), 'persona.md');
}

export function tasksFile(userId: string): string {
  return path.join(userDir(userId), 'tasks.json');
}

/**
 * Sanitise an identifier so it can never escape the data root.
 * Keeps [A-Za-z0-9_-] and collapses anything else to '-'.
 */
function sanitize(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'unknown';
}

export function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(file: string, value: T): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8');
}

export function readText(file: string, fallback = ''): string {
  if (!fs.existsSync(file)) return fallback;
  return fs.readFileSync(file, 'utf-8');
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function writeText(file: string, content: string): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, 'utf-8');
}
