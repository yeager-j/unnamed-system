import { getAilment } from "@/lib/game/combat/ailments"

export function AilmentList({
  ailmentKeys,
}: {
  ailmentKeys: readonly string[]
}) {
  return (
    <div className="col-span-2 flex flex-col gap-1.5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Ailment
      </p>
      {ailmentKeys.length === 0 ? (
        <p aria-label="No ailment" className="text-sm text-muted-foreground">
          —
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {ailmentKeys.map((key) => {
            const canonical = getAilment(key)
            return (
              <li key={key} className="flex flex-col gap-0.5">
                <span className="font-medium text-destructive">
                  {canonical?.name ?? key}
                </span>
                {canonical ? (
                  <span className="text-muted-foreground">
                    {canonical.description}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
