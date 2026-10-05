import { ImageUp, LoaderCircle, Play, ScanSearch } from 'lucide-react'
import { useId, useMemo, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'

import { errorMessage } from '@/api/messages'
import { FormAlert } from '@/components/FormAlert'
import { LoadError } from '@/components/LoadError'
import { PageLoading } from '@/components/PageLoading'
import { Button } from '@/components/ui/button'
import type { AttackSpecView, QuickTryBox, QuickTryRequest, QuickTryResult } from '@/contracts/api'
import { ChoiceCard } from '@/features/wizard/ChoiceCard'
import { useAttackSpecs, useModels } from '@/features/wizard/api'
import { ATTACK_EXPLAIN, attackLook, paramPlain } from '@/lib/attack-kinds'
import { cn } from '@/lib/utils'
import { PageHero } from '@/layout/PageHero'

import { useQuickTryImages, useRunQuickTry } from './api'
import {
  attackTitle,
  boxTone,
  defaultAttack,
  defaultLevel,
  defaultModel,
  formatLevel,
  levelChoices,
  quickTryable,
  resultSentence,
  TONE_STYLE,
  uploadProblem,
} from './logic'

type Picked =
  | { kind: 'dataset'; datasetVersionId: string; imageId: string; preview: string }
  | { kind: 'upload'; dataUrl: string; name: string }

/**
 * Thử nhanh một ảnh: chọn ảnh, kiểu tấn công và mức nhiễu, bấm Chạy thử; vài giây sau thấy ảnh
 * sạch và ảnh bị tấn công cạnh nhau, có khung nhận diện và câu kết luận. Không tạo experiment, không
 * lưu kết quả: dùng để hiểu một attack làm gì trước khi chạy kiểm định thật.
 */
export function QuickTryPage() {
  const models = useModels()
  const specs = useAttackSpecs()
  const images = useQuickTryImages()
  const run = useRunQuickTry()

  const attacks = useMemo(() => quickTryable((specs.data ?? []) as AttackSpecView[]), [specs.data])
  const [modelId, setModelId] = useState<string | null>(null)
  const [attackId, setAttackId] = useState<string | null>(null)
  const [level, setLevel] = useState<number | null>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Giá trị mặc định khi dữ liệu về: model hỗ trợ gradient, FGSM, mức gợi ý, ảnh đầu tiên.
  const model = models.data?.find((m) => m.id === modelId) ?? defaultModel(models.data ?? [])
  const attack = attacks.find((a) => a.id === attackId) ?? defaultAttack(attacks)
  const chosenLevel = level ?? (attack ? defaultLevel(attack) : null)
  const firstImage = images.data?.[0]
  const image: Picked | null =
    picked ??
    (firstImage
      ? {
          kind: 'dataset',
          datasetVersionId: firstImage.dataset_version_id,
          imageId: firstImage.image_id,
          preview: firstImage.thumbnail,
        }
      : null)

  const gradientBlocked = Boolean(attack?.requires_gradients && model && !model.supports_gradients)
  const ready = Boolean(model && attack && chosenLevel !== null && image && !gradientBlocked)

  const submit = () => {
    if (!model || !attack || chosenLevel === null || !image) return
    const body: QuickTryRequest = {
      model_version_id: model.id,
      attack_spec_id: attack.id,
      level: chosenLevel,
      seed: 0,
      ...(image.kind === 'dataset'
        ? { dataset_version_id: image.datasetVersionId, image_id: image.imageId }
        : { image_base64: image.dataUrl }),
    } as QuickTryRequest
    run.mutate(body)
  }

  if (models.isPending || specs.isPending) return <PageLoading />
  if (models.isError || specs.isError)
    return (
      <div className="p-4 md:p-8">
        <LoadError
          onRetry={() => {
            void models.refetch()
            void specs.refetch()
          }}
        />
      </div>
    )

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 md:p-8">
      <PageHero
        compact
        title="Thử nhanh một ảnh"
        description="Xem một kiểu tấn công làm model nhìn sai thế nào: ảnh sạch ở trên, ảnh đã bị tấn công ở dưới, khung nhận diện vẽ sẵn. Không tạo experiment, không lưu kết quả."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section
          aria-label="Cấu hình thử"
          className="panel flex flex-col gap-6 p-5 lg:sticky lg:top-6"
        >
          <ImagePicker
            images={images}
            picked={image}
            onPick={(p) => {
              setPicked(p)
              setUploadError(null)
            }}
            onUploadError={setUploadError}
          />
          {uploadError && <FormAlert>{uploadError}</FormAlert>}

          {(models.data?.length ?? 0) > 1 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[14px] font-semibold">Model</legend>
              <div role="radiogroup" aria-label="Model" className="flex flex-col gap-2">
                {models.data?.map((m) => (
                  <ChoiceCard
                    key={m.id}
                    selected={m.id === model?.id}
                    onSelect={() => setModelId(m.id)}
                  >
                    <span className="text-[14px] font-medium break-all">{m.name}</span>
                    <span className="text-[12.5px] text-muted-foreground">
                      {m.class_names.length} lớp ·{' '}
                      {m.supports_gradients ? 'hỗ trợ gradient' : 'không có gradient'}
                    </span>
                  </ChoiceCard>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[14px] font-semibold">Kiểu tấn công</legend>
            <div role="radiogroup" aria-label="Kiểu tấn công" className="grid grid-cols-2 gap-2">
              {attacks.map((a) => {
                const look = attackLook(a)
                return (
                  <ChoiceCard
                    key={a.id}
                    selected={a.id === attack?.id}
                    onSelect={() => {
                      setAttackId(a.id)
                      setLevel(null)
                    }}
                    className="p-2.5"
                  >
                    <span className="flex items-center gap-2">
                      <span className={cn('tile size-7', look.tile)} aria-hidden>
                        <look.icon className="size-3.5" />
                      </span>
                      <span className="text-[13px] leading-4 font-medium">{attackTitle(a)}</span>
                    </span>
                  </ChoiceCard>
                )
              })}
            </div>
          </fieldset>

          {attack && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[14px] font-semibold">Mức tấn công</legend>
              <p className="text-[12.5px] leading-5 text-muted-foreground">
                {paramPlain(attack.primary_param)}
              </p>
              <div role="radiogroup" aria-label="Mức tấn công" className="flex flex-wrap gap-2">
                {levelChoices(attack).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={v === chosenLevel}
                    onClick={() => setLevel(v)}
                    className={cn(
                      'min-h-11 min-w-14 rounded-full border px-3.5 text-[14px] font-semibold tabular-nums transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                      v === chosenLevel
                        ? 'border-navy bg-navy text-primary-foreground'
                        : 'border-line bg-surface-solid hover:border-input',
                    )}
                  >
                    {formatLevel(v, attack.primary_param.unit)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {gradientBlocked && (
            <FormAlert>
              Model này không hỗ trợ gradient nên không chạy được {attack && attackTitle(attack)}.
            </FormAlert>
          )}
          <Button size="lg" disabled={!ready || run.isPending} onClick={submit}>
            {run.isPending ? (
              <>
                <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
                Đang chạy, vài giây…
              </>
            ) : (
              <>
                <Play aria-hidden />
                Chạy thử
              </>
            )}
          </Button>
        </section>

        <section
          aria-label="Kết quả thử"
          aria-live="polite"
          className="flex min-w-0 flex-col gap-5"
        >
          {attack && <AttackNote spec={attack} />}
          {run.isError && <FormAlert>{errorMessage(run.error)}</FormAlert>}
          {run.data ? (
            <ResultView
              result={run.data}
              title={attackTitle(
                attacks.find((a) => a.id === run.data.attack_spec_id) ?? {
                  name: run.data.attack_name,
                  display: null,
                },
              )}
            />
          ) : (
            <EmptyResult
              preview={image ? (image.kind === 'dataset' ? image.preview : image.dataUrl) : null}
              pending={run.isPending}
            />
          )}
        </section>
      </div>
    </div>
  )
}

function AttackNote({ spec }: { spec: AttackSpecView }) {
  const explain = ATTACK_EXPLAIN[spec.name]
  const how = spec.display?.description_vi ?? explain?.how
  if (!how && !explain?.risk) return null
  const look = attackLook(spec)
  return (
    <div className="panel flex items-start gap-3 p-4">
      <span className={cn('tile size-9', look.tile)} aria-hidden>
        <look.icon className="size-[18px]" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[15px] font-semibold">{attackTitle(spec)} hoạt động thế nào?</p>
        {how && <p className="text-[14px] leading-6 text-muted-foreground">{how}</p>}
        {explain?.risk && (
          <p className="text-[13.5px] leading-6">
            <span className="font-semibold">Rủi ro ngoài đời: </span>
            {explain.risk}
          </p>
        )}
      </div>
    </div>
  )
}

function ImagePicker({
  images,
  picked,
  onPick,
  onUploadError,
}: {
  images: ReturnType<typeof useQuickTryImages>
  picked: Picked | null
  onPick: (p: Picked) => void
  onUploadError: (message: string | null) => void
}) {
  const inputId = useId()
  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const problem = uploadProblem(file)
    if (problem) {
      onUploadError(problem)
      return
    }
    const reader = new FileReader()
    reader.onload = () =>
      onPick({ kind: 'upload', dataUrl: String(reader.result), name: file.name })
    reader.onerror = () => onUploadError('Không đọc được file ảnh này.')
    reader.readAsDataURL(file)
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[14px] font-semibold">Ảnh</legend>
      {images.isPending ? (
        <p className="text-sm text-muted-foreground">Đang tải ảnh mẫu…</p>
      ) : images.isError ? (
        <p className="text-sm text-destructive">
          Không tải được ảnh mẫu; bạn vẫn có thể tải ảnh lên.
        </p>
      ) : (
        <div role="radiogroup" aria-label="Ảnh mẫu" className="grid grid-cols-3 gap-2">
          {images.data.map((img) => {
            const on = picked?.kind === 'dataset' && picked.imageId === img.image_id
            return (
              <button
                key={`${img.dataset_version_id}/${img.image_id}`}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`Ảnh ${img.image_id}, ${img.num_objects} vật thể`}
                onClick={() =>
                  onPick({
                    kind: 'dataset',
                    datasetVersionId: img.dataset_version_id,
                    imageId: img.image_id,
                    preview: img.thumbnail,
                  })
                }
                className={cn(
                  'relative min-h-11 overflow-hidden rounded-lg border-2 transition-shadow focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                  on
                    ? 'border-navy shadow-[0_0_0_2px_var(--navy)]'
                    : 'border-transparent hover:border-input',
                )}
              >
                <img src={img.thumbnail} alt="" className="aspect-[16/7] w-full object-cover" />
                <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 text-[10.5px] font-semibold text-white">
                  {img.num_objects} vật thể
                </span>
              </button>
            )
          })}
        </div>
      )}
      <label
        htmlFor={inputId}
        className={cn(
          'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-dashed px-3 text-[14px] font-semibold transition-colors hover:bg-muted focus-within:ring-[3px] focus-within:ring-ring/50',
          picked?.kind === 'upload' ? 'border-navy' : 'border-input',
        )}
      >
        <ImageUp className="size-4" aria-hidden />
        {picked?.kind === 'upload'
          ? `Đã chọn: ${picked.name}`
          : 'Hoặc tải ảnh của bạn lên (PNG, JPEG)'}
        <input
          id={inputId}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          onChange={onFile}
        />
      </label>
      <p className="text-[12px] leading-5 text-muted-foreground">
        Mặt người và biển số được làm mờ trước khi hiển thị.
      </p>
    </fieldset>
  )
}

function EmptyResult({ preview, pending }: { preview: string | null; pending: boolean }) {
  return (
    <div className="panel flex flex-col items-center gap-4 p-8 text-center">
      {preview ? (
        <img
          src={preview}
          alt="Ảnh đã chọn"
          className="max-h-56 w-full max-w-xl rounded-xl object-contain"
        />
      ) : (
        <span className="tile size-12" aria-hidden>
          <ScanSearch className="size-6" />
        </span>
      )}
      <p className="text-[15px] font-semibold">
        {pending
          ? 'Đang chạy model trên ảnh sạch và ảnh bị tấn công…'
          : 'Chọn ảnh, kiểu tấn công và mức, rồi bấm “Chạy thử”'}
      </p>
      <p className="max-w-md text-[13.5px] leading-5 text-muted-foreground">
        Kết quả hiện hai ảnh cạnh nhau: khung xanh là vật thể model vẫn nhận ra, khung đỏ nét đứt là
        vật thể bị bỏ sót, khung cam là vật thể model tưởng tượng ra.
      </p>
    </div>
  )
}

function ResultView({ result, title }: { result: QuickTryResult; title: string }) {
  const [showNoise, setShowNoise] = useState(false)
  const s = result.summary
  const stats = [
    { label: 'Vật thể trên ảnh sạch', value: s.clean_count, tone: '' },
    { label: 'Sau tấn công', value: s.attacked_count, tone: '' },
    { label: 'Bị bỏ sót', value: s.missed_count, tone: 'text-fail' },
    { label: 'Phát hiện sai mới', value: s.new_count, tone: 'text-warning-text' },
  ]
  return (
    <div className="flex flex-col gap-5">
      <div className="panel flex flex-col gap-4 p-5">
        <p className="text-[17px] leading-7 font-semibold">{resultSentence(result, title)}</p>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((st) => (
            <div key={st.label} className="rounded-xl bg-muted px-4 py-3">
              <dt className="text-[12.5px] text-muted-foreground">{st.label}</dt>
              <dd className={cn('text-[26px] leading-tight font-semibold tabular-nums', st.tone)}>
                {st.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex flex-col gap-4">
        <Detections
          heading="Ảnh sạch"
          src={result.clean_image}
          width={result.width}
          height={result.height}
          boxes={result.clean}
          side="clean"
        />
        <Detections
          heading={`Sau ${title} ${formatLevel(result.level, result.unit)}`}
          src={result.attacked_image}
          width={result.width}
          height={result.height}
          boxes={result.attacked}
          side="attacked"
        />
      </div>
      <div className="panel flex flex-wrap items-center gap-x-5 gap-y-2 p-4 text-[13px]">
        {(['kept', 'missed', 'new'] as const).map((t) => (
          <span key={t} className="flex items-center gap-2">
            <svg width="28" height="14" aria-hidden>
              <rect
                x="1"
                y="1"
                width="26"
                height="12"
                fill="none"
                stroke={TONE_STYLE[t].stroke}
                strokeWidth="2.5"
                strokeDasharray={TONE_STYLE[t].dash}
              />
            </svg>
            {TONE_STYLE[t].label}
          </span>
        ))}
        <span className="text-muted-foreground">
          Chỉ hiện khung có độ tin cậy ≥ {Math.round(result.operating_conf * 100)}%; hai khung được
          coi là cùng một vật thể khi trùng nhau ≥ {Math.round(s.iou_threshold * 100)}%.
        </span>
      </div>
      <div className="panel flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold">Nhiễu đã thêm vào ảnh</p>
            <p className="text-[13px] text-muted-foreground">
              Phóng đại để dễ nhìn; nhiễu thật nhỏ hơn nhiều và gần như không thấy bằng mắt.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowNoise((v) => !v)}
            aria-expanded={showNoise}
          >
            {showNoise ? 'Ẩn nhiễu' : 'Xem nhiễu'}
          </Button>
        </div>
        {showNoise && (
          <img
            src={result.perturbation_image}
            alt="Nhiễu đã thêm, phóng đại"
            className="w-full rounded-lg"
          />
        )}
        <p className="text-[12.5px] text-muted-foreground">
          Thời gian: {Math.round(result.timing.total_ms)} ms (model{' '}
          {Math.round(result.timing.clean_ms)} ms, tấn công {Math.round(result.timing.attack_ms)}{' '}
          ms). Muốn đo trên nhiều ảnh và có kết luận chính thức?{' '}
          <Link
            to="/experiments/new"
            className="font-semibold text-foreground underline underline-offset-4"
          >
            Tạo experiment
          </Link>
        </p>
      </div>
    </div>
  )
}

function Detections({
  heading,
  src,
  width,
  height,
  boxes,
  side,
}: {
  heading: string
  src: string
  width: number
  height: number
  boxes: QuickTryBox[]
  side: 'clean' | 'attacked'
}) {
  const stroke = Math.max(2, width / 400)
  const font = Math.max(12, width / 70)
  return (
    <figure className="panel flex flex-col gap-3 p-4">
      <figcaption className="text-[14px] font-semibold">{heading}</figcaption>
      <div className="relative overflow-hidden rounded-lg bg-muted">
        <img src={src} alt={heading} className="block w-full" />
        <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 size-full" aria-hidden>
          {boxes.map((b, i) => {
            const tone = boxTone(side, b.matched)
            const st = TONE_STYLE[tone]
            const [x1, y1, x2, y2] = b.bbox
            const text = `${b.class_name} ${b.score.toFixed(2)}`
            const labelW = text.length * font * 0.58 + 8
            const ly = y1 - font - 6 < 0 ? y1 : y1 - font - 6
            return (
              <g key={i}>
                <rect
                  x={x1}
                  y={y1}
                  width={x2 - x1}
                  height={y2 - y1}
                  fill="none"
                  stroke={st.stroke}
                  strokeWidth={stroke}
                  strokeDasharray={st.dash ? `${stroke * 4} ${stroke * 2.5}` : undefined}
                />
                <rect x={x1} y={ly} width={labelW} height={font + 6} fill={st.stroke} />
                <text x={x1 + 4} y={ly + font + 1} fontSize={font} fontWeight={700} fill="#fff">
                  {text}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <ul className="flex flex-wrap gap-1.5 text-[12.5px]">
        {boxes.length === 0 ? (
          <li className="text-muted-foreground">Không nhận ra vật thể nào.</li>
        ) : (
          boxes.map((b, i) => {
            const st = TONE_STYLE[boxTone(side, b.matched)]
            return (
              <li
                key={i}
                className="rounded-full border px-2 py-0.5"
                style={{ borderColor: st.stroke }}
              >
                {b.class_name} {Math.round(b.score * 100)}%
                <span className="sr-only">, {st.label}</span>
              </li>
            )
          })
        )}
      </ul>
    </figure>
  )
}
