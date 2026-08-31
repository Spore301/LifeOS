import crypto from 'crypto';
import { userSecretsDir, readJson, writeJson, ensureDir, nowIso } from './paths';
import path from 'path';

/**
 * Per-session credentials for the OpenCode agent.
 *
 * The agent used to be handed LIFEOS_ADMIN_SECRET so its server-to-server calls
 * could resolve a real account. That secret authorises impersonation of ANY user,
 * and it sat in the model's prompt context - fine for a single-user box, unsafe
 * the moment a second person uses the app, since a prompt injection can read it
 * back out and escalate.
 *
 * A session token instead resolves to exactly one (userId, chatId). Leaking it
 * grants the holder nothing they did not already have: that user's own data.
 *
 * Tokens live under the secrets root, which the agent container does not mount.
 */

export interface AgentTokenRecord {
  userId: string;
  chatId: string;
  issuedAt: string;
  expiresAt: number; // ms epoch
}

interface TokenLedger {
  tokens: Record<string, AgentTokenRecord>;
}

const TTL_MS = 24 * 60 * 60 * 1000;

function fileFor(userId: string): string {
  return path.join(userSecretsDir(userId), 'agent_tokens.json');
}

function ledger(userId: string): TokenLedger {
  const l = readJson<TokenLedger>(fileFor(userId), { tokens: {} });
  l.tokens = l.tokens || {};
  return l;
}

/**
 * Mint (or reuse) a token for this chat session. Expired entries are pruned on
 * every mint so the ledger does not grow without bound.
 */
export function issueAgentToken(userId: string, chatId: string): string {
  ensureDir(userSecretsDir(userId));
  const l = ledger(userId);
  const now = Date.now();

  for (const [tok, rec] of Object.entries(l.tokens)) {
    if (rec.expiresAt <= now) delete l.tokens[tok];
  }

  const live = Object.entries(l.tokens).find(
    ([, rec]) => rec.chatId === chatId && rec.expiresAt > now + 60_000
  );
  if (live) {
    writeJson(fileFor(userId), l);
    return live[0];
  }

  const token = crypto.randomBytes(32).toString('base64url');
  l.tokens[token] = {
    userId,
    chatId,
    issuedAt: nowIso(),
    expiresAt: now + TTL_MS,
  };
  writeJson(fileFor(userId), l);
  return token;
}

/**
 * Resolve a token back to its owner. The token encodes which user's ledger to
 * look in, so verification does not have to scan every user on the system.
 */
export function verifyAgentToken(userId: string, token: string): AgentTokenRecord | null {
  if (!userId || !token) return null;
  const rec = ledger(userId).tokens[token];
  if (!rec) return null;
  if (rec.expiresAt <= Date.now()) return null;
  if (rec.userId !== userId) return null;
  return rec;
}
