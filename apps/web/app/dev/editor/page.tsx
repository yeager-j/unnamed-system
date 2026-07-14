import { redirect } from "next/navigation"

/** Keeps the editor smoke URL stable while the P1 harness stays feature-local. */
export default function EditorSmokeTestPage() {
  redirect("/campaigns/scratch/dev/editor")
}
