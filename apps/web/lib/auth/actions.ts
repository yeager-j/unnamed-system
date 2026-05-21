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
 * Ends the current database-backed session (deletes the `session` row, clears
 * the cookie) and returns the user to the home page.
 */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" })
}
