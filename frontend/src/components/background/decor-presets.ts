import type { DecorItem } from './FloatingDecor'

/** Bộ vật trang trí cho từng khu vực. Hằng số module: FloatingDecor chạy lại khi mảng đổi. */
export const AUTH_DECOR: DecorItem[] = [
  { kind: 'cube', x: 51, y: 42, size: 64, depth: 0.9 },
  { kind: 'smiley', x: 96, y: 64, size: 70, depth: 0.6 },
  { kind: 'ring', x: 88, y: 91, size: 84, depth: 0.8 },
  { kind: 'cone', x: 55, y: 80, size: 46, depth: 1 },
  { kind: 'hex', x: 96, y: 30, size: 60, depth: 0.5 },
  { kind: 'pixel', x: 70, y: 92, size: 26, depth: 1 },
  { kind: 'target', x: 5, y: 90, size: 54, depth: 0.7 },
  { kind: 'star', x: 6, y: 8, size: 40, depth: 0.9 },
]

export const BANNER_DECOR: DecorItem[] = [
  { kind: 'cube', x: 72, y: 26, size: 40, depth: 0.9 },
  { kind: 'smiley', x: 95, y: 18, size: 56, depth: 0.6 },
  { kind: 'cone', x: 66, y: 76, size: 32, depth: 1 },
  { kind: 'ring', x: 90, y: 86, size: 50, depth: 0.7 },
]

export const HERO_DECOR: DecorItem[] = [
  { kind: 'star', x: 97, y: 8, size: 70, depth: 0.5 },
  { kind: 'cone', x: 52, y: 12, size: 30, depth: 1 },
  { kind: 'pixel', x: 54, y: 86, size: 22, depth: 0.9 },
]

export const WIZARD_DECOR: DecorItem[] = [
  { kind: 'ring', x: 84, y: 32, size: 64, depth: 0.8 },
  { kind: 'cube', x: 94, y: 70, size: 40, depth: 0.9 },
  { kind: 'cone', x: 72, y: 22, size: 32, depth: 1 },
  { kind: 'smiley', x: 64, y: 70, size: 44, depth: 0.6 },
]
