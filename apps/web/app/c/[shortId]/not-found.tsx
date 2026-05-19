import Link from "next/link"

/**
 * Rendered with a 404 status when `notFound()` fires for an unknown
 * `/c/{shortId}` — i.e. the shortId matches no character.
 */
export default function CharacterNotFound() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold">Character not found</h1>
      <p className="text-sm text-muted-foreground">
        No character matches this link. It may have been removed, or the URL
        may be mistyped.
      </p>
      <Link
        href="/"
        className="text-sm underline underline-offset-4 hover:no-underline"
      >
        Go home
      </Link>
    </main>
  )
}
