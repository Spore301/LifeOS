import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk';
import { SYSTEM_PROMPT, SESSION_RESUME_PROMPT } from './prompts';
import { chatDir, ensureDir, writeText, readText, nowIso } from '../store/paths';
import { getPersona } from '../store/persona';

/**
 * Thin, resilient wrapper around the OpenCode SDK server.
 *
 * Model/provider are configurable; default to the configured "big pickle" free model.
 * The OpenCode server is a single `opencode serve` process; each LifeOS chat maps to
 * one OpenCode session whose working directory is the user's per-chat folder.
 */

const OPENCODE_BASE_URL =
  process.env.OPENCODE_BASE_URL || 'http://127.0.0.1:4096';

// Model selection. Prefer env, fall back to the LifeOS default ("big pickle").
// Values are documented in .env.example. Example: OPENCODE_PROVIDER=opencode, OPENCODE_MODEL=big-pickle
const PROVIDER_ID = process.env.OPENCODE_PROVIDER || 'opencode';
const MODEL_ID = process.env.OPENCODE_MODEL || 'big-pickle';

// Bearer token for the opencode server when `opencode serve` is password-protected
// (OPENCODE_SERVER_USERNAME / OPENCODE_SERVER_PASSWORD on the server). Falls back
// to nothing, in which case the client connects to an open (unauthenticated) server.
const SERVER_AUTH_TOKEN = basicAuthHeader(
  process.env.OPENCODE_SERVER_USERNAME,
  process.env.OPENCODE_SERVER_PASSWORD
);

function basicAuthHeader(u?: string, p?: string): string | undefined {
  if (!u || !p) return undefined;
  const b64 = Buffer.from(`${u}:${p}`).toString('base64');
  return `Basic ${b64}`;
}

let clientSingleton: OpencodeClient | null = null;

export function getClient(): OpencodeClient {
  if (!clientSingleton) {
    clientSingleton = createOpencodeClient({
      baseUrl: OPENCODE_BASE_URL,
      // Inject the server's Basic auth header on every request so the API works even
      // when opencode serve is password-protected.
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers || {});
        if (SERVER_AUTH_TOKEN) {
          headers.set('Authorization', SERVER_AUTH_TOKEN);
        }
        return fetch(input, { ...init, headers });
      },
    });
  }
  return clientSingleton;
}

export interface ChatSessionInfo {
  sessionId: string;
  directory: string;
}

/**
 * Ensure an OpenCode session exists for (user, chat).
 * If the chat already has a persisted sessionId, reuse it (resume).
 * Otherwise create one whose working directory is the user's per-chat folder,
 * and seed it with AGENTS.md + persona context.
 */
export async function ensureChatSession(
  userId: string,
  chatId: string,
  existingSessionId?: string
): Promise<ChatSessionInfo> {
  const client = getClient();
  const dir = chatDir(userId, chatId);
  ensureDir(dir);

  // Always (re)write AGENTS.md so the system prompt is current.
  writeAgentsMd(userId, dir);

  if (existingSessionId) {
    // Best-effort resume; if the server doesn't know the id, fall through to create.
    try {
      const res = await client.session.get({ path: { id: existingSessionId }, throwOnError: true } as any);
      if (res?.data?.id) {
        return { sessionId: existingSessionId, directory: dir };
      }
    } catch {
      // session gone -> create a new one below
    }
  }

  const created: any = await client.session.create({
    body: { title: `LifeOS chat ${chatId}` },
    query: { directory: dir },
    throwOnError: true,
  });
  const sessionId: string = created?.data?.id;
  if (!sessionId) {
    throw new Error('OpenCode session.create returned no session id');
  }
  return { sessionId, directory: dir };
}

/**
 * Send a user message to the chat's OpenCode session and await the assistant reply.
 * Returns the assistant's text reply.
 */
export async function sendChatMessage(
  userId: string,
  chatId: string,
  sessionId: string,
  userText: string,
  opts: { resume?: boolean } = {}
): Promise<{ reply: string; sessionId: string }> {
  const client = getClient();
  const sessionIdFinal = sessionId;

  let preamble = `[LifeOS context] Date/time now: ${nowIso()}\n\n`;
  preamble += `User persona (read it fully):\n${getPersona(userId)}\n\n`;
  preamble += `Your LifeOS user id (identity): ${userId}\n`;
  preamble += `When you call the LifeOS backend API (any /api/... route), you MUST include the header "X-LifeOS-User: ${userId}" on every request so the backend resolves your real account (and its Google calendar token). Do not rely on a fallback user.\n\n`;

  if (opts.resume) {
    preamble += `${SESSION_RESUME_PROMPT}\n\n`;
  }

  const fullText = `${preamble}---\nUser message:\n${userText}`;

  const part = {
    type: 'text' as const,
    text: fullText,
    synthetic: false,
  };

  const res: any = await client.session.prompt({
    path: { id: sessionIdFinal },
    body: {
      parts: [part],
      model: { providerID: PROVIDER_ID, modelID: MODEL_ID },
      system: SYSTEM_PROMPT,
    },
    throwOnError: true,
  });

  const reply = extractReplyText(res);
  return { reply, sessionId: sessionIdFinal };
}

/**
 * List the assistant/user messages of a session (for history + resume context).
 */
export async function listSessionMessages(sessionId: string): Promise<any[]> {
  const client = getClient();
  const res: any = await client.session.messages({ path: { id: sessionId }, throwOnError: true } as any);
  return res?.data ?? [];
}

export async function abortSession(sessionId: string): Promise<void> {
  try {
    const client = getClient();
    await client.session.abort({ path: { id: sessionId }, throwOnError: true } as any);
  } catch {
    // best effort
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  try {
    const client = getClient();
    await client.session.delete({ path: { id: sessionId }, throwOnError: true } as any);
  } catch {
    // best effort
  }
}

export function isOpenCodeConfigured(): boolean {
  return Boolean(process.env.OPENCODE_BASE_URL || process.env.OPENCODE_PROVIDER || process.env.OPENCODE_MODEL);
}

/**
 * Extract the assistant's textual reply from a session.prompt result.
 * The response shape is an AssistantMessage with parts; we concatenate text parts.
 */
function extractReplyText(res: any): string {
  const info = res?.data?.info ?? res?.data;
  const parts: any[] = res?.data?.parts ?? info?.parts ?? [];
  const texts = (Array.isArray(parts) ? parts : [])
    .filter((p: any) => p && (p.type === 'text' || p.type === 'reasoning'))
    .map((p: any) => p.text ?? '')
    .filter(Boolean);
  if (texts.length) return texts.join('\n');
  if (typeof info?.content === 'string') return info.content;
  if (typeof info?.message === 'string') return info.message;
  return '(no text reply)';
}

function writeAgentsMd(userId: string, dir: string): void {
  const existing = readText(`${dir}/AGENTS.md`, '');
  // Refuse to overwrite any hand-authored customisations, but seed if absent.
  if (existing.trim()) return;
  const persona = getPersona(userId);
  writeText(
    `${dir}/AGENTS.md`,
    `${SYSTEM_PROMPT}

---

## User persona (long-term memory)

${persona}
`
  );
}
