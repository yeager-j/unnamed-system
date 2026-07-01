import { Separator } from "@workspace/ui/components/separator"

export function Horizontal() {
  return (
    <div className="max-w-xs">
      <div className="text-sm font-medium">Agilao</div>
      <div className="text-xs text-muted-foreground">Fire · 8 SP</div>
      <Separator className="my-3" />
      <div className="text-sm font-medium">Bufula</div>
      <div className="text-xs text-muted-foreground">Ice · 8 SP</div>
    </div>
  )
}

export function Vertical() {
  return (
    <div className="flex h-8 items-center gap-3 text-sm">
      <span>HP 24</span>
      <Separator orientation="vertical" />
      <span>SP 12</span>
      <Separator orientation="vertical" />
      <span>LV 4</span>
    </div>
  )
}
