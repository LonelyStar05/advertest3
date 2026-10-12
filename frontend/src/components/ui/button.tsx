import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'
import { Slot } from 'radix-ui'

// Vùng chạm tối thiểu 44×44px (tech-stack.md mục 5.1).
// Vùng chạm tối thiểu 44×44px (tech-stack.md mục 5.1). Mỗi màn hình chỉ một nút `default`.
const buttonVariants = cva(
  'inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full px-5 font-heading text-[14px] font-bold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_0_0_1.5px_var(--ink-line),0_4px_0_var(--cobalt)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1.5px_var(--ink-line),0_6px_0_var(--cobalt)] active:translate-y-[3px] active:shadow-[0_0_0_1.5px_var(--ink-line),0_1px_0_var(--cobalt)] active:duration-75',
        soft: 'bg-accent text-accent-foreground shadow-[0_0_0_1.5px_var(--ink-line)] hover:bg-accent/70 active:translate-y-px',
        destructive:
          'bg-destructive text-white shadow-[0_0_0_1.5px_var(--ink-line),0_4px_0_var(--ink-line)] hover:-translate-y-0.5 active:translate-y-[3px] active:shadow-[0_0_0_1.5px_var(--ink-line),0_1px_0_var(--ink-line)]',
        outline:
          'bg-surface-solid text-foreground shadow-[0_0_0_1.5px_var(--ink-line),0_3px_0_var(--ink-line)] hover:-translate-y-0.5 hover:bg-[var(--sun)] hover:text-[#17181d] hover:shadow-[0_0_0_1.5px_var(--ink-line),0_5px_0_var(--ink-line)] active:translate-y-[3px] active:shadow-[0_0_0_1.5px_var(--ink-line),0_0_0_var(--ink-line)] active:duration-75',
        ghost: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        link: 'text-detect-strong underline-offset-4 hover:underline',
      },
      size: {
        default: '',
        icon: 'min-w-11 px-0',
        lg: 'min-h-11 px-5 text-[14.5px]',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button }
