import { ClockIcon, MoonIcon, SunIcon } from "@phosphor-icons/react/dist/ssr"

const SLOT_ICONS = { sun: SunIcon, moon: MoonIcon, clock: ClockIcon } as const

/** Slot label → rail icon key: the handoff's sun/moon pair, a clock otherwise. */
function slotIconKey(label: string): keyof typeof SLOT_ICONS {
  if (/morning|dawn|day/i.test(label)) return "sun"
  if (/evening|night|dusk/i.test(label)) return "moon"
  return "clock"
}

/** The slot-label icon the runner's pills and the Calendar's slot rows share. */
export function SlotIcon({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  const Icon = SLOT_ICONS[slotIconKey(label)]
  return <Icon className={className} />
}
