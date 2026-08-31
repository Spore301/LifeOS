import fs from 'fs';
import { userDir, userSecretsDir, readJson, writeJson, ensureDir } from './paths';

export interface CalendarTokenBundle {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // ms epoch
  scope?: string;
}

const FILE_NAME = `calendar_tokens.json`;

const fileFor = (userId: string) => `${userSecretsDir(userId)}/${FILE_NAME}`;

// Where tokens used to live: inside the agent-readable data volume.
const legacyFileFor = (userId: string) => `${userDir(userId)}/${FILE_NAME}`;

/**
 * Read a user's Google credentials, migrating any file still sitting in the old
 * agent-visible location. The legacy copy is deleted once it has been moved, so the
 * token stops being readable from the opencode container.
 */
export function getCalendarTokens(userId: string): CalendarTokenBundle | null {
  const current = readJson<CalendarTokenBundle | null>(fileFor(userId), null);
  if (current) return current;

  const legacyPath = legacyFileFor(userId);
  const legacy = readJson<CalendarTokenBundle | null>(legacyPath, null);
  if (!legacy) return null;

  setCalendarTokens(userId, legacy);
  try {
    fs.unlinkSync(legacyPath);
  } catch {
    // Migration is best-effort; the token is already safe in the new location.
  }
  return legacy;
}

export function setCalendarTokens(userId: string, bundle: CalendarTokenBundle): void {
  ensureDir(userSecretsDir(userId));
  writeJson(fileFor(userId), bundle);
}

export function clearCalendarTokens(userId: string): void {
  ensureDir(userSecretsDir(userId));
  writeJson(fileFor(userId), null);
}
