import type { Viewer } from "./relationship"

declare const trustedViewerBrand: unique symbol

/**
 * A {@link Viewer} that provably crossed the trust boundary (UNN-530) — every
 * field **server-derived** from the authenticated session, never taken from
 * client input (see the TRUST BOUNDARY note on {@link Viewer}).
 *
 * The brand is a **provenance marker, not auth machinery**: it carries no data
 * and the engine never learns what a session or campaign is. It exists so the
 * projection surfaces ({@link import("./snapshot").projectEncounterSnapshot},
 * {@link import("./spatial-snapshot").projectSpatialEncounterSnapshot},
 * {@link import("./visible-entity").visibleEntity}) can demand evidence that
 * derivation happened: an object literal cannot satisfy this type, so a viewer
 * built from a client-supplied relationship claim is a compile error, not a
 * review catch.
 *
 * **The only production mint is `deriveViewer`** (`apps/web/lib/auth/derive-viewer.ts`,
 * a server-only module) — the single sanctioned `as TrustedViewer` cast. Engine
 * tests mint through the `__fixtures__/viewer.ts` cast helper; nothing else may
 * assert the brand.
 */
export interface TrustedViewer extends Viewer {
  readonly [trustedViewerBrand]: never
}
