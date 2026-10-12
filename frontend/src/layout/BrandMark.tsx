import { cn } from '@/lib/utils'
import logoUrl from '@/assets/logo.png'

/** Logo AdverTest: chữ A dạng ống bóng 3D màu xanh cobalt. Ảnh trang trí, tên app nằm ngay cạnh. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      alt=""
      aria-hidden
      draggable={false}
      className={cn(
        'shrink-0 object-contain drop-shadow-[0_3px_0_rgba(23,24,29,0.18)] select-none',
        className,
      )}
    />
  )
}
