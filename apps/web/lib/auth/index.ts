import { DrizzleAdapter } from "@auth/drizzle-adapter"
import NextAuth, { type NextAuthResult } from "next-auth"
import Google from "next-auth/providers/google"

import { accounts, getDb, sessions, users, verificationTokens } from "@/lib/db"

import { getAuthEnv } from "./env"

/**
 * Auth.js v5 configuration. Google OAuth only, database-backed sessions via the
 * Drizzle adapter over the existing `user` / `account` / `session` /
 * `verificationToken` tables.
 *
 * The config is built lazily inside the `NextAuth(() => ...)` factory so env
 * validation runs per-request rather than at module-import time, matching the
 * lazy-cached pattern used by {@link getDbEnv} and {@link getAuthEnv}.
 *
 * Preview deployments on Vercel use `AUTH_REDIRECT_PROXY_URL` to forward OAuth
 * callbacks through production — Google only ever sees the production host as
 * a registered redirect URI, so unique-per-deployment preview URLs work
 * without re-registering each one.
 */
const result: NextAuthResult = NextAuth(() => {
  const env = getAuthEnv()
  return {
    adapter: DrizzleAdapter(getDb(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    session: { strategy: "database" },
    trustHost: true,
    secret: env.AUTH_SECRET,
    redirectProxyUrl: env.AUTH_REDIRECT_PROXY_URL,
    providers: [
      Google({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      }),
    ],
    pages: { signIn: "/" },
  }
})

export const handlers: NextAuthResult["handlers"] = result.handlers
export const auth: NextAuthResult["auth"] = result.auth
export const signIn: NextAuthResult["signIn"] = result.signIn
export const signOut: NextAuthResult["signOut"] = result.signOut
