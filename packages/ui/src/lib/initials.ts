/**
 * Up to two uppercase initials from a name, for the portrait avatar placeholder
 * when no portrait is set. Shared by the read-only header avatar, the owner-mode
 * editable portrait, and the canvas token chips. A name with no word characters
 * yields `fallback` (default `""`).
 */
export function initials(name: string, fallback = ""): string {
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length === 0) return fallback
  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("")
}
