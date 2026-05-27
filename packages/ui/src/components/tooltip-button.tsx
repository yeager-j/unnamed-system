"use client"

import type { ComponentProps, ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

type ButtonProps = ComponentProps<typeof Button>

interface TooltipButtonProps extends ButtonProps {
  /**
   * The disabled-state reason. When the button is disabled and this is set,
   * a Tooltip wraps the button with this content. When the button is not
   * disabled — or when `disabledReason` is falsy — the bare Button is
   * rendered with no Tooltip overhead.
   *
   * Base UI tooltips don't fire mouse events on a disabled `<button>`, so
   * the wrapper trick (`<span tabIndex={0}>`) is owned here instead of
   * re-implemented at every consumer (UNN-231).
   */
  disabledReason?: ReactNode
  /** Where to anchor the tooltip relative to the button. Defaults to `"top"`. */
  tooltipSide?: "top" | "right" | "bottom" | "left"
}

/**
 * A {@link Button} that exposes a Tooltip with a reason when disabled.
 * Useful for any disabled CTA where the user benefits from a one-line
 * explanation on hover/tap — Cast when the character can't pay, Equip when
 * the slot is locked, etc.
 *
 * When `disabledReason` is unset (or the button is enabled), this renders a
 * plain Button — no wrapper span, no Tooltip Portal, no extra DOM.
 */
export function TooltipButton({
  disabledReason,
  tooltipSide = "top",
  disabled,
  ...buttonProps
}: TooltipButtonProps) {
  const button = <Button disabled={disabled} {...buttonProps} />

  if (!disabled || !disabledReason) return button

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span tabIndex={0} className="inline-flex">
            {button}
          </span>
        }
      />
      <TooltipContent side={tooltipSide}>{disabledReason}</TooltipContent>
    </Tooltip>
  )
}
