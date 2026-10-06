/**
 * Khi nào được chạy hiệu ứng nặng (vòng lặp requestAnimationFrame liên tục: nền sóng WebGL, vật
 * trang trí 3D). Không chạy thì vẽ một khung hình tĩnh, giao diện vẫn đủ.
 *
 * - `prefers-reduced-motion: reduce`: người dùng yêu cầu ít chuyển động.
 * - `navigator.webdriver`: trình duyệt đang bị điều khiển tự động (Playwright E2E, công cụ chụp
 *   màn hình). Cảnh đứng yên giúp phần tử ổn định để thao tác và tránh làm nghẽn luồng chính.
 */
export function stillScene(): boolean {
  if (typeof window === 'undefined') return true
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true
  return typeof navigator !== 'undefined' && navigator.webdriver === true
}

/**
 * WebGL đang chạy bằng CPU (máy không có GPU, máy ảo, CI: SwiftShader, llvmpipe...). Vẽ shader
 * toàn màn hình mỗi khung hình khi đó chiếm hết luồng chính, nên chỉ vẽ một khung tĩnh.
 */
export function softwareRenderer(gl: WebGLRenderingContext): boolean {
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '')
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)
  } catch {
    return false
  }
}
