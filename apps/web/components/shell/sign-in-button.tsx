import { GoogleLogoIcon } from "@phosphor-icons/react/dist/ssr"

import { Button } from "@workspace/ui/components/button"

import { signInWithGoogle } from "@/lib/auth/actions"

/**
 * Signed-out CTA in the site header. A server-component form whose submission
 * invokes the {@link signInWithGoogle} server action — no client JS required
 * for the button itself.
 */
export function SignInButton() {
  return (
    <form action={signInWithGoogle}>
      <Button type="submit" variant="outline" size="sm">
        <GoogleLogoIcon weight="bold" />
        Sign in with Google
      </Button>
    </form>
  )
}
