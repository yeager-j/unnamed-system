"use server"

import { signIn, signOut } from "@/lib/auth"

/**
 * Initiates the Google OAuth flow and redirects back to the home page on
 * successful sign-in. Wired to the `<form action={...}>` on the
 * `SignInButton`. Auth.js's `signIn` triggers a `throw redirect()` internally,
 * so the action returns nothing.
 */
export async function signInWithGoogle(): Promise<void> {
  await signIn("google", { redirectTo: "/" })
}

/**
 * Initiates Google OAuth and returns the player to `redirectTo` after consent —
 * the join-link round-trip (UNN-327): bound via `.bind(null, "/join/<token>")`
 * so a brand-new account lands back on the join page instead of the home page.
 * Auth.js threads `redirectTo` through the OAuth `state`, so the per-token URL
 * survives the round-trip. The trailing `_formData` is the `<form>` payload we
 * ignore.
 *
 * As an exported Server Action this can be called with an arbitrary
 * `redirectTo`, so we reject anything that isn't a same-origin **relative** path
 * (must start with a single `/`, never `//` or a scheme) and fall back to `/`.
 * Auth.js's default `redirect` callback already drops off-origin targets, but
 * guarding here is cheap defense-in-depth that doesn't rely on that default.
 */
export async function signInWithGoogleRedirect(
  redirectTo: string,
  _formData?: FormData
): Promise<void> {
  const safeRedirectTo =
    redirectTo.startsWith("/") && !redirectTo.startsWith("//")
      ? redirectTo
      : "/"
  await signIn("google", { redirectTo: safeRedirectTo })
}

/**
 * Ends the current database-backed session (deletes the `session` row, clears
 * the cookie) and returns the user to the home page.
 */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" })
}
