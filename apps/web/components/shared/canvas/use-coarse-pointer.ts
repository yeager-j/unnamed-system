import { useEffect, useState } from "react"

/**
 * Whether the primary pointer is **coarse** (touch) — `(pointer: coarse)`. The map
 * editor uses this to fork its React Flow gesture config (Dungeon Visual Overhaul
 * §D1): with `selectionOnDrag` on, React Flow captures the primary touch pointer as
 * box selection and `panOnDrag={[1]}` has no touch equivalent, so a touch editor
 * would be unpannable — on coarse pointers it flips to pan-first (`panOnDrag`, no
 * box selection). Starts `false` (SSR + first paint), resolving after mount.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)")
    const update = () => setCoarse(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return coarse
}
