import { Spinner } from "@workspace/ui/components/spinner"

export function WithLabel() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner />
      Loading encounter…
    </div>
  )
}

export function Sizes() {
  return (
    <div className="flex items-center gap-4 text-primary">
      <Spinner className="size-4" />
      <Spinner className="size-6" />
      <Spinner className="size-8" />
    </div>
  )
}
