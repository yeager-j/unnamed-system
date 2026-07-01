import * as React from "react"
import { toast } from "sonner"

import { Toaster } from "@workspace/ui/components/sonner"

export function Default() {
  React.useEffect(() => {
    toast.success("Skill cast", {
      description:
        "Rell landed Rending Overture — 14 damage to The Choirmaster.",
      duration: Infinity,
    })
  }, [])

  return <Toaster position="top-center" />
}
