import { ImageResponse } from "next/og"

import { loadCharacterRowByShortId } from "@/lib/db/load-character"

/**
 * The `/c/{shortId}` OpenGraph image. Uses the character's portrait when one
 * is set; otherwise renders a branded fallback card (also used when the
 * shortId is unknown). File-convention route — Next injects the `og:image`
 * meta automatically, so `generateMetadata` does not set it.
 */

export const alt = "Unnamed System character sheet"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

interface OgProps {
  params: Promise<{ shortId: string }>
}

const BACKGROUND = "#0b0b0f"
const FOREGROUND = "#fafafa"
const MUTED = "#a1a1aa"

function FallbackCard({ name }: { name: string | null }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "80px",
        background: BACKGROUND,
        color: FOREGROUND,
        fontFamily: "monospace",
      }}
    >
      <div style={{ fontSize: 32, color: MUTED }}>Unnamed System</div>
      <div style={{ fontSize: name ? 84 : 64, fontWeight: 700 }}>
        {name ?? "Character not found"}
      </div>
      <div style={{ fontSize: 28, color: MUTED }}>Character sheet</div>
    </div>
  )
}

export default async function OpenGraphImage({ params }: OgProps) {
  const { shortId } = await params
  const character = await loadCharacterRowByShortId(shortId)

  const element = character?.portraitUrl ? (
    <img
      src={character.portraitUrl}
      alt=""
      width={size.width}
      height={size.height}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  ) : (
    <FallbackCard name={character?.name ?? null} />
  )

  return new ImageResponse(element, size)
}
