"use client"

import type { RailView } from "@/lib/character/view/rail-view"

import { MechanicWidget } from "../mechanics/mechanic-widget"
import { AttributesBlock } from "./attributes-block"
import { ExhaustionBlock } from "./exhaustion-block"
import { IdentityBlock } from "./identity-block"
import { PrismaBlock } from "./prisma-block"
import { RailControls } from "./rail-controls"
import { VictoriesBlock } from "./victories-block"
import { VitalsBlock } from "./vitals-block"

/**
 * The persistent left rail (design handoff "The Left Rail"): identity →
 * HP/SP → Victories → controls → Attributes → mechanic widget → Prisma →
 * Exhaustion, top to bottom. Pure composition — every block renders one
 * {@link RailView} slice and dispatches through the provider; a `null` slice
 * simply drops its block.
 */
export function SheetRail({ view }: { view: RailView }) {
  return (
    <aside
      aria-label="Character"
      className="flex shrink-0 flex-col gap-5 border-b px-5 py-4 lg:w-[300px] lg:overflow-y-auto lg:border-r lg:border-b-0"
    >
      <IdentityBlock view={view} />
      <VitalsBlock hp={view.hp} sp={view.sp} />
      {view.victories ? <VictoriesBlock view={view.victories} /> : null}
      <RailControls view={view} />
      {view.attributes ? (
        <AttributesBlock attributes={view.attributes} />
      ) : null}
      <MechanicWidget />
      {view.prisma ? <PrismaBlock view={view.prisma} /> : null}
      {view.exhaustion ? <ExhaustionBlock view={view.exhaustion} /> : null}
    </aside>
  )
}
