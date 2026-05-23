import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"

import { SignInButton } from "@/components/shell/sign-in-button"

/**
 * The signed-out home view. Per UNN-177, the minimum bar is "doesn't error
 * and offers a path forward" — a marketing landing is out of scope. Reuses
 * shadcn's `Empty` primitive so the "you need to sign in" panel sits in the
 * same visual language as the signed-in-but-no-characters case.
 */
export function SignedOutLanding() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>Sign in to manage your characters</EmptyTitle>
        <EmptyDescription>
          Your roster, sheets, and Sparks all live behind a Google sign-in.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <SignInButton />
      </EmptyContent>
    </Empty>
  )
}
