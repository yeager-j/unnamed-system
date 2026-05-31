/**
 * Up to two uppercase initials from a name, for the portrait avatar
 * placeholder when no portrait is set. Shared by the read-only header avatar
 * and the owner-mode editable portrait.
 */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("")
}
