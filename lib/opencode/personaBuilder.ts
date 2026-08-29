import { listChatRecords } from '../store/chats';
import { getTranscript } from '../store/messages';
import { getTasks } from '../store/tasks';
import { getPersona, setPersona } from '../store/persona';
import { userDir, ensureDir, nowIso } from '../store/paths';
import { getClient, isOpenCodeConfigured } from './gateway';
import { PERSONA_BUILD_PROMPT } from './prompts';

/**
 * Nightly per-user persona builder (docs/02 §6, docs/03 §4).
 *
 * Two modes:
 *  A) Live OpenCode agent: spawn a session in the user's folder, seed it with the day's
 *     data + previous persona, and let it rewrite persona.md (rich).
 *  B) Deterministic fallback: derive a concise persona from task/chat statistics so the
 *     system works even without a reachable OpenCode provider.
 */

export interface PersonaBuildInput {
  userId: string;
  day: string;
}

export async function buildPersona(input: PersonaBuildInput): Promise<{ mode: 'agent' | 'fallback'; userId: string; persona: string }> {
  ensureDir(userDir(input.userId));

  if (isOpenCodeConfigured()) {
    try {
      const persona = await buildWithAgent(input);
      return { mode: 'agent', userId: input.userId, persona };
    } catch (err) {
      console.error('[PersonaBuilder] agent mode failed, falling back:', err);
    }
  }

  const persona = buildFallback(input.userId);
  setPersona(input.userId, persona);
  return { mode: 'fallback', userId: input.userId, persona };
}

async function buildWithAgent(input: PersonaBuildInput): Promise<string> {
  const client = getClient();
  const dir = userDir(input.userId);

  const created: any = await client.session.create({
    body: { title: `Persona build ${input.day}` },
    query: { directory: dir },
    throwOnError: true,
  });
  const sessionId = created?.data?.id;
  if (!sessionId) throw new Error('No session id for persona build');

  const context = buildContext(input.userId, input.day);

  const part = { type: 'text' as const, text: `${PERSONA_BUILD_PROMPT}\n\n${context}`, synthetic: false };

  const res: any = await client.session.prompt({
    path: { id: sessionId },
    body: { parts: [part] },
    throwOnError: true,
  });

  const replyText = extractText(res?.data);

  // Ask the agent to actually persist, but ALSO persist a summary ourselves as a safety net.
  const personas = [replyText.trim(), buildFallback(input.userId)].filter(Boolean);
  const finalPersona = personas[0] && personas[0].length > 80 ? personas[0] : personas[1];
  setPersona(input.userId, finalPersona);

  try {
    await client.session.delete({ path: { id: sessionId }, throwOnError: true } as any);
  } catch {
    // best effort cleanup
  }

  return finalPersona;
}

function buildContext(userId: string, day: string): string {
  const chats = listChatRecords(userId);
  const chatSummaries = chats.map((c) => {
    const messages = getTranscript(userId, c.chatId);
    const userLines = messages
      .filter((m) => m.sender === 'user')
      .map((m) => `- ${m.content.slice(0, 300)}`)
      .join('\n');
    return `## Chat ${c.chatId} (${messages.length} msgs)\n${userLines || '(no user messages)'}`;
  });

  const tasks = getTasks(userId);
  const taskLines = tasks.map(
    (t) =>
      `- ${t.state}${t.isBlocked ? ' (blocked)' : ''} [${t.priority}] ${t.title} (${t.durationMinutes}m${
        t.actualMinutes ? ` actual ${t.actualMinutes}m` : ''
      })${t.blockerReason ? ` blocker: ${t.blockerReason}` : ''}`
  );

  return `---

## Day context (${day})
### All chats
${chatSummaries.join('\n\n')}

### Task ledger
${taskLines.join('\n') || '(no tasks)'}

### Prior persona
${getPersona(userId)}
`;
}

function buildFallback(userId: string): string {
  const tasks = getTasks(userId);
  const byProject: Record<string, number> = {};
  let overrunRatio: number | null = null;
  const ratios: number[] = [];

  for (const t of tasks) {
    if (t.project) byProject[t.project] = (byProject[t.project] || 0) + 1;
    if (t.estimatedMinutes && t.actualMinutes) {
      ratios.push(t.actualMinutes / t.estimatedMinutes);
    }
  }
  if (ratios.length) {
    overrunRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  }

  const topProjects = Object.entries(byProject)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([p, n]) => `${p} (${n} tasks)`);

  return `
Generated: ${nowIso()}

## Behaviour snapshot
- Total tasks recorded: ${tasks.length}
- Active (not done/deferred): ${tasks.filter((t) => t.state !== 'done' && t.state !== 'deferred').length}
- Blocked: ${tasks.filter((t) => t.isBlocked).length}
- Projects: ${topProjects.join(', ') || 'none yet'}

## Effort calibration
- Measured tasks with estimate+actual: ${ratios.length}
- Average overrun ratio (actual/estimate): ${overrunRatio === null ? 'unknown yet' : overrunRatio.toFixed(2) + 'x'}
  (When estimating, assume tasks take roughly this much longer than the raw estimate.)

## Notes
- Persona is fallback-generated (no live agent available at build time).
- Refs: Kahneman planning fallacy (use outside view), Parkinsons law (tight deadlines),
  Newport (protect deep work), Perlow (leave slack ~20-25%).
`.trim();
}

function extractText(data: any): string {
  const parts = data?.parts ?? [];
  if (Array.isArray(parts)) {
    const t = parts.filter((p: any) => p?.type === 'text').map((p: any) => p.text ?? '').join('\n');
    if (t) return t;
  }
  return '';
}
