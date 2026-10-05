/**
 * Vòng đời một experiment trên trang chi tiết (góp ý mentor: luồng liền mạch, biết mình đang ở
 * đâu): Cấu hình → Chạy → Xem kết quả → Gửi cho reviewer → Reviewer duyệt → Report. Thuần, test được.
 */
import type { ExperimentDetail, ExperimentStatus } from '@/contracts/api'

export type LifecycleId = 'configure' | 'run' | 'results' | 'submit' | 'review' | 'report'

/** `done`: đã qua; `current`: đang ở đây; `todo`: chưa tới; `stopped`: luồng dừng ở bước trước. */
export type LifecycleState = 'done' | 'current' | 'todo' | 'stopped'

/** Sắc thái của bước hiện tại (review kết thúc bằng yêu cầu sửa hay từ chối). */
export type LifecycleTone = 'normal' | 'warning' | 'danger' | 'success'

export interface LifecycleStage {
  id: LifecycleId
  label: string
  state: LifecycleState
  tone: LifecycleTone
  /** Một câu ngắn cho bước hiện tại hoặc kết quả của bước. */
  note: string | null
  /** Liên kết khi bước có nội dung để xem. */
  to: string | null
}

export const LIFECYCLE_LABEL: Record<LifecycleId, string> = {
  configure: 'Cấu hình',
  run: 'Chạy',
  results: 'Xem kết quả',
  // Không dùng đúng chữ của nút "Gửi duyệt" và tab "Review": thanh này chỉ chỉ đường, không phải
  // nút hành động (test của trang chi tiết dựa vào việc nút/tab đó vắng mặt).
  submit: 'Gửi cho reviewer',
  review: 'Reviewer duyệt',
  report: 'Report',
}

const ORDER: LifecycleId[] = ['configure', 'run', 'results', 'submit', 'review', 'report']

/** Bước hiện tại theo trạng thái, kèm sắc thái và câu ngắn. */
const CURRENT: Record<
  ExperimentStatus,
  { at: LifecycleId; tone: LifecycleTone; note: string; stopped?: boolean }
> = {
  draft: { at: 'configure', tone: 'normal', note: 'Bản nháp' },
  queued: { at: 'run', tone: 'normal', note: 'Đang chờ máy' },
  running: { at: 'run', tone: 'normal', note: 'Đang chạy' },
  cancelled: { at: 'run', tone: 'warning', note: 'Đã hủy', stopped: true },
  completed: { at: 'results', tone: 'normal', note: 'Xem rồi gửi duyệt' },
  submitted_for_review: { at: 'review', tone: 'normal', note: 'Chờ reviewer nhận' },
  in_review: { at: 'review', tone: 'normal', note: 'Đang review' },
  changes_requested: { at: 'review', tone: 'warning', note: 'Yêu cầu sửa', stopped: true },
  rejected: { at: 'review', tone: 'danger', note: 'Từ chối', stopped: true },
  approved: { at: 'report', tone: 'success', note: 'Đã chấp nhận' },
}

export function lifecycle(
  e: Pick<ExperimentDetail, 'status' | 'review' | 'report'>,
): LifecycleStage[] {
  const cur = CURRENT[e.status]
  const at = ORDER.indexOf(cur.at)
  const reportReady = e.report?.status === 'ready'
  const links: Record<LifecycleId, string | null> = {
    configure: null,
    run: at >= 1 ? '?' : null,
    results: at >= 1 && e.status !== 'queued' ? '?tab=results' : null,
    submit: e.review ? '?tab=review' : null,
    review: e.review ? '?tab=review' : null,
    report: e.report ? `/reports/${e.report.id}` : null,
  }
  return ORDER.map((id, i) => {
    // Đã chấp nhận và report sẵn sàng: cả luồng hoàn tất.
    const finished = e.status === 'approved' && reportReady
    const state: LifecycleState =
      i < at || (finished && i === at)
        ? 'done'
        : i === at
          ? 'current'
          : cur.stopped
            ? 'stopped'
            : 'todo'
    return {
      id,
      label: LIFECYCLE_LABEL[id],
      state,
      tone: i === at ? cur.tone : 'normal',
      note:
        i === at
          ? e.status === 'approved'
            ? reportReady
              ? 'Report sẵn sàng'
              : 'Report đang tạo'
            : cur.note
          : null,
      to: state === 'todo' || state === 'stopped' ? null : links[id],
    }
  })
}
