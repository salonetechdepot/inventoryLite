"use client"

import { cn } from "@/lib/utils"
import {
  defaultDispositionForCondition,
  formatReturnCondition,
  formatReturnDisposition,
  RETURN_CONDITIONS,
  RETURN_DISPOSITIONS,
  type ReturnCondition,
  type ReturnDisposition,
} from "@/lib/return-inventory"

export interface ReturnItemState {
  returnCondition: ReturnCondition
  returnDisposition: ReturnDisposition
}

export const DEFAULT_RETURN_ITEM_STATE: ReturnItemState = {
  returnCondition: "SEALED",
  returnDisposition: "RESTOCK",
}

interface ReturnItemControlsProps {
  value: ReturnItemState
  onChange: (value: ReturnItemState) => void
  compact?: boolean
  className?: string
}

export function ReturnItemControls({
  value,
  onChange,
  compact = false,
  className,
}: ReturnItemControlsProps) {
  const setCondition = (condition: ReturnCondition) => {
    const suggested = defaultDispositionForCondition(condition)
    const keepDisposition =
      value.returnDisposition === "DISCARD" && condition === "OPENED"
        ? value.returnDisposition
        : suggested
    onChange({ returnCondition: condition, returnDisposition: keepDisposition })
  }

  const setDisposition = (returnDisposition: ReturnDisposition) => {
    onChange({ ...value, returnDisposition })
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div>
        <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">
          Condition
        </p>
        <div className="flex flex-wrap gap-1">
          {RETURN_CONDITIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCondition(c)}
              className={cn(
                "rounded-md border px-2 font-medium transition-colors",
                compact ? "h-7 text-xs" : "h-8 text-sm",
                value.returnCondition === c
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-muted"
              )}
            >
              {formatReturnCondition(c)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">
          Inventory
        </p>
        <div className="flex gap-1">
          {RETURN_DISPOSITIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDisposition(d)}
              className={cn(
                "flex-1 rounded-md border font-medium transition-colors",
                compact ? "h-7 text-xs" : "h-8 text-sm",
                value.returnDisposition === d
                  ? d === "RESTOCK"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-destructive/50 bg-destructive/10 text-destructive"
                  : "hover:bg-muted"
              )}
            >
              {formatReturnDisposition(d)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
