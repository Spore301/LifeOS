import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';
import { authOptions } from './auth';
import { verifyAgentToken } from './store/agentTokens';

/**
 * Resolve the acting user id for an API request.
 * Priority:
 *  1. A valid NextAuth session (web UI).
 *  2. The LifeOS admin/dev header (used by the local OpenCode agent tools).
 * Falls back to a dev user id in local POC mode.
 */
export async function resolveUserId(req: NextRequest): Promise<string | null> {
  // 1. Web session
  try {
    const session: any = await getServerSession(authOptions);
    if (session?.user?.id) return session.user.id;
    if (session?.user?.email) return session.user.email;
  } catch {
    // next-auth not configured -> fall through
  }

  // 3. Dev/admin header (operator tooling; NOT given to the agent) (used by the OpenCode agent's server-to-server tool calls).
  //    In local dev we trust the X-LifeOS-User header so an authenticated agent call
  //    resolves to the real (signed-in) user and their stored Google token.
  // 2. Scoped agent session token. Resolves to exactly one user - this is what the
  //    OpenCode agent carries, so a prompt injection cannot escalate past its owner.
  const agentUser = req.headers.get('x-lifeos-user');
  const agentToken = req.headers.get('x-lifeos-agent');
  if (agentUser && agentToken && verifyAgentToken(agentUser, agentToken)) {
    return agentUser;
  }

  const headerUser = req.headers.get('x-lifeos-user');
  const devSecret = process.env.LIFEOS_ADMIN_SECRET;
  const headerSecret = req.headers.get('x-lifeos-admin');

  if (process.env.NODE_ENV !== 'production') {
    if (headerUser) return headerUser;
  } else if (headerUser && isUsableAdminSecret(devSecret) && headerSecret === devSecret) {
    return headerUser;
  }

  // 4. Local dev default
  if (process.env.NODE_ENV !== 'production') {
    return process.env.LIFEOS_DEV_USER || 'local-dev-user';
  }

  return null;
}


// Values that must never be accepted as a real credential: an unset secret, or the
// placeholder shipped in docker-compose/.env.example. Without this check a deployment
// that never set the variable would accept the published default and let any caller
// impersonate any user via X-LifeOS-User.
const PLACEHOLDER_SECRETS = new Set(['', 'replace_with_a_long_random_string', 'changeme']);

function isUsableAdminSecret(secret?: string): secret is string {
  if (!secret) return false;
  if (PLACEHOLDER_SECRETS.has(secret)) return false;
  return secret.length >= 24;
}
