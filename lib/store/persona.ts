import { personaFile, writeText, readText } from './paths';

export const PERSONA_HEADER = '# LifeOS Persona (auto-generated)';

/**
 * Every new persona file starts with the header line the agents rely on
 * ("ALWAYS read this first"). Reads fall back to a minimal default so the
 * system works before the first nightly persona build.
 */
export function getPersona(userId: string): string {
  const existing = readText(personaFile(userId), '');
  if (existing.trim()) return existing;
  return `${PERSONA_HEADER}

No persona has been built yet. Use state/behaviour inferred directly from the
current conversation and calendar. Do not invent facts about the user.
`;
}

export function setPersona(userId: string, content: string): void {
  const body = content.trim().startsWith(PERSONA_HEADER) ? content : `${PERSONA_HEADER}\n\n${content.trim()}`;
  writeText(personaFile(userId), body + '\n');
}
