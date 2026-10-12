import { cn } from '@/lib/utils'

const GLYPH =
  '517,323 722,323 739,397 546,522 546,531 955,531 955,683 864,683 792,593 782,593 855,920 673,920 622,683 567,920 369,920 404,792 546,683 298,683 298,531 465,531'

/**
 * Logo AdverTest trong app: ký hiệu đen trên ô trắng viền mực, có gờ bóng như các thẻ khác.
 * Favicon trên tab trình duyệt dùng bản 3D màu xanh (public/favicon.png).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1254 1254" aria-hidden className={cn('shrink-0', className)}>
      <rect x="44" y="120" width="1166" height="1100" rx="250" fill="#17181d" />
      <rect
        x="44"
        y="34"
        width="1166"
        height="1100"
        rx="250"
        fill="#fff"
        stroke="#17181d"
        strokeWidth="56"
      />
      <polygon
        points={GLYPH}
        fill="#17181d"
        transform="translate(626 583) scale(1.12) translate(-626 -621)"
      />
    </svg>
  )
}
