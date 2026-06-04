import { GoogleLogoIcon } from "@phosphor-icons/react/dist/ssr"
import type { Metadata } from "next"
import { cache } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { joinCampaignAction } from "@/lib/actions/join-campaign"
import { auth } from "@/lib/auth"
import { signInWithGoogleRedirect } from "@/lib/auth/actions"
import {
  isCampaignMember,
  loadCampaignByJoinToken,
} from "@/lib/db/queries/load-campaign"
import type { CampaignRow } from "@/lib/db/schema/campaign"

interface PageProps {
  params: Promise<{ token: string }>
}

/**
 * The campaign behind the join token, memoized per request so `generateMetadata`
 * and the page resolve it once. `null` means the token is unknown or rotated —
 * the page renders the "link no longer valid" state, never a 404, so a stranger
 * with a stale link gets a clear message instead of a crash.
 */
const getCampaignByToken = cache(
  async (token: string): Promise<CampaignRow | null> =>
    loadCampaignByJoinToken(token)
)

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params
  const campaign = await getCampaignByToken(token)

  return {
    title: campaign
      ? `Join ${campaign.name} — Unnamed System`
      : "Join — Unnamed System",
  }
}

/**
 * The public join page at `/join/{token}` (UNN-327). A DM shares the link; a
 * player opens it and either signs in (returning here via the OAuth round-trip)
 * or, when signed in, joins the campaign with one click. The whole surface is
 * signed-out-visible so the sign-in prompt is meaningful at this URL.
 *
 * Five states: an unknown/rotated token, a signed-out viewer, the campaign's own
 * DM, an existing member, and a signed-in non-member who can join. The two CTAs
 * are server-action `<form>`s (no client JS, mirroring {@link SignInButton}),
 * each bound to the token so it survives the round-trip.
 */
export default async function JoinPage({ params }: PageProps) {
  const { token } = await params
  const campaign = await getCampaignByToken(token)

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
      {campaign ? (
        <CampaignJoinCard token={token} campaign={campaign} />
      ) : (
        <StaleLinkCard />
      )}
    </main>
  )
}

function StaleLinkCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>This link is no longer valid</CardTitle>
        <CardDescription>Ask your DM for a new invite link.</CardDescription>
      </CardHeader>
    </Card>
  )
}

async function CampaignJoinCard({
  token,
  campaign,
}: {
  token: string
  campaign: CampaignRow
}) {
  const session = await auth()
  const viewerId = session?.user?.id

  if (!viewerId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{campaign.name}</CardTitle>
          <CardDescription>Sign in to join this campaign.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signInWithGoogleRedirect.bind(null, `/join/${token}`)}>
            <Button type="submit" className="w-full">
              <GoogleLogoIcon weight="bold" />
              Sign in with Google to join
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  if (campaign.dmUserId === viewerId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{campaign.name}</CardTitle>
          <CardDescription>
            You&apos;re the DM of this campaign.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (await isCampaignMember(campaign.id, viewerId)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{campaign.name}</CardTitle>
          <CardDescription>
            You&apos;re already in this campaign.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{campaign.name}</CardTitle>
        <CardDescription>
          You&apos;ve been invited to join this campaign.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={joinCampaignAction.bind(null, token)}>
          <Button type="submit" className="w-full">
            Join campaign
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
