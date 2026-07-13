"use client"

import dynamic from "next/dynamic"
import { useState } from "react"

import { Prose } from "@/components/shared/prose"

import "@workspace/editor/styles.css"

/**
 * Throwaway smoke route for UNN-619 (P0): confirms the vendored
 * `@workspace/editor` mounts and edits live inside apps/web. No first-party
 * surface consumes the editor yet — delete this route once P1 lands a real one.
 *
 * CM6 touches `document` at init, so the editor is mounted client-only via
 * `next/dynamic` (`ssr: false`) — the moral equivalent of TipTap's
 * `immediatelyRender: false` (design §5.1, the A4 client-only-mount spike).
 */
const AtomicCodeMirrorEditor = dynamic(
  () => import("@workspace/editor").then((m) => m.AtomicCodeMirrorEditor),
  { ssr: false }
)

const INITIAL_MARKDOWN = `# Atomic editor smoke test

This dummy route confirms **@workspace/editor** mounts in \`apps/web\`.

- live inline preview
- [ ] a task item
- [x] a done item
- a wiki link: [[npc:n1|Maren]]

| feature | works? |
| ------- | ------ |
| tables  | yes    |
| lists   | yes    |

\`\`\`ts
const answer = 42
\`\`\`
`

export default function EditorSmokeTestPage() {
  const [markdown, setMarkdown] = useState(INITIAL_MARKDOWN)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-8">
      <h1 className="text-lg font-semibold">@workspace/editor smoke test</h1>
      <div className="w-full rounded-md border border-border bg-card p-8">
        <AtomicCodeMirrorEditor
          markdownSource={INITIAL_MARKDOWN}
          onMarkdownChange={setMarkdown}
        />
      </div>
      <div>
        <p className="mb-1 text-sm text-muted-foreground">
          Read-only render (Prose) — headings should match the editor:
        </p>
        <div className="rounded-md border border-border p-3">
          <Prose>{markdown}</Prose>
        </div>
      </div>
      <div>
        <p className="mb-1 text-sm text-muted-foreground">
          Live markdown (source of truth after mount):
        </p>
        <pre className="rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
          {markdown}
        </pre>
      </div>
    </div>
  )
}
