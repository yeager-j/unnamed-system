import { redirect } from "next/navigation"

import { stageMapsPath } from "@/lib/paths"

export default function StagePage() {
  redirect(stageMapsPath())
}
