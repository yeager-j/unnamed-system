import * as React from "react"

/**
 * Returns `value` while it is present, otherwise the last present value it saw.
 *
 * Lets a controlled dialog keep its body populated through the close animation
 * when that body is derived from a selection that clears on close. Drive `open`
 * off the live selection (`open={item !== null}`) but render the body from this
 * retained value (`{shown && <Body item={shown} />}`); the selection is the
 * single source of truth, and the retained copy only outlives it for the ~200ms
 * the underlying Sheet/Drawer needs to transition out. Once closed, both
 * libraries unmount the portal regardless of what we pass, so holding the stale
 * value is inert.
 */
export function useLastPresent<T>(value: T | null | undefined): T | null {
  const lastPresent = React.useRef<T | null>(null)
  if (value != null) {
    lastPresent.current = value
  }
  return value ?? lastPresent.current
}
