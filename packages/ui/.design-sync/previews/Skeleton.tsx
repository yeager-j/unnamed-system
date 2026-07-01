import { Skeleton } from "@workspace/ui/components/skeleton"

export function CharacterCard() {
  return (
    <div className="flex max-w-sm items-center gap-4 rounded-lg border p-4">
      <Skeleton className="size-12 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  )
}

export function StatBlock() {
  return (
    <div className="flex max-w-sm flex-col gap-2.5 rounded-lg border p-4">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  )
}
