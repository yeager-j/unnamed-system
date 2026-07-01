import type { Viewer } from "../relationship"
import type { TrustedViewer } from "../trusted-viewer"

/**
 * **Test-only** mint of a {@link TrustedViewer} — engine tests sit inside the
 * trust boundary, so asserting the brand here is honest. Production code must
 * never import this: the one sanctioned production mint is `deriveViewer`
 * (`apps/web/lib/auth/derive-viewer.ts`, server-only), which derives every
 * field from the authenticated session.
 */
export const asTrustedViewer = (viewer: Viewer): TrustedViewer =>
  viewer as TrustedViewer
