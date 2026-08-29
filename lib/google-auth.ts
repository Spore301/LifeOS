import { getCalendarTokens, setCalendarTokens, CalendarTokenBundle } from './store/calendarTokens';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Resolve a usable Google access token for a user from persisted credentials,
 * refreshing it via the refresh token when it is near expiry.
 */
export async function getAccessToken(userId: string): Promise<string> {
  const bundle = getCalendarTokens(userId);
  if (!bundle?.accessToken) return '';

  // If we have a refresh token and the access token is near/over expiry, refresh.
  if (bundle.refreshToken) {
    const needsRefresh = !bundle.expiresAt || Date.now() > bundle.expiresAt - 60_000;
    if (needsRefresh) {
      const refreshed = await refreshAccessToken(bundle.refreshToken, bundle);
      if (refreshed) {
        setCalendarTokens(userId, {
          ...bundle,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || bundle.refreshToken,
          expiresAt: refreshed.expiresAt,
        });
        return refreshed.accessToken;
      }
    }
  }

  return bundle.accessToken;
}

interface RefreshResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

/**
 * Exchange a Google refresh token for a fresh access token.
 * Returns null if refresh fails.
 */
export async function refreshAccessToken(
  refreshToken: string,
  bundle: CalendarTokenBundle
): Promise<RefreshResult | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      console.error('Google token refresh failed:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      // Google may rotate the refresh token; adopt a new one if provided.
      refreshToken: data.refresh_token || undefined,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
  } catch (err) {
    console.error('Google token refresh error:', err);
    return null;
  }
}
