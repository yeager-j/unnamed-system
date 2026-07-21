"use client"

import { ArrowLeftIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"
import {
  Sidebar,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@workspace/ui/components/sidebar"

import { AnimusDocumentProvider } from "@/components/animus/animus-context"
import { WriterPane } from "@/components/animus/writer-pane"
import { WriterSidebar } from "@/components/animus/writer-sidebar"
import type { DocumentRef } from "@/domain/character/animus/documents"
import type { CharacterMount } from "@/domain/character/load"
import { EntityWriteProvider } from "@/domain/entity/use-entity-write"
import { characterPath } from "@/lib/paths"

/**
 * The sheet's Animus writer shell: the same sidebar+pane chrome the builder
 * mounts (`builder-provider-shell.tsx`), but on a standalone owner-only route.
 * `SidebarProvider` is locked open — the rail IS the navigation, so there is no
 * desktop collapse affordance, and the mobile drawer rides the separate
 * `openMobile` channel via the pane's `SidebarTrigger`. `initialRef` seeds the
 * active document from the `?doc=` deep link so a click on a read-only section
 * opens straight to it. Notes is included here (sheet-only); the builder omits it.
 */
export function AnimusWriterShell({
  shortId,
  character,
  initialRef,
}: {
  shortId: string
  character: CharacterMount
  initialRef: DocumentRef
}) {
  return (
    <AnimusDocumentProvider initialRef={initialRef}>
      <EntityWriteProvider profile={character.profile} canon={character.canon}>
        <SidebarProvider
          open
          onOpenChange={() => {}}
          className="min-h-[calc(100svh-3.5rem)]"
        >
          <Sidebar
            variant="floating"
            className="top-14 h-[calc(100svh-3.5rem)]"
          >
            <WriterSidebar
              includeNotes
              header={<SheetWriterHeader shortId={shortId} />}
            />
          </Sidebar>
          <SidebarInset className="h-[calc(100svh-3.5rem)]">
            <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-5 py-6">
              <WriterPane />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </EntityWriteProvider>
    </AnimusDocumentProvider>
  )
}

/**
 * The rail's header slot: a "Back to sheet" control (returns to the exact tab
 * the player came from via history, falling back to the sheet root on a cold
 * deep link) over the section title.
 */
function SheetWriterHeader({ shortId }: { shortId: string }) {
  const router = useRouter()

  function backToSheet() {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push(characterPath(shortId))
    }
  }

  return (
    <SidebarHeader className="gap-3 px-4 pt-6 pb-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={backToSheet}
        className="-ml-2 self-start text-sidebar-foreground/70 hover:text-sidebar-foreground"
      >
        <ArrowLeftIcon weight="bold" />
        Back to sheet
      </Button>
      <h1 className="font-display text-3xl font-semibold text-sidebar-foreground">
        Your Story
      </h1>
      <p className="font-heading text-sm text-sidebar-foreground/70 italic">
        Backstory, Knives, Chains, Identity Traits, and Notes.
      </p>
    </SidebarHeader>
  )
}
