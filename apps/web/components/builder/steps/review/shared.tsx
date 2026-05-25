import { PencilSimpleIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { BUILDER_STEPS } from "../../builder-steps"

/**
 * One review summary card. Each summary section composes this so the
 * "title · description · Edit-to-source-step affordance · body" shape stays
 * uniform across the screen. `editStepSlug` is the slug of the source step
 * the Edit button deep-links back to.
 */
export function ReviewCard({
  title,
  description,
  editStepSlug,
  shortId,
  children,
}: {
  title: string
  description?: string
  editStepSlug: string
  shortId: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={`/builder/${shortId}/${editStepSlug}`}
                aria-label={`Edit ${title} in the ${labelFor(editStepSlug)} step`}
              />
            }
          >
            <PencilSimpleIcon weight="bold" />
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function labelFor(slug: string): string {
  return BUILDER_STEPS.find((step) => step.slug === slug)?.label ?? slug
}

/**
 * Muted "None recorded." line — the same fallback the read-only character-
 * sheet identity/background blocks render for empty fields. Centralized
 * so the Review screen reads the same way the post-finalize sheet will.
 */
export function NoneRecorded() {
  return <p className="text-sm text-muted-foreground">None recorded.</p>
}
