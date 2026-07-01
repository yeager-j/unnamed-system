import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@workspace/ui/components/progress"

export function Vitals() {
  return (
    <div className="flex w-64 flex-col gap-5">
      <Progress value={80} color="hp">
        <ProgressLabel>Hit Points</ProgressLabel>
        <ProgressValue>32 / 40</ProgressValue>
      </Progress>
      <Progress value={60} color="sp">
        <ProgressLabel>Spirit Points</ProgressLabel>
        <ProgressValue>12 / 20</ProgressValue>
      </Progress>
    </div>
  )
}

export function ShowtimeGauge() {
  return (
    <div className="flex w-64 flex-col gap-2">
      <Progress value={85}>
        <ProgressLabel>Showtime! Meter</ProgressLabel>
        <ProgressValue>85%</ProgressValue>
      </Progress>
      <p className="text-xs text-muted-foreground">
        One Follow-Up away from an All-Out Attack.
      </p>
    </div>
  )
}

export function LowHealth() {
  return (
    <div className="flex w-64 flex-col gap-2">
      <Progress value={18} color="hp">
        <ProgressLabel>Hit Points</ProgressLabel>
        <ProgressValue>5 / 28</ProgressValue>
      </Progress>
      <p className="text-xs text-muted-foreground">
        Bloodied — Rest recommended.
      </p>
    </div>
  )
}
