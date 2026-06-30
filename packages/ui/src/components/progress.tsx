"use client"

import { Progress as ProgressPrimitive } from "@base-ui/react/progress"
import { cva } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

function Progress({
  className,
  children,
  value,
  color,
  ...props
}: ProgressPrimitive.Root.Props & { color?: "default" | "hp" | "sp" }) {
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      className={cn("flex flex-wrap gap-3", className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator color={color} />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  )
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      className={cn(
        "relative flex h-1.5 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      data-slot="progress-track"
      {...props}
    />
  )
}

const progressIndicatorVariants = cva("h-full transition-all", {
  variants: {
    color: {
      default: "bg-primary",
      hp: "bg-hp",
      sp: "bg-sp",
    },
  },
  defaultVariants: {
    color: "default",
  },
})

function ProgressIndicator({
  className,
  color,
  ...props
}: ProgressPrimitive.Indicator.Props & { color?: "default" | "hp" | "sp" }) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn(progressIndicatorVariants({ color, className }))}
      {...props}
    />
  )
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return (
    <ProgressPrimitive.Label
      className={cn("text-sm font-medium", className)}
      data-slot="progress-label"
      {...props}
    />
  )
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
  return (
    <ProgressPrimitive.Value
      className={cn(
        "ml-auto text-sm text-muted-foreground tabular-nums",
        className
      )}
      data-slot="progress-value"
      {...props}
    />
  )
}

export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
}
