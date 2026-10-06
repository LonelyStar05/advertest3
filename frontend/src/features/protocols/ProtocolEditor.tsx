import { LayoutTemplate, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { ApiError } from '@/api/errors'
import { errorMessage } from '@/api/messages'
import { THRESHOLD_KIND_LABEL } from '@/components/charts/breakpoints'
import { FormAlert } from '@/components/FormAlert'
import { SelectField, TextareaField, TextField } from '@/components/form/TextField'
import { Button } from '@/components/ui/button'
import type { AttackSpec, ProtocolBody, ThresholdKind } from '@/contracts/api'
import { ChoiceCard, ToggleCard } from '@/features/wizard/ChoiceCard'
import { levelError, parseLevel, rangeText } from '@/features/wizard/levels'
import {
  ATTACK_EXPLAIN,
  ATTACK_KIND_LABEL,
  ATTACK_KINDS,
  ATTACK_PLAIN,
  attackLook,
  paramPlain,
  recommendedLevels,
} from '@/lib/attack-kinds'
import { cn } from '@/lib/utils'

import {
  type AttackRow,
  buildProtocol,
  type CriterionRow,
  EMPTY_CRITERION,
  formatLevels,
  formPath,
  isShownPath,
  parseLevels,
  type ProtocolForm,
} from './form'
import {
  attackRowFor,
  availableTemplates,
  criterionFor,
  formFromTemplate,
  type ProtocolTemplate,
} from './templates'

const CRITERION_KIND_LABEL = {
  max_drop_at_level: 'Mức sụt tối đa tại một level (quét lưới)',
  min_breaking_point: 'Điểm gãy tối thiểu (tìm ngưỡng)',
} as const

const TEMPLATE_TILE: Record<ProtocolTemplate['id'], string> = {
  quick: '[--tile-bg:#fce7f3] [--tile-fg:#be185d]',
  safety: '[--tile-bg:#dcfce7] [--tile-fg:#15803d]',
  weather: '[--tile-bg:#e0f2fe] [--tile-fg:#0369a1]',
}

function ThresholdOptions() {
  return (
    <>
      {(Object.keys(THRESHOLD_KIND_LABEL) as ThresholdKind[]).map((k) => (
        <option key={k} value={k}>
          {THRESHOLD_KIND_LABEL[k]}
        </option>
      ))}
    </>
  )
}

/** Hàng thẻ mẫu protocol; chọn một mẫu điền lại toàn bộ form. */
function TemplatePicker({
  templates,
  selected,
  onPick,
}: {
  templates: ProtocolTemplate[]
  selected: string | null
  onPick: (template: ProtocolTemplate) => void
}) {
  if (templates.length === 0) return null
  return (
    <section className="space-y-2" aria-labelledby="mau-protocol">
      <div className="flex items-center gap-2">
        <LayoutTemplate aria-hidden className="size-4 text-muted-foreground" />
        <h3 id="mau-protocol" className="font-semibold">
          Bắt đầu từ mẫu
        </h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Chọn một mẫu để điền sẵn cả form. Bạn vẫn sửa được mọi ô bên dưới.
      </p>
      <div
        role="radiogroup"
        aria-label="Mẫu protocol"
        className="grid gap-2 md:grid-cols-2 xl:grid-cols-3"
      >
        {templates.map((t) => {
          const Icon = attackLook({
            name: t.attacks[0].name,
            kind: t.id === 'weather' ? 'corruption' : 'attack',
          }).icon
          return (
            <ChoiceCard key={t.id} selected={selected === t.id} onSelect={() => onPick(t)}>
              <span className="flex items-center gap-2.5">
                <span className={cn('tile size-8', TEMPLATE_TILE[t.id])} aria-hidden>
                  <Icon className="size-4" />
                </span>
                <span className="font-semibold">{t.title}</span>
              </span>
              <span className="text-sm leading-5 text-muted-foreground">{t.description}</span>
              <ul className="mt-1 space-y-0.5 text-[13px] leading-5">
                {t.checks.map((c) => (
                  <li key={c} className="flex gap-1.5">
                    <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-current" />
                    {c}
                  </li>
                ))}
              </ul>
            </ChoiceCard>
          )
        })}
      </div>
    </section>
  )
}

/** Lưới thẻ attack của catalog theo nhóm: bấm để thêm/bỏ khỏi danh sách bắt buộc. */
function AttackPicker({
  specs,
  chosen,
  onToggle,
}: {
  specs: AttackSpec[]
  chosen: string[]
  onToggle: (spec: AttackSpec) => void
}) {
  return (
    <div className="space-y-3">
      {ATTACK_KINDS.map((kind) => {
        const list = specs.filter((s) => s.kind === kind)
        if (list.length === 0) return null
        return (
          <div key={kind} className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{ATTACK_KIND_LABEL[kind]}</p>
            <div className="grid gap-2 md:grid-cols-2">
              {list.map((spec) => {
                const { icon: Icon, tile } = attackLook(spec)
                const explain = ATTACK_EXPLAIN[spec.name]
                return (
                  <ToggleCard
                    key={spec.id}
                    pressed={chosen.includes(spec.name)}
                    onToggle={() => onToggle(spec)}
                    className="p-3"
                  >
                    <span className={cn('tile size-9', tile)} aria-hidden>
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-semibold">
                        {spec.name}{' '}
                        <span className="text-xs font-normal text-muted-foreground">
                          v{spec.version}
                        </span>
                      </span>
                      <span className="text-[13px] leading-5 text-muted-foreground">
                        {explain?.how ?? ATTACK_PLAIN[spec.name] ?? paramPlain(spec.primary_param)}
                      </span>
                      {explain && (
                        <span className="text-[13px] leading-5">
                          <span className="font-medium">Mô phỏng: </span>
                          {explain.risk}
                        </span>
                      )}
                    </span>
                  </ToggleCard>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Level bằng chip bật/tắt (giá trị khuyên dùng), thêm giá trị khác qua "Khác…". */
function LevelPicker({
  spec,
  value,
  error,
  idBase,
  onChange,
}: {
  spec: AttackSpec
  value: string
  error?: string
  idBase: string
  onChange: (levels: string) => void
}) {
  const param = spec.primary_param
  const levels = parseLevels(value)
  const options = [...new Set([...recommendedLevels(spec), ...levels])].sort((a, b) => a - b)
  const discrete = param.type === 'discrete' && Boolean(param.values)
  const [other, setOther] = useState(false)
  const [text, setText] = useState('')
  const [local, setLocal] = useState<string | null>(null)
  const inputId = `${idBase}-level-khac`
  const add = () => {
    const message = levelError(param, levels, text)
    if (message) return setLocal(message)
    onChange(formatLevels([...levels, parseLevel(text)]))
    setText('')
    setLocal(null)
    setOther(false)
  }
  const shown = local ?? error
  return (
    <div className="space-y-2">
      <p className="text-[14px] font-semibold" id={`${idBase}-level-nhan`}>
        Level bắt buộc
      </p>
      <div
        role="group"
        aria-labelledby={`${idBase}-level-nhan`}
        className="flex flex-wrap items-center gap-2"
      >
        {options.map((v) => {
          const on = levels.includes(v)
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(formatLevels(on ? levels.filter((l) => l !== v) : [...levels, v]))
              }
              className={cn(
                'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3.5 text-sm font-semibold tabular-nums transition-colors',
                on
                  ? 'border-navy bg-navy text-primary-foreground'
                  : 'border-line bg-surface-solid hover:border-input',
              )}
            >
              {v}
            </button>
          )
        })}
        {!discrete && !other && (
          <Button type="button" variant="ghost" onClick={() => setOther(true)}>
            Khác…
          </Button>
        )}
      </div>
      {other && (
        <div className="flex max-w-md flex-col gap-1.5">
          <label htmlFor={inputId} className="text-sm font-medium">
            Level khác ({rangeText(param)})
          </label>
          <div className="flex gap-2">
            <input
              id={inputId}
              autoFocus
              inputMode="decimal"
              value={text}
              aria-invalid={local ? true : undefined}
              onChange={(e) => {
                setText(e.target.value)
                setLocal(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  add()
                }
              }}
              className="min-h-11 w-full min-w-0 rounded-[10px] border border-input bg-field px-3.5 text-base outline-none focus-visible:border-violet focus-visible:ring-4 focus-visible:ring-violet/15 aria-invalid:border-destructive"
            />
            <Button type="button" variant="outline" onClick={add}>
              Thêm
            </Button>
          </div>
        </div>
      )}
      <p className="text-[13px] leading-5 text-muted-foreground">{paramPlain(param)}</p>
      {shown && (
        <p role="alert" className="text-sm text-destructive">
          {shown}
        </p>
      )}
    </div>
  )
}

function ModeSegment({
  spec,
  mode,
  onChange,
  error,
}: {
  spec: AttackSpec | undefined
  mode: AttackRow['mode']
  onChange: (mode: AttackRow['mode']) => void
  error?: string
}) {
  const noSearch = spec?.requires_training === true
  const options: [AttackRow['mode'], string, string][] = [
    ['grid', 'Quét lưới', 'Chạy đúng các level đã chọn.'],
    ['search', 'Tìm ngưỡng', 'Tự dò level làm model gãy.'],
  ]
  return (
    <div className="space-y-1.5">
      <div
        role="radiogroup"
        aria-label={`Chế độ của ${spec?.name ?? 'attack'}`}
        className="inline-flex flex-wrap gap-1 rounded-[12px] bg-muted p-1"
      >
        {options.map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            disabled={value === 'search' && noSearch}
            title={value === 'search' && noSearch ? 'Attack cần train patch chỉ quét lưới' : hint}
            onClick={() => onChange(value)}
            className={cn(
              'min-h-11 rounded-[9px] px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
              mode === value
                ? 'bg-surface-solid text-foreground shadow-[0_1px_3px_rgba(16,24,40,0.12)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-[13px] text-muted-foreground">
        {mode === 'grid'
          ? 'Quét lưới: chạy đúng các level đã chọn.'
          : 'Tìm ngưỡng: hệ thống tự dò level nhỏ nhất làm model gãy trong dải đã cho.'}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function AttackFields({
  row,
  index,
  spec,
  errors,
  onChange,
  onRemove,
}: {
  row: AttackRow
  index: number
  spec: AttackSpec | undefined
  errors: Record<string, string>
  onChange: (row: AttackRow) => void
  onRemove: () => void
}) {
  const id = `attack-${index}`
  const nameError = errors[`attacks.${index}.name`] ?? errors[`attacks.${index}`]
  const set = (patch: Partial<AttackRow>) => onChange({ ...row, ...patch })
  const look = spec ? attackLook(spec) : null
  const Icon = look?.icon
  return (
    <fieldset className="space-y-3 rounded-xl border border-line p-4">
      <legend className="sr-only">Attack {index + 1}</legend>
      <div className="flex items-start gap-3">
        {Icon && (
          <span className={cn('tile size-9', look.tile)} aria-hidden>
            <Icon className="size-[18px]" />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">{row.name || `Attack ${index + 1}`}</span>
          <span className="text-[13px] text-muted-foreground">
            {spec
              ? (ATTACK_PLAIN[spec.name] ?? rangeText(spec.primary_param))
              : 'Chọn attack trong catalog phía trên'}
          </span>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          <Trash2 aria-hidden="true" />
          Bỏ attack {index + 1}
        </Button>
      </div>
      {nameError && <FormAlert>{nameError}</FormAlert>}
      <ModeSegment
        spec={spec}
        mode={row.mode}
        error={errors[`attacks.${index}.mode`]}
        onChange={(mode) => {
          if (mode === 'search' && spec) {
            const defaults = attackRowFor(spec)
            set({
              mode,
              lo: row.lo || defaults.lo,
              hi: row.hi || defaults.hi,
              maxTol: row.maxTol || defaults.maxTol,
            })
          } else set({ mode })
        }}
      />
      {row.mode === 'grid' ? (
        spec ? (
          <LevelPicker
            spec={spec}
            idBase={id}
            value={row.levels}
            error={errors[`attacks.${index}.levels`]}
            onChange={(levels) => set({ levels })}
          />
        ) : null
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <SelectField
            id={`${id}-loai-nguong`}
            label="Loại ngưỡng"
            value={row.thresholdKind}
            onChange={(e) => set({ thresholdKind: e.target.value as ThresholdKind })}
          >
            <ThresholdOptions />
          </SelectField>
          <TextField
            id={`${id}-nguong`}
            label="Ngưỡng (%)"
            placeholder="30"
            hint="Mức sụt mAP coi là model gãy."
            inputMode="decimal"
            value={row.threshold}
            error={errors[`attacks.${index}.threshold`]}
            onChange={(e) => set({ threshold: e.target.value })}
          />
          <TextField
            id={`${id}-class`}
            label="Class (không bắt buộc)"
            placeholder="Bỏ trống để tính mọi class, ví dụ: car"
            value={row.classFilter}
            onChange={(e) => set({ classFilter: e.target.value })}
          />
          <TextField
            id={`${id}-bootstrap`}
            label="Số mẫu bootstrap tối thiểu"
            placeholder="200"
            inputMode="numeric"
            value={row.minBootstrap}
            error={errors[`attacks.${index}.minBootstrap`]}
            onChange={(e) => set({ minBootstrap: e.target.value })}
          />
          <TextField
            id={`${id}-lo`}
            label="Cận dưới (lo)"
            placeholder="Ví dụ: 1"
            inputMode="decimal"
            value={row.lo}
            error={errors[`attacks.${index}.lo`]}
            onChange={(e) => set({ lo: e.target.value })}
          />
          <TextField
            id={`${id}-hi`}
            label="Cận trên (hi)"
            placeholder="Ví dụ: 32"
            inputMode="decimal"
            value={row.hi}
            onChange={(e) => set({ hi: e.target.value })}
          />
          <TextField
            id={`${id}-tol`}
            label="Sai số tối đa (max_tol)"
            placeholder="Ví dụ: 1"
            inputMode="decimal"
            value={row.maxTol}
            error={errors[`attacks.${index}.maxTol`]}
            onChange={(e) => set({ maxTol: e.target.value })}
          />
        </div>
      )}
    </fieldset>
  )
}

function CriterionFields({
  row,
  index,
  attacks,
  errors,
  onChange,
  onRemove,
}: {
  row: CriterionRow
  index: number
  attacks: AttackRow[]
  errors: Record<string, string>
  onChange: (row: CriterionRow) => void
  onRemove: () => void
}) {
  const id = `tieu-chi-${index}`
  const err = (field: string) => errors[`criteria.${index}.${field}`]
  const set = (patch: Partial<CriterionRow>) => onChange({ ...row, ...patch })
  const grid = row.kind === 'max_drop_at_level'
  const attack = attacks.find((a) => a.name === row.attackName)
  const levelChoices = grid && attack?.mode === 'grid' ? parseLevels(attack.levels) : null
  return (
    <fieldset className="space-y-3 rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-medium">Tiêu chí {index + 1}</legend>
      {errors[`criteria.${index}`] && <FormAlert>{errors[`criteria.${index}`]}</FormAlert>}
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField
          id={`${id}-loai`}
          label="Loại tiêu chí"
          value={row.kind}
          error={err('kind')}
          onChange={(e) => set({ kind: e.target.value as CriterionRow['kind'] })}
        >
          {(Object.keys(CRITERION_KIND_LABEL) as CriterionRow['kind'][]).map((k) => (
            <option key={k} value={k}>
              {CRITERION_KIND_LABEL[k]}
            </option>
          ))}
        </SelectField>
        <SelectField
          id={`${id}-attack`}
          label="Attack"
          value={row.attackName}
          error={err('attackName')}
          onChange={(e) => set({ attackName: e.target.value })}
        >
          <option value="">Chọn…</option>
          {attacks
            .filter((a) => a.name)
            .map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
        </SelectField>
        {levelChoices ? (
          <SelectField
            id={`${id}-level`}
            label="Level"
            hint="Chọn trong các level bắt buộc của attack."
            value={row.level}
            error={err('level')}
            onChange={(e) => set({ level: e.target.value })}
          >
            <option value="">Chọn…</option>
            {[...new Set([...levelChoices.map(String), ...(row.level ? [row.level] : [])])].map(
              (l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ),
            )}
          </SelectField>
        ) : (
          <TextField
            id={`${id}-level`}
            label={grid ? 'Level' : 'Điểm gãy tối thiểu'}
            placeholder={grid ? 'Ví dụ: 8' : 'Ví dụ: 4'}
            hint={grid ? undefined : 'Model đạt nếu chỉ gãy ở level lớn hơn giá trị này.'}
            inputMode="decimal"
            value={row.level}
            error={err('level')}
            onChange={(e) => set({ level: e.target.value })}
          />
        )}
        {grid && (
          <>
            <SelectField
              id={`${id}-loai-nguong`}
              label="Loại ngưỡng"
              value={row.thresholdKind}
              onChange={(e) => set({ thresholdKind: e.target.value as ThresholdKind })}
            >
              <ThresholdOptions />
            </SelectField>
            <TextField
              id={`${id}-nguong`}
              label="Mức sụt tối đa (%)"
              placeholder="30"
              hint="Sụt quá mức này ở level trên thì model không đạt."
              inputMode="decimal"
              value={row.threshold}
              error={err('threshold')}
              onChange={(e) => set({ threshold: e.target.value })}
            />
            <TextField
              id={`${id}-class`}
              label="Class (không bắt buộc)"
              placeholder="Bỏ trống để tính mọi class"
              value={row.classFilter}
              onChange={(e) => set({ classFilter: e.target.value })}
            />
          </>
        )}
      </div>
      {!grid && (
        <p className="text-sm text-muted-foreground">
          Ngưỡng và class lấy theo cấu hình tìm ngưỡng của attack.
        </p>
      )}
      <Button type="button" variant="ghost" onClick={onRemove}>
        <Trash2 aria-hidden="true" />
        Bỏ tiêu chí {index + 1}
      </Button>
    </fieldset>
  )
}

/** Tiêu chí của attack đổi chế độ: loại tiêu chí không còn hợp thì thay bằng tiêu chí mặc định. */
function syncCriteria(criteria: CriterionRow[], attack: AttackRow): CriterionRow[] {
  const want = attack.mode === 'grid' ? 'max_drop_at_level' : 'min_breaking_point'
  return criteria.map((c) =>
    c.attackName === attack.name && c.kind !== want ? criterionFor(attack) : c,
  )
}

/**
 * Form protocol (plan task 30). `lockName` khi tạo version mới: tên giữ nguyên. Lỗi 422 của
 * server hiện tại đúng trường khi ánh xạ được, còn lại hiện ở đầu form. `initialTemplate`: mẫu
 * đã điền sẵn (hàng mẫu chỉ hiện khi tạo protocol mới).
 */
export function ProtocolEditor({
  initial,
  initialTemplate = null,
  lockName = false,
  specs,
  pending,
  error,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ProtocolForm
  initialTemplate?: string | null
  lockName?: boolean
  specs: AttackSpec[]
  pending: boolean
  error: unknown
  submitLabel: string
  onSubmit: (name: string, body: ProtocolBody) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<ProtocolForm>(initial)
  const [template, setTemplate] = useState<string | null>(initialTemplate)
  const [local, setLocal] = useState<Record<string, string>>({})
  const fields = error instanceof ApiError ? error.fields : []
  const server = Object.fromEntries(
    fields.map((f) => [formPath(f.path), f.message]).filter(([path]) => isShownPath(path)),
  )
  const unplaced = fields.filter((f) => !isShownPath(formPath(f.path))).map((f) => f.message)
  const errors = { ...server, ...local }
  const set = (patch: Partial<ProtocolForm>) => setForm((f) => ({ ...f, ...patch }))
  const setAttack = (i: number, row: AttackRow) =>
    setForm((f) => ({
      ...f,
      attacks: f.attacks.map((a, j) => (j === i ? row : a)),
      criteria: row.mode !== f.attacks[i]?.mode ? syncCriteria(f.criteria, row) : f.criteria,
    }))
  const removeAttack = (i: number) =>
    setForm((f) => ({
      ...f,
      attacks: f.attacks.filter((_, j) => j !== i),
      criteria: f.criteria.filter((c) => c.attackName !== f.attacks[i]?.name || !c.attackName),
    }))
  const toggleSpec = (spec: AttackSpec) => {
    const i = form.attacks.findIndex((a) => a.name === spec.name)
    if (i >= 0) return removeAttack(i)
    const row = attackRowFor(spec)
    setForm((f) => ({
      ...f,
      attacks: [...f.attacks, row],
      criteria: [...f.criteria, criterionFor(row)],
    }))
  }
  const setCriterion = (i: number, row: CriterionRow) =>
    set({ criteria: form.criteria.map((c, j) => (j === i ? row : c)) })
  const nextCriterion = (): CriterionRow => {
    const free = form.attacks.find(
      (a) => a.name && !form.criteria.some((c) => c.attackName === a.name),
    )
    const target = free ?? form.attacks.find((a) => a.name)
    return target ? criterionFor(target) : { ...EMPTY_CRITERION }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const result = buildProtocol(form, specs)
    if (!result.ok) {
      setLocal(result.errors)
      return
    }
    setLocal({})
    onSubmit(result.name, result.body)
  }

  const templates = lockName ? [] : availableTemplates(specs)

  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      {error !== null && error !== undefined && fields.length === 0 && (
        <FormAlert>{errorMessage(error)}</FormAlert>
      )}
      {unplaced.length > 0 && (
        <FormAlert>
          <ul>
            {unplaced.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </FormAlert>
      )}
      {Object.keys(local).length > 0 && (
        <FormAlert>Còn {Object.keys(local).length} trường chưa hợp lệ.</FormAlert>
      )}
      <TemplatePicker
        templates={templates}
        selected={template}
        onPick={(t) => {
          setTemplate(t.id)
          setForm(formFromTemplate(t, specs))
          setLocal({})
        }}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField
          id="protocol-ten"
          label="Tên protocol"
          placeholder="Ví dụ: KITTI xe con, ban ngày"
          value={form.name}
          disabled={lockName}
          error={errors.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            id="protocol-slice"
            label="Kích thước slice tối thiểu"
            placeholder="20"
            hint="Slice nhỏ hơn không gửi duyệt được."
            inputMode="numeric"
            value={form.minSliceSize}
            error={errors.minSliceSize}
            onChange={(e) => set({ minSliceSize: e.target.value })}
          />
          <TextField
            id="protocol-so-case"
            label="Số case bắt buộc review mỗi attack"
            placeholder="3"
            hint="Reviewer xem đủ mới chấp nhận được."
            inputMode="numeric"
            value={form.casesPerAttack}
            error={errors.casesPerAttack}
            onChange={(e) => set({ casesPerAttack: e.target.value })}
          />
        </div>
      </div>
      <TextareaField
        id="protocol-mo-ta"
        label="Mục đích"
        placeholder="Protocol này kiểm định điều gì, cho model nào, trước mốc nào. Ví dụ: chặn phát hành YOLOv8 nếu sụt quá 30% mAP ở PGD eps 8."
        value={form.description}
        error={errors.description}
        onChange={(e) => set({ description: e.target.value })}
      />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-5"
          checked={form.forbidDirty}
          onChange={(e) => set({ forbidDirty: e.target.checked })}
        />
        Không chấp nhận run chạy từ code chưa commit
      </label>

      <section className="space-y-3" aria-label="Attack bắt buộc">
        <div>
          <h3 className="font-semibold">Attack bắt buộc</h3>
          <p className="text-sm text-muted-foreground">
            Bấm thẻ để thêm hoặc bỏ. Mỗi thẻ nói attack làm gì với ảnh và mô phỏng rủi ro nào ngoài
            đời.
          </p>
        </div>
        {errors.attacks && <FormAlert>{errors.attacks}</FormAlert>}
        <AttackPicker
          specs={specs}
          chosen={form.attacks.map((a) => a.name)}
          onToggle={toggleSpec}
        />
        {form.attacks.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Cấu hình {form.attacks.length} attack đã chọn</p>
            {form.attacks.map((row, i) => (
              <AttackFields
                key={`${row.name}-${i}`}
                row={row}
                index={i}
                spec={specs.find((s) => s.name === row.name)}
                errors={errors}
                onChange={(next) => setAttack(i, next)}
                onRemove={() => removeAttack(i)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2" aria-label="Tiêu chí đạt">
        <h3 className="font-semibold">Tiêu chí đạt</h3>
        <p className="text-sm text-muted-foreground">
          Tiêu chí quyết định kết luận model đạt hay không; reviewer vẫn xem lại trước khi chấp nhận
          bài test.
        </p>
        {errors.criteria && <FormAlert>{errors.criteria}</FormAlert>}
        {form.criteria.map((row, i) => (
          <CriterionFields
            key={i}
            row={row}
            index={i}
            attacks={form.attacks}
            errors={errors}
            onChange={(next) => setCriterion(i, next)}
            onRemove={() => set({ criteria: form.criteria.filter((_, j) => j !== i) })}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => set({ criteria: [...form.criteria, nextCriterion()] })}
        >
          <Plus aria-hidden="true" />
          Thêm tiêu chí
        </Button>
      </section>

      <div className="flex flex-col gap-2 border-t border-line pt-4 md:flex-row">
        <Button type="submit" disabled={pending}>
          {pending ? 'Đang lưu…' : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </form>
  )
}
