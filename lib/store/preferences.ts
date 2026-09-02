import { userDir, readJson, writeJson, ensureDir } from './paths';

/**
 * Small per-user settings that are choices, not inferred behaviour.
 *
 * Kept separate from persona.md deliberately: the persona is rewritten wholesale
 * by the nightly build, so anything the user explicitly SET would be lost there.
 */
export interface UserPreferences {
  /** Skip the reschedule menu and let the scheduler pick the slot every time. */
  alwaysLetAgentDecide?: boolean;
}

const fileFor = (userId: string) => `${userDir(userId)}/preferences.json`;

export function getPreferences(userId: string): UserPreferences {
  return readJson<UserPreferences>(fileFor(userId), {});
}

export function setPreferences(userId: string, patch: Partial<UserPreferences>): UserPreferences {
  ensureDir(userDir(userId));
  const next = { ...getPreferences(userId), ...patch };
  writeJson(fileFor(userId), next);
  return next;
}
