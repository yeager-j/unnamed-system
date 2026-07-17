import type { ReactNode } from "react"

import { StageLibraryShell } from "@/app/stage/_components/stage-library-shell"

export default function StageLibraryLayout({
  children,
}: {
  children: ReactNode
}) {
  return <StageLibraryShell>{children}</StageLibraryShell>
}
