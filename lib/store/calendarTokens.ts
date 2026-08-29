import { userDir, readJson, writeJson, ensureDir } from './paths';

export interface CalendarTokenBundle {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // ms epoch
  scope?: string;
}

const fileFor = (userId: string) => `${userDir(userId)}/calendar_tokens.json`;

export function getCalendarTokens(userId: string): CalendarTokenBundle | null {
  return readJson<CalendarTokenBundle | null>(fileFor(userId), null);
}

export function setCalendarTokens(userId: string, bundle: CalendarTokenBundle): void {
  ensureDir(userDir(userId));
  writeJson(fileFor(userId), bundle);
}

export function clearCalendarTokens(userId: string): void {
  ensureDir(userDir(userId));
  writeJson(fileFor(userId), null);
}
