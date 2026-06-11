import { MapPinIcon, MusicNotesIcon } from "@phosphor-icons/react"

/**
 * Bard — Enchantment rendering. The mechanic has no per-character state (the
 * active Enchantment lives on the encounter session and is applied from the DM
 * console), so the Combat-tab widget is a static, read-only reminder of how
 * Enchanting works turn to turn. The full rules live on the Archetypes-tab
 * mechanic card; the live Zone badge lives on the battlefield views.
 */
export function EnchantmentWidget() {
  return (
    <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
      <li className="flex items-start gap-2">
        <MusicNotesIcon className="mt-0.5 shrink-0" aria-hidden />
        <span>
          <span className="font-medium text-foreground">Enchant</span>: your
          Skills may Enchant the Zone they target — your choice on each cast.
          Only one Zone holds an Enchantment at a time.
        </span>
      </li>
      <li className="flex items-start gap-2">
        <MapPinIcon className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Repeating the same Enchantment raises its{" "}
          <span className="font-medium text-foreground">Forte</span> (
          <em className="font-serif font-bold">f</em> →{" "}
          <em className="font-serif font-bold">ff</em> →{" "}
          <em className="font-serif font-bold">fff</em>); each Forte grants all
          lower Fortes&apos; effects. The battlefield map shows the Enchanted
          Zone.
        </span>
      </li>
    </ul>
  )
}
