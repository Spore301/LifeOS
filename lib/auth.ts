import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { setCalendarTokens } from './store/calendarTokens';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || 'placeholder-client-id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'placeholder-client-secret',
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET || 'lifeos-secret-placeholder-minimum-32-chars',
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : 0;

        // Persist the Google credentials so the (server-side) OpenCode agent can
        // write to the user's calendar even though its tool calls have no session
        // cookie. Keyed by the same identifier the API layer resolves to (email).
        const key = (token.email || account.providerAccountId) as string;
        if (key) {
          try {
            setCalendarTokens(key, {
              accessToken: account.access_token || '',
              refreshToken: account.refresh_token,
              expiresAt: account.expires_at ? account.expires_at * 1000 : undefined,
              scope: (account as any).scope,
            });
          } catch (e) {
            console.error('Failed to persist calendar tokens:', e);
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      return session;
    },
  },
};
