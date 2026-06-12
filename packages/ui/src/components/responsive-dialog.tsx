"use client"

import * as React from "react"

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/drawer"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"

/**
 * A dialog surface that adapts to the viewport: a bottom {@link Drawer} (Vaul)
 * on mobile — where swipe-to-dismiss and a full-width sheet are the native
 * ergonomics — and a right-side {@link Sheet} (Base UI) on desktop, where
 * Vaul's drawers are known to misbehave.
 *
 * Compose the body with the matching `ResponsiveDialog*` sub-parts; each one
 * delegates to the Sheet or Drawer variant via context, normalizing the two
 * libraries' diverging APIs (Base UI's `render` / `initialFocus` vs Vaul's
 * `asChild` / `onOpenAutoFocus`). Works controlled (`open` / `onOpenChange`) or
 * trigger-driven ({@link ResponsiveDialogTrigger}).
 *
 * When the body is derived from a selection that clears on close
 * (`open={item !== null}` + `{item && <Body item={item} />}`), gating the body
 * on that same value unmounts it the instant `open` flips to false, killing the
 * exit animation. Render the body from {@link useLastPresent}'s retained value
 * instead so the panel survives the close transition.
 */

const ResponsiveDialogContext = React.createContext<boolean | null>(null)

function useResponsiveDialogIsMobile(): boolean {
  const isMobile = React.useContext(ResponsiveDialogContext)
  if (isMobile === null) {
    throw new Error(
      "ResponsiveDialog.* must be used within a <ResponsiveDialog>"
    )
  }
  return isMobile
}

function ResponsiveDialog({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}) {
  const isMobile = useIsMobile()
  return (
    <ResponsiveDialogContext.Provider value={isMobile}>
      {isMobile ? (
        <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
          {children}
        </Drawer>
      ) : (
        <Sheet open={open} onOpenChange={onOpenChange}>
          {children}
        </Sheet>
      )}
    </ResponsiveDialogContext.Provider>
  )
}

/** Opens the dialog. Wraps a single focusable child (e.g. a Button), bridging
 *  Vaul's `asChild` and Base UI's `render` composition props. */
function ResponsiveDialogTrigger({
  children,
}: {
  children: React.ReactElement
}) {
  const isMobile = useResponsiveDialogIsMobile()
  return isMobile ? (
    <DrawerTrigger asChild>{children}</DrawerTrigger>
  ) : (
    <SheetTrigger render={children} />
  )
}

/**
 * The surface. `className` styles the desktop Sheet panel (e.g. a
 * `data-[side=right]:sm:max-w-2xl` width override) and is harmless on the
 * mobile Drawer, which is a full-width bottom sheet. `initialFocusRef` moves
 * focus to a chosen element on open — use it when the default (first tabbable)
 * would scroll a long body to a focusable footer control.
 */
function ResponsiveDialogContent({
  className,
  initialFocusRef,
  children,
}: {
  className?: string
  initialFocusRef?: React.RefObject<HTMLElement | null>
  children: React.ReactNode
}) {
  const isMobile = useResponsiveDialogIsMobile()
  if (isMobile) {
    return (
      <DrawerContent
        className={className}
        onOpenAutoFocus={
          initialFocusRef
            ? (event) => {
                event.preventDefault()
                initialFocusRef.current?.focus()
              }
            : undefined
        }
      >
        {children}
      </DrawerContent>
    )
  }
  return (
    <SheetContent className={className} initialFocus={initialFocusRef}>
      {children}
    </SheetContent>
  )
}

function ResponsiveDialogHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const isMobile = useResponsiveDialogIsMobile()
  return isMobile ? (
    <DrawerHeader className={className} {...props}>
      {children}
    </DrawerHeader>
  ) : (
    <SheetHeader className={className} {...props}>
      {children}
    </SheetHeader>
  )
}

function ResponsiveDialogFooter({
  className,
  children,
}: React.ComponentProps<"div">) {
  const isMobile = useResponsiveDialogIsMobile()
  return isMobile ? (
    <DrawerFooter className={className}>{children}</DrawerFooter>
  ) : (
    <SheetFooter className={className}>{children}</SheetFooter>
  )
}

function ResponsiveDialogTitle({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const isMobile = useResponsiveDialogIsMobile()
  return isMobile ? (
    <DrawerTitle className={className}>{children}</DrawerTitle>
  ) : (
    <SheetTitle className={className}>{children}</SheetTitle>
  )
}

function ResponsiveDialogDescription({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const isMobile = useResponsiveDialogIsMobile()
  return isMobile ? (
    <DrawerDescription className={className}>{children}</DrawerDescription>
  ) : (
    <SheetDescription className={className}>{children}</SheetDescription>
  )
}

export {
  ResponsiveDialog,
  ResponsiveDialogTrigger,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
}
