import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk';
import { SYSTEM_PROMPT, SESSION_RESUME_PROMPT } from './prompts';
import { chatDir, ensureDir, writeText, readText } from '../store/paths';
import { getPersona } from '../store/persona';
import { formatInZone, getTimeZone } from '../timezone';
import { issueAgentToken } from '../store/agentTokens';

/**
 * Thin, resilient wrapper around the OpenCode SDK server.
 *
 * Model/provider are configurable; default to the configured "big pickle" free model.
 * The OpenCode server is a single `opencode serve` process; each LifeOS chat maps to
 * one OpenCode session whose working directory is the user's per-chat folder.
 */

const OPENCODE_BASE_URL =
  process.env.OPENCODE_BASE_URL || 'http://127.0.0.1:4096';

// Base URL the OPENCODE AGENT uses to reach the LifeOS REST API. The agent runs in
// its own container, where "localhost" is NOT the Next.js app - compose sets this to
// the compose service name (http://lifeos:3000). Defaults to localhost for bare-metal dev.
const API_BASE_URL = process.env.LIFEOS_API_BASE_URL || 'http://localhost:3000';

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
  existingSessionId?: string,
  existingSessionDirectory?: string
): Promise<ChatSessionInfo> {
  const client = getClient();
  const dir = chatDir(userId, chatId);
  ensureDir(dir);

  // Always (re)write AGENTS.md so the system prompt is current.
  writeAgentsMd(userId, dir);

  // Resume only when the session was created against the directory we are still
  // using. A session bound to a path that has since moved (or is no longer mounted
  // in the agent container) resolves fine but fails on every prompt, so treat a
  // mismatch as "no session" and make a fresh one rather than 502 on every message.
  // Strict equality on purpose: a record with no directory predates this tracking, so
  // its session may be bound to the old layout. Recreate once, then it is recorded.
  const directoryUnchanged = existingSessionDirectory === dir;
  if (existingSessionId && directoryUnchanged) {
    // Best-effort resume; if the server does not know the id, fall through to create.
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
 * Build the per-message context the agent needs: who the user is, what time it is
 * for them, and how to call the backend as themselves. Shared by the blocking and
 * streaming paths so the two can never drift apart.
 */
function buildPrompt(
  userId: string,
  chatId: string,
  userText: string,
  opts: { resume?: boolean }
): string {
  const tz = getTimeZone();
  const now = new Date();
  // Both forms: the local wall clock is what the user thinks in, the ISO instant
  // is what the API speaks. Giving only the UTC one invited "it is 00:47" mistakes.
  let preamble = `[LifeOS context] Now: ${formatInZone(now, tz)} ${tz} (ISO instant ${now.toISOString()})\n`;
  preamble += `Timezone: ${tz}. State EVERY time you show the user in that zone, and name it.\n\n`;
  preamble += `User persona (read it fully):\n${getPersona(userId)}\n\n`;
  preamble += `Your LifeOS user id (identity): ${userId}\n`;
  preamble += `LifeOS backend API base URL: ${API_BASE_URL}\n`;
  preamble += `Call every /api/... route against THAT base URL exactly as given. Do not substitute localhost: you run in a different container from the API, so localhost is not the LifeOS app.\n`;
  preamble += `On EVERY /api request you MUST send these headers, or the backend rejects you (401) or falls back to a stub user with no calendar:\n`;
  preamble += `  X-LifeOS-User: ${userId}\n`;
  preamble += `  X-LifeOS-Agent: ${issueAgentToken(userId, chatId)}\n`;
  preamble += `That agent token authorises YOUR account only and expires daily. Send it in request headers only; never print it or write it to a file.\n`;
  preamble += `\n`;

  if (opts.resume) {
    preamble += `${SESSION_RESUME_PROMPT}\n\n`;
  }

  return `${preamble}---\nUser message:\n${userText}`;
}

function promptBody(fullText: string) {
  return {
    parts: [{ type: 'text' as const, text: fullText, synthetic: false }],
    model: { providerID: PROVIDER_ID, modelID: MODEL_ID },
    system: SYSTEM_PROMPT,
  };
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

  const res: any = await client.session.prompt({
    path: { id: sessionId },
    body: promptBody(buildPrompt(userId, chatId, userText, opts)),
    throwOnError: true,
  });

  return { reply: extractReplyText(res), sessionId };
}

// Hard ceiling on a single agent run, so a stalled stream cannot hold a request
// (and the browser's spinner) open indefinitely.
const RUN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Parse an SSE body into decoded event objects.
 * Frames are separated by a blank line and can be split across chunks, so the
 * partial tail is carried over until its terminator arrives.
 */
async function* readSseEvents(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal
): AsyncGenerator<any> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';

      for (const frame of frames) {
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          try {
            yield JSON.parse(raw);
          } catch {
            // Ignore keep-alives and anything that is not a JSON event.
          }
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // stream already torn down
    }
  }
}

/** What the UI is told while a run is in flight. */
export type AgentStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'step'; id: string; tool: string; title?: string; status: string }
  | { type: 'done'; reply: string }
  | { type: 'error'; message: string };

/** Human label for a tool call, so the UI can say what the agent is doing. */
function stepTitle(tool: string, state: any): string | undefined {
  if (state?.title) return String(state.title);
  const input = state?.input || {};
  if (typeof input.url === 'string') return input.url.replace(/^https?:\/\/[^/]+/, '');
  if (typeof input.command === 'string') return String(input.command).slice(0, 80);
  if (typeof input.filePath === 'string') return String(input.filePath);
  return undefined;
}

/**
 * Run a prompt and report progress as it happens.
 *
 * `session.prompt` blocks until the whole run finishes - every tool call, every
 * model turn - so the UI could show nothing at all until the end. Here we start
 * the run with `promptAsync` and follow the server's event stream instead,
 * forwarding text deltas and tool steps as they occur.
 *
 * Returns the assembled reply text once the session goes idle.
 */
export async function streamChatMessage(
  userId: string,
  chatId: string,
  sessionId: string,
  directory: string,
  userText: string,
  opts: { resume?: boolean; signal?: AbortSignal } = {},
  onEvent: (event: AgentStreamEvent) => void = () => {}
): Promise<string> {
  const client = getClient();

  // Subscribe BEFORE prompting, or a fast first token can land before we listen.
  //
  // Two things this has to get right:
  //  - The SDK's event.subscribe() does not route through the custom fetch that
  //    adds the server's Basic auth header, so it 401s and retries forever.
  //  - The event stream is scoped per directory. Without ?directory= the server
  //    sends only heartbeats and the run appears to hang forever.
  const abort = new AbortController();

  // Giving up on the event stream is NOT the same as stopping the run. opencode
  // handles prompts serially per session, so a run left going holds that session
  // busy and every later message in the chat queues behind it forever - the chat
  // appears stuck on "Thinking...". Always stop the run when we stop listening.
  let stopped = false;
  const stopRun = (reason: string) => {
    if (stopped) return;
    stopped = true;
    abort.abort();
    abortSession(sessionId).catch(() => {
      console.error(`Failed to abort opencode run for ${sessionId} after ${reason}`);
    });
  };

  const timeout = setTimeout(() => stopRun('run timeout'), RUN_TIMEOUT_MS);
  // A browser that navigated away should not leave its chat wedged either.
  opts.signal?.addEventListener('abort', () => stopRun('client disconnect'));

  const eventUrl = `${OPENCODE_BASE_URL}/event?directory=${encodeURIComponent(directory)}`;
  const eventRes = await fetch(eventUrl, {
    headers: SERVER_AUTH_TOKEN ? { Authorization: SERVER_AUTH_TOKEN } : {},
    signal: abort.signal,
  });
  if (!eventRes.ok || !eventRes.body) {
    clearTimeout(timeout);
    throw new Error(`OpenCode event stream unavailable (${eventRes.status})`);
  }

  await client.session.promptAsync({
    path: { id: sessionId },
    body: promptBody(buildPrompt(userId, chatId, userText, opts)),
    throwOnError: true,
  });

  // Text parts arrive cumulatively; keep what we have seen per part so we can emit
  // just the new suffix when the server does not hand us an explicit delta.
  const seenText = new Map<string, string>();
  const reportedSteps = new Map<string, string>();
  // The server emits part updates for the USER message too - which is our whole
  // preamble. Track message roles so only assistant text ever reaches the user.
  const roleByMessage = new Map<string, string>();
  let assembled = '';

  for await (const event of readSseEvents(eventRes.body, abort.signal)) {
    const props = event?.properties || {};

    if (event?.type === 'session.error' && props.sessionID === sessionId) {
      const message = props.error?.data?.message || props.error?.name || 'Agent run failed';
      onEvent({ type: 'error', message: String(message) });
      throw new Error(String(message));
    }

    if (event?.type === 'session.idle' && props.sessionID === sessionId) {
      break;
    }

    if (event?.type === 'message.updated' && props.info?.id) {
      roleByMessage.set(props.info.id, props.info.role);
      continue;
    }

    if (event?.type !== 'message.part.updated') continue;

    const part = props.part;
    if (!part || part.sessionID !== sessionId) continue;

    // Anything not yet known to be the assistant's is withheld: an unknown role is
    // far more likely to be our own prompt than a reply worth showing.
    const isAssistant = roleByMessage.get(part.messageID) === 'assistant';

    if (part.type === 'text' && !part.synthetic && isAssistant) {
      const full = typeof part.text === 'string' ? part.text : '';
      const previous = seenText.get(part.id) ?? '';
      const delta = typeof props.delta === 'string' && props.delta
        ? props.delta
        : full.slice(previous.length);
      seenText.set(part.id, full);
      if (delta) {
        assembled += delta;
        onEvent({ type: 'text', delta });
      }
      continue;
    }

    // Reasoning is the model's private thinking and must never reach the user.
    if (part.type === 'tool') {
      const status = part.state?.status || 'pending';
      // Only report real transitions, not every incremental update of one call.
      if (reportedSteps.get(part.id) === status) continue;
      reportedSteps.set(part.id, status);
      onEvent({
        type: 'step',
        id: part.id,
        tool: part.tool || 'tool',
        title: stepTitle(part.tool, part.state),
        status,
      });
    }
  }

  clearTimeout(timeout);

  // If role events never arrived we will have withheld everything, so read the
  // finished reply back rather than showing the user nothing.
  let reply = assembled.trim();
  if (!reply) {
    reply = await lastAssistantText(sessionId);
  }

  onEvent({ type: 'done', reply });
  return reply;
}

/**
 * Read the final assistant text straight from the session, as a fallback for the
 * streaming path when no assistant text was captured live.
 */
async function lastAssistantText(sessionId: string): Promise<string> {
  try {
    const messages = await listSessionMessages(sessionId);
    for (let i = messages.length - 1; i >= 0; i--) {
      const entry: any = messages[i];
      if (entry?.info?.role !== 'assistant') continue;
      const text = (entry.parts || [])
        .filter((p: any) => p?.type === 'text' && !p.synthetic)
        .map((p: any) => (p.text ?? '').trim())
        .filter(Boolean)
        .join('\n\n');
      if (text) return text;
    }
  } catch {
    // fall through to the placeholder
  }
  return '(no text reply)';
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
 *
 * `reasoning` parts are the model's private chain-of-thought and must never be
 * shown to the user — they are only used as a last resort if the model produced
 * no visible text at all, so the chat doesn't render an empty bubble.
 */
function extractReplyText(res: any): string {
  const info = res?.data?.info ?? res?.data;
  const parts: any[] = res?.data?.parts ?? info?.parts ?? [];
  const list = Array.isArray(parts) ? parts : [];

  const pick = (type: string) =>
    list
      .filter((p: any) => p && p.type === type && !p.synthetic)
      .map((p: any) => (p.text ?? '').trim())
      .filter(Boolean);

  const texts = pick('text');
  if (texts.length) return texts.join('\n\n');
  if (typeof info?.content === 'string' && info.content.trim()) return info.content;
  if (typeof info?.message === 'string' && info.message.trim()) return info.message;

  const reasoning = pick('reasoning');
  if (reasoning.length) return reasoning.join('\n\n');
  return '(no text reply)';
}

// The workspace is shared ground for every chat container-side, so AGENTS.md carries
// only the generic system prompt. The persona is per-user and goes in the per-message
// preamble instead, where it never touches disk in an agent-readable location.
function writeAgentsMd(userId: string, dir: string): void {
  const existing = readText(`${dir}/AGENTS.md`, '');
  // Refuse to overwrite any hand-authored customisations, but seed if absent.
  if (existing.trim()) return;
  writeText(`${dir}/AGENTS.md`, SYSTEM_PROMPT);
}
