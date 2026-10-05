import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

const CARD =
  'group flex min-h-11 w-full min-w-0 items-start gap-3 rounded-xl border bg-surface-solid p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-[border-color,box-shadow,background-color] duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'
const ON = 'border-navy shadow-[0_0_0_1px_var(--navy)]'
const OFF = 'border-line hover:border-input hover:shadow-[0_4px_14px_rgba(16,24,40,0.07)]'

/** Thẻ chọn một trong nhiều (radio), vùng chạm ≥ 44px. */
export function ChoiceCard({
  selected,
  onSelect,
  children,
  disabled = false,
  className,
}: {
  selected: boolean
  onSelect: () => void
  children: ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        CARD,
        selected ? ON : OFF,
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">{children}</span>
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          selected ? 'border-navy bg-navy' : 'border-input',
        )}
      >
        {selected && <span className="size-2 rounded-full bg-primary-foreground" />}
      </span>
    </button>
  )
}

/** Thẻ bật/tắt (chọn nhiều), cùng kiểu với `ChoiceCard` nhưng dấu tích vuông. */
export function ToggleCard({
  pressed,
  onToggle,
  children,
  label,
  disabled = false,
  className,
}: {
  pressed: boolean
  onToggle: () => void
  children: ReactNode
  /** Tên truy cập ngắn (thẻ có nhiều chữ mô tả). */
  label?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        CARD,
        pressed ? ON : OFF,
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      {children}
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
          pressed ? 'border-navy bg-navy text-primary-foreground' : 'border-input',
        )}
      >
        {pressed && <Check className="size-3.5" strokeWidth={3} />}
      </span>
    </button>
  )
}
