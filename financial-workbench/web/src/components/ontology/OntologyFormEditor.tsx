import { useEffect, useState, type ReactNode } from 'react'
import { api, errorMessage } from '../../api/client'
import type { OntologyDefinition, OntologyPreview, OntologyVersionSummary, PropertyDef, PropertyType } from '../../api/types'
import { useApp } from '../../context'
import {
  CODE_READ_KEYS,
  NODE_SHAPES,
  addClaimPredicate,
  addNodeType,
  addProperty,
  addRelationshipType,
  applyRemoved,
  keyError,
  sentenceError,
  toDefinition,
  toggleRemoved,
  updateClaimPredicate,
  updateNodeType,
  updateProperty,
  updateRelationshipType,
} from '../../lib/ontologyDraft'
import type { OntologyDraft } from '../../lib/ontologyEdit'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import { OntologyPreviewPanel } from './OntologyPreviewPanel'

interface Props {
  draft: OntologyDraft | null
  onDraftChange: (draft: OntologyDraft | null) => void
  /** GET /api/ontology 를 다시 받아 화면의 온톨로지를 바꾼다 */
  reloadOntology: () => Promise<void>
  /** 저장이 끝났다. 탭이 초안을 지우고 보기 화면으로 돌아간다 */
  onSaved: (saved: OntologyVersionSummary) => void
  /** 초안을 버린 뒤 보기 화면으로 돌아간다 */
  onClose: () => void
  /** YAML 편집기로 옮긴다 */
  onOpenYaml: () => void
}

const PROPERTY_TYPES: PropertyType[] = ['string', 'text', 'url', 'enum', 'date', 'datetime', 'number', 'integer', 'boolean']
const DEFAULT_COLOR = '#64748b'

/** 폼이 고치는 한 줄이 쓰는 도구 */
interface FormContext {
  def: OntologyDefinition
  removed: string[]
  /** 뺄 예정을 적용한 정의. 타입이 빠져 시작과 끝이 비는지 보는 데 쓴다 */
  effective: OntologyDefinition
  /** 폼에서 고를 수 있는 노드 타입 키. Claim 은 없다 */
  typeKeys: string[]
  change: (def: OntologyDefinition) => void
  toggle: (path: string) => void
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1 text-xs text-muted-foreground', className)}>
      {label}
      {children}
    </label>
  )
}

function FieldError({ message }: { message: string | null }) {
  return message ? (
    <p className="m-0 text-xs text-destructive" data-testid="ontology-form-error">
      {message}
    </p>
  ) : null
}

/** 빼기와 되살리기. 빠질 행은 흐려지고 배지가 붙는다 */
function RemoveControl({ ctx, path, lockedReason }: { ctx: FormContext; path: string; lockedReason?: string | null }) {
  if (ctx.removed.includes(path)) {
    return (
      <span className="flex items-center gap-2">
        <Badge variant="outline">뺄 예정</Badge>
        <Button type="button" size="sm" variant="outline" data-testid="ontology-form-restore" onClick={() => ctx.toggle(path)}>
          되살리기
        </Button>
      </span>
    )
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      data-testid="ontology-form-remove"
      disabled={Boolean(lockedReason)}
      title={lockedReason ?? undefined}
      onClick={() => ctx.toggle(path)}
    >
      빼기
    </Button>
  )
}

function TypeChecks({ ctx, selected, onChange, label }: { ctx: FormContext; selected: string[]; onChange: (types: string[]) => void; label: string }) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="p-0 text-xs text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {ctx.typeKeys.map((type) => (
          <label key={type} className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(type)}
              onChange={(e) => onChange(e.target.checked ? [...selected, type] : selected.filter((t) => t !== type))}
            />
            {type}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** 키 입력칸과 그 아래 오류. 비어 있을 때는 오류를 보이지 않고 더하기만 막는다 */
function KeyInput({ value, onChange, error, label }: { value: string; onChange: (v: string) => void; error: string | null; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Field label={label}>
        <Input data-testid="ontology-form-new-key" value={value} onChange={(e) => onChange(e.target.value.trim())} aria-invalid={Boolean(value && error)} />
      </Field>
      <FieldError message={value ? error : null} />
    </div>
  )
}

function numberOrUndefined(text: string): number | undefined {
  const n = Number(text)
  return text.trim() === '' || Number.isNaN(n) ? undefined : n
}

function EnumValues({ ctx, type, propKey, prop }: { ctx: FormContext; type: string; propKey: string; prop: PropertyDef }) {
  const [value, setValue] = useState('')
  const [label, setLabel] = useState('')
  const values = prop.values ?? []
  const valueError = value && values.includes(value) ? '이미 있는 값입니다' : null
  return (
    <div className="flex flex-col gap-2">
      {values.map((v) => (
        <div key={v} className="flex flex-wrap items-end gap-2" data-testid="ontology-form-enum-value" data-value={v}>
          <span className="font-mono text-xs">{v}</span>
          <Field label="표시 이름" className="min-w-40 flex-1">
            <Input
              value={prop.valueLabels?.[v] ?? ''}
              onChange={(e) => {
                const next = { ...prop.valueLabels, [v]: e.target.value }
                if (e.target.value === '') delete next[v]
                ctx.change(updateProperty(ctx.def, type, propKey, { valueLabels: next }))
              }}
            />
          </Field>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={values.length <= 1}
            title={values.length <= 1 ? 'enum 에는 값이 하나 이상 있어야 합니다' : undefined}
            onClick={() => ctx.change(updateProperty(ctx.def, type, propKey, { values: values.filter((x) => x !== v) }))}
          >
            값 빼기
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="새 값" className="min-w-32 flex-1">
          <Input value={value} onChange={(e) => setValue(e.target.value.trim())} />
        </Field>
        <Field label="표시 이름" className="min-w-32 flex-1">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!value || Boolean(valueError)}
          onClick={() => {
            const next = updateProperty(ctx.def, type, propKey, { values: [...values, value] })
            ctx.change(label ? updateProperty(next, type, propKey, { valueLabels: { ...prop.valueLabels, [value]: label } }) : next)
            setValue('')
            setLabel('')
          }}
        >
          값 더하기
        </Button>
      </div>
      <FieldError message={valueError} />
    </div>
  )
}

function PropertyRow({ ctx, type, propKey }: { ctx: FormContext; type: string; propKey: string }) {
  const node = ctx.def.nodeTypes[type]
  const prop = node.properties[propKey]
  const path = `nodeTypes.${type}.properties.${propKey}`
  const lockedReason =
    node.labelProperty === propKey
      ? '라벨 속성이라 뺄 수 없고 필수를 바꿀 수 없습니다'
      : CODE_READ_KEYS[type]?.includes(propKey)
        ? '서버 코드가 읽는 속성이라 뺄 수 없고 필수를 바꿀 수 없습니다'
        : null
  const patch = (p: Parameters<typeof updateProperty>[3]) => ctx.change(updateProperty(ctx.def, type, propKey, p))
  const gone = ctx.removed.includes(path)
  return (
    <div className={cn('rounded-md border p-2', gone && 'opacity-50')} data-testid="ontology-form-prop" data-prop={propKey}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-bold">{propKey}</span>
        <span className="text-xs text-muted-foreground">{prop.type}</span>
        <label className="flex items-center gap-1 text-sm" title={lockedReason ?? undefined}>
          <input
            type="checkbox"
            data-testid="ontology-form-required"
            checked={prop.required}
            disabled={Boolean(lockedReason)}
            onChange={(e) => patch({ required: e.target.checked })}
          />
          필수
        </label>
        <span className="ml-auto">
          <RemoveControl ctx={ctx} path={path} lockedReason={lockedReason} />
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Field label="표시 이름" className="min-w-40 flex-1">
          <Input value={prop.label ?? ''} onChange={(e) => patch({ label: e.target.value || undefined })} />
        </Field>
        <Field label="설명" className="min-w-40 flex-[2]">
          <Input value={prop.description ?? ''} onChange={(e) => patch({ description: e.target.value || undefined })} />
        </Field>
        {(prop.type === 'string' || prop.type === 'text' || prop.type === 'url') && (
          <Field label="최대 길이" className="w-28">
            <Input type="number" min={1} value={prop.maxLength ?? ''} onChange={(e) => patch({ maxLength: numberOrUndefined(e.target.value) })} />
          </Field>
        )}
        {(prop.type === 'number' || prop.type === 'integer') && (
          <>
            <Field label="최솟값" className="w-28">
              <Input type="number" value={prop.min ?? ''} onChange={(e) => patch({ min: numberOrUndefined(e.target.value) })} />
            </Field>
            <Field label="최댓값" className="w-28">
              <Input type="number" value={prop.max ?? ''} onChange={(e) => patch({ max: numberOrUndefined(e.target.value) })} />
            </Field>
          </>
        )}
      </div>
      {prop.type === 'enum' && (
        <div className="mt-2">
          <EnumValues ctx={ctx} type={type} propKey={propKey} prop={prop} />
        </div>
      )}
    </div>
  )
}

function AddPropertyPanel({ ctx, type }: { ctx: FormContext; type: string }) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [valueType, setValueType] = useState<PropertyType>('string')
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [required, setRequired] = useState(false)
  const [values, setValues] = useState('')
  const enumValues = [...new Set(values.split(',').map((v) => v.trim()).filter(Boolean))]
  const error = keyError('property', key, Object.keys(ctx.def.nodeTypes[type].properties))
  const ready = key !== '' && !error && (valueType !== 'enum' || enumValues.length > 0)

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" data-testid="ontology-form-prop-add" onClick={() => setOpen(true)}>
        속성 더하기
      </Button>
    )
  }
  const submit = () => {
    const prop: PropertyDef = {
      type: valueType,
      label: label || undefined,
      description: description || undefined,
      required,
      values: valueType === 'enum' ? enumValues : undefined,
    }
    ctx.change(addProperty(ctx.def, type, key, prop))
    setOpen(false)
    setKey('')
    setLabel('')
    setDescription('')
    setRequired(false)
    setValues('')
    setValueType('string')
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-2" data-testid="ontology-form-new">
      <div className="flex flex-wrap gap-2">
        <KeyInput label="속성 키" value={key} onChange={setKey} error={error} />
        <Field label="값 타입">
          <NativeSelect data-testid="ontology-form-new-type" value={valueType} onChange={(e) => setValueType(e.target.value as PropertyType)}>
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="표시 이름" className="min-w-32 flex-1">
          <Input data-testid="ontology-form-new-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="설명" className="min-w-40 flex-[2]">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
      {valueType === 'enum' && (
        <Field label="값(쉼표로 구분)">
          <Input data-testid="ontology-form-new-values" value={values} onChange={(e) => setValues(e.target.value)} />
        </Field>
      )}
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        필수
      </label>
      <div className="flex gap-2">
        <Button type="button" size="sm" data-testid="ontology-form-new-submit" disabled={!ready} onClick={submit}>
          더하기
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          취소
        </Button>
      </div>
    </div>
  )
}

function NodeTypeCard({ ctx, type }: { ctx: FormContext; type: string }) {
  const node = ctx.def.nodeTypes[type]
  const path = `nodeTypes.${type}`
  const gone = ctx.removed.includes(path)
  const lockedReason = CODE_READ_KEYS[type] ? '서버 코드가 읽는 타입이라 뺄 수 없습니다' : null
  const display = node.display ?? {}
  return (
    <section className={cn('mb-3 rounded-md border p-3', gone && 'opacity-50')} data-testid="ontology-form-type" data-type={type}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="m-0 font-mono text-sm font-bold">{type}</h4>
        <span className="ml-auto">
          <RemoveControl ctx={ctx} path={path} lockedReason={lockedReason} />
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Field label="표시 이름" className="min-w-40 flex-1">
          <Input
            data-testid="ontology-form-type-label"
            value={node.label ?? ''}
            onChange={(e) => ctx.change(updateNodeType(ctx.def, type, { label: e.target.value || undefined }))}
          />
        </Field>
        <Field label="설명" className="min-w-40 flex-[2]">
          <Input value={node.description} onChange={(e) => ctx.change(updateNodeType(ctx.def, type, { description: e.target.value }))} />
        </Field>
        <Field label="색" className="w-20">
          <Input
            type="color"
            className="p-1"
            value={display.color ?? DEFAULT_COLOR}
            onChange={(e) => ctx.change(updateNodeType(ctx.def, type, { display: { ...display, color: e.target.value } }))}
          />
        </Field>
        <Field label="모양">
          <NativeSelect
            value={display.shape ?? ''}
            onChange={(e) => ctx.change(updateNodeType(ctx.def, type, { display: { ...display, shape: e.target.value || undefined } }))}
          >
            <option value="">(기본)</option>
            {NODE_SHAPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <p className="mb-1 mt-3 text-xs font-bold">속성</p>
      <div className="flex flex-col gap-2">
        {Object.keys(node.properties).map((propKey) => (
          <PropertyRow key={propKey} ctx={ctx} type={type} propKey={propKey} />
        ))}
        <div>
          <AddPropertyPanel ctx={ctx} type={type} />
        </div>
      </div>
    </section>
  )
}

function AddNodeTypePanel({ ctx }: { ctx: FormContext }) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [labelProperty, setLabelProperty] = useState('name')
  const [labelPropertyLabel, setLabelPropertyLabel] = useState('이름')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [shape, setShape] = useState('ellipse')
  const error = keyError('nodeType', key, Object.keys(ctx.def.nodeTypes))
  const propError = keyError('property', labelProperty)
  const ready = key !== '' && !error && label.trim() !== '' && !propError

  if (!open) {
    return (
      <Button type="button" variant="outline" data-testid="ontology-form-type-add" onClick={() => setOpen(true)}>
        노드 타입 더하기
      </Button>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-3" data-testid="ontology-form-new">
      <div className="flex flex-wrap gap-2">
        <KeyInput label="타입 키" value={key} onChange={setKey} error={error} />
        <Field label="표시 이름" className="min-w-32 flex-1">
          <Input data-testid="ontology-form-new-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="설명" className="min-w-40 flex-[2]">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Field label="라벨 속성 키">
            <Input value={labelProperty} onChange={(e) => setLabelProperty(e.target.value.trim())} />
          </Field>
          <FieldError message={propError} />
        </div>
        <Field label="라벨 속성 표시 이름" className="min-w-32 flex-1">
          <Input value={labelPropertyLabel} onChange={(e) => setLabelPropertyLabel(e.target.value)} />
        </Field>
        <Field label="색" className="w-20">
          <Input type="color" className="p-1" value={color} onChange={(e) => setColor(e.target.value)} />
        </Field>
        <Field label="모양">
          <NativeSelect value={shape} onChange={(e) => setShape(e.target.value)}>
            {NODE_SHAPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          data-testid="ontology-form-new-submit"
          disabled={!ready}
          onClick={() => {
            ctx.change(addNodeType(ctx.def, key, { label: label.trim(), description, labelProperty, labelPropertyLabel, color, shape }))
            setOpen(false)
            setKey('')
            setLabel('')
            setDescription('')
          }}
        >
          더하기
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          취소
        </Button>
      </div>
    </div>
  )
}

/** 노드 타입을 빼서 이 종류가 쓸 수 없게 됐다는 안내 */
function EmptiedWarning({ show }: { show: boolean }) {
  return show ? (
    <p className="m-0 mt-1 text-xs text-destructive" data-testid="ontology-form-emptied">
      이 종류도 함께 빼야 합니다
    </p>
  ) : null
}

function RelationshipRow({ ctx, relKey }: { ctx: FormContext; relKey: string }) {
  const rel = ctx.def.relationshipTypes[relKey]
  const now = ctx.effective.relationshipTypes[relKey]
  const path = `relationshipTypes.${relKey}`
  const emptied = rel.from.length + rel.to.length > 0 && now.from.length === 0 && now.to.length === 0
  const patch = (p: Parameters<typeof updateRelationshipType>[2]) => ctx.change(updateRelationshipType(ctx.def, relKey, p))
  return (
    <div className={cn('mb-2 rounded-md border p-2', ctx.removed.includes(path) && 'opacity-50')} data-testid="ontology-form-rel" data-rel={relKey}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-bold">{relKey}</span>
        <span className="ml-auto">
          <RemoveControl ctx={ctx} path={path} />
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Field label="표시 이름" className="min-w-40 flex-1">
          <Input value={rel.label ?? ''} onChange={(e) => patch({ label: e.target.value || undefined })} />
        </Field>
        <Field label="설명" className="min-w-40 flex-[2]">
          <Input value={rel.description} onChange={(e) => patch({ description: e.target.value })} />
        </Field>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        <TypeChecks ctx={ctx} label="시작 타입" selected={rel.from} onChange={(from) => patch({ from })} />
        <TypeChecks ctx={ctx} label="끝 타입" selected={rel.to} onChange={(to) => patch({ to })} />
      </div>
      <EmptiedWarning show={emptied} />
    </div>
  )
}

function AddRelationshipPanel({ ctx }: { ctx: FormContext }) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [from, setFrom] = useState<string[]>([])
  const [to, setTo] = useState<string[]>([])
  const error = keyError('relationshipType', key, Object.keys(ctx.def.relationshipTypes))
  const ready = key !== '' && !error && from.length > 0 && to.length > 0

  if (!open) {
    return (
      <Button type="button" variant="outline" data-testid="ontology-form-rel-add" onClick={() => setOpen(true)}>
        관계 종류 더하기
      </Button>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-3" data-testid="ontology-form-new">
      <div className="flex flex-wrap gap-2">
        <KeyInput label="관계 종류 키" value={key} onChange={setKey} error={error} />
        <Field label="표시 이름" className="min-w-32 flex-1">
          <Input data-testid="ontology-form-new-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="설명" className="min-w-40 flex-[2]">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
      <TypeChecks ctx={ctx} label="시작 타입" selected={from} onChange={setFrom} />
      <TypeChecks ctx={ctx} label="끝 타입" selected={to} onChange={setTo} />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          data-testid="ontology-form-new-submit"
          disabled={!ready}
          onClick={() => {
            ctx.change(addRelationshipType(ctx.def, key, { label, description, from, to }))
            setOpen(false)
            setKey('')
            setLabel('')
            setDescription('')
            setFrom([])
            setTo([])
          }}
        >
          더하기
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          취소
        </Button>
      </div>
    </div>
  )
}

function PredicateRow({ ctx, predicateKey }: { ctx: FormContext; predicateKey: string }) {
  const predicate = ctx.def.claimPredicates[predicateKey]
  const now = ctx.effective.claimPredicates[predicateKey]
  const path = `claimPredicates.${predicateKey}`
  const emptied =
    (predicate.subjectTypes.length > 0 && now.subjectTypes.length === 0) || (predicate.objectTypes.length > 0 && now.objectTypes.length === 0)
  const patch = (p: Parameters<typeof updateClaimPredicate>[2]) => ctx.change(updateClaimPredicate(ctx.def, predicateKey, p))
  const sentence = predicate.sentence ?? ''
  return (
    <div className={cn('mb-2 rounded-md border p-2', ctx.removed.includes(path) && 'opacity-50')} data-testid="ontology-form-predicate" data-predicate={predicateKey}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-bold">{predicateKey}</span>
        <span className="ml-auto">
          <RemoveControl ctx={ctx} path={path} />
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Field label="표시 이름" className="min-w-40 flex-1">
          <Input value={predicate.label ?? ''} onChange={(e) => patch({ label: e.target.value || undefined })} />
        </Field>
        <Field label="문장 틀" className="min-w-48 flex-[2]">
          <Input value={sentence} onChange={(e) => patch({ sentence: e.target.value || undefined })} />
        </Field>
        <Field label="설명" className="min-w-40 flex-[2]">
          <Input value={predicate.description} onChange={(e) => patch({ description: e.target.value })} />
        </Field>
      </div>
      <FieldError message={sentence ? sentenceError(sentence) : null} />
      <div className="mt-2 flex flex-col gap-2">
        <TypeChecks ctx={ctx} label="주체 타입" selected={predicate.subjectTypes} onChange={(subjectTypes) => patch({ subjectTypes })} />
        <TypeChecks ctx={ctx} label="대상 타입" selected={predicate.objectTypes} onChange={(objectTypes) => patch({ objectTypes })} />
      </div>
      <EmptiedWarning show={emptied} />
    </div>
  )
}

function AddPredicatePanel({ ctx }: { ctx: FormContext }) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [sentence, setSentence] = useState('')
  const [description, setDescription] = useState('')
  const [subjectTypes, setSubjectTypes] = useState<string[]>([])
  const [objectTypes, setObjectTypes] = useState<string[]>([])
  const error = keyError('claimPredicate', key, Object.keys(ctx.def.claimPredicates))
  const sError = sentence ? sentenceError(sentence) : null
  const ready = key !== '' && !error && sentence !== '' && !sError && subjectTypes.length > 0 && objectTypes.length > 0

  if (!open) {
    return (
      <Button type="button" variant="outline" data-testid="ontology-form-predicate-add" onClick={() => setOpen(true)}>
        주장 종류 더하기
      </Button>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-3" data-testid="ontology-form-new">
      <div className="flex flex-wrap gap-2">
        <KeyInput label="주장 종류 키" value={key} onChange={setKey} error={error} />
        <Field label="표시 이름" className="min-w-32 flex-1">
          <Input data-testid="ontology-form-new-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
      </div>
      <Field label="문장 틀(예: {subject}이(가) {object}에 공급한다)">
        <Input data-testid="ontology-form-new-sentence" value={sentence} onChange={(e) => setSentence(e.target.value)} />
      </Field>
      <FieldError message={sError} />
      <Field label="설명">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <TypeChecks ctx={ctx} label="주체 타입" selected={subjectTypes} onChange={setSubjectTypes} />
      <TypeChecks ctx={ctx} label="대상 타입" selected={objectTypes} onChange={setObjectTypes} />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          data-testid="ontology-form-new-submit"
          disabled={!ready}
          onClick={() => {
            ctx.change(addClaimPredicate(ctx.def, key, { label, sentence, description, subjectTypes, objectTypes }))
            setOpen(false)
            setKey('')
            setLabel('')
            setSentence('')
            setDescription('')
            setSubjectTypes([])
            setObjectTypes([])
          }}
        >
          더하기
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          취소
        </Button>
      </div>
    </div>
  )
}

export function OntologyFormEditor({ draft, onDraftChange, reloadOntology, onSaved, onClose, onOpenYaml }: Props) {
  const { ontology } = useApp()
  const [convertErrors, setConvertErrors] = useState<string[] | null>(null)
  const [preview, setPreview] = useState<OntologyPreview | null>(null)
  /** 미리보기에 보낸 정의. 저장 요청에도 이 정의를 그대로 쓴다 */
  const [sent, setSent] = useState<OntologyDefinition | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 초안이 없으면 지금 온톨로지로 만들고, YAML 초안이면 미리보기 API 가 정리한 정의로 바꾼다.
  useEffect(() => {
    if (!draft) {
      onDraftChange({ baseVersion: ontology.version, source: 'form', yaml: null, definition: toDefinition(ontology), removed: [], dirty: false })
      return
    }
    if (draft.source !== 'yaml' || draft.yaml === null) return
    let live = true
    setConvertErrors(null)
    api.ontology
      .preview({ baseVersion: draft.baseVersion, yaml: draft.yaml })
      .then((p) => {
        if (!live) return
        if (p.definition) onDraftChange({ baseVersion: draft.baseVersion, source: 'form', yaml: null, definition: p.definition, removed: [], dirty: draft.dirty })
        else setConvertErrors(p.errors)
      })
      .catch((e) => live && setConvertErrors([errorMessage(e)]))
    return () => {
      live = false
    }
  }, [draft, ontology, onDraftChange])

  if (convertErrors && draft?.source === 'yaml') {
    return (
      <Alert role={undefined} variant="destructive" data-testid="ontology-form-convert-error">
        <AlertDescription>
          <p className="m-0 font-bold">YAML 에 오류가 있어 폼으로 옮기지 못했습니다</p>
          <ul className="m-0 list-disc pl-5">
            {convertErrors.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
          <Button type="button" variant="outline" size="sm" className="mt-2" data-testid="ontology-form-back-to-yaml" onClick={onOpenYaml}>
            YAML 로 돌아가기
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  if (!draft || draft.source !== 'form' || !draft.definition) {
    return <div className="p-6 text-center text-muted-foreground">폼을 준비하는 중…</div>
  }

  const def = draft.definition
  const effective = applyRemoved(def, draft.removed)
  const ctx: FormContext = {
    def,
    removed: draft.removed,
    effective,
    typeKeys: Object.entries(def.nodeTypes)
      .filter(([, t]) => !t.managedBy)
      .map(([k]) => k),
    change: (next) => {
      setPreview(null)
      onDraftChange({ ...draft, definition: next, dirty: true })
    },
    toggle: (path) => {
      setPreview(null)
      onDraftChange({ ...draft, removed: toggleRemoved(draft.removed, path), dirty: true })
    },
  }

  const request = async (): Promise<{ sentDefinition: OntologyDefinition; result: OntologyPreview } | null> => {
    setBusy(true)
    setPreviewError(null)
    try {
      const sentDefinition = applyRemoved(def, draft.removed)
      return { sentDefinition, result: await api.ontology.preview({ baseVersion: draft.baseVersion, definition: sentDefinition }) }
    } catch (e) {
      setPreview(null)
      setPreviewError(errorMessage(e))
      return null
    } finally {
      setBusy(false)
    }
  }

  const runPreview = async () => {
    const response = await request()
    if (!response) return
    setSent(response.sentDefinition)
    setPreview(response.result)
  }

  const toYaml = async () => {
    const response = await request()
    if (!response) return
    const { yaml, errors } = response.result
    if (yaml === null) {
      setPreviewError(`YAML 로 옮기지 못했습니다: ${errors.join(', ')}`)
      return
    }
    onDraftChange({ baseVersion: draft.baseVersion, source: 'yaml', yaml, definition: null, removed: [], dirty: draft.dirty })
    onOpenYaml()
  }

  const restart = async () => {
    setPreview(null)
    await reloadOntology()
    onDraftChange(null)
  }

  const rebase = (currentVersion: number) => {
    onDraftChange({ ...draft, baseVersion: currentVersion })
    void (async () => {
      setBusy(true)
      try {
        const body = sent ?? applyRemoved(def, draft.removed)
        setPreview(await api.ontology.preview({ baseVersion: currentVersion, definition: body }))
      } catch (e) {
        setPreview(null)
        setPreviewError(errorMessage(e))
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <div data-testid="ontology-form">
      <p className="mb-3 mt-0 text-sm text-muted-foreground">
        버전 {draft.baseVersion} 에서 시작한 초안입니다. 그 밖의 항목(검색 속성, 힌트 속성, enum 예전 표기 등)은 YAML 편집기에서 고칩니다.
      </p>

      <h3 className="mb-2 mt-4 text-[15px] font-bold">노드 타입</h3>
      {ctx.typeKeys.map((type) => (
        <NodeTypeCard key={type} ctx={ctx} type={type} />
      ))}
      <AddNodeTypePanel ctx={ctx} />

      <h3 className="mb-2 mt-6 text-[15px] font-bold">관계 종류</h3>
      {Object.keys(def.relationshipTypes).map((key) => (
        <RelationshipRow key={key} ctx={ctx} relKey={key} />
      ))}
      <AddRelationshipPanel ctx={ctx} />

      <h3 className="mb-2 mt-6 text-[15px] font-bold">주장 종류</h3>
      {Object.keys(def.claimPredicates).map((key) => (
        <PredicateRow key={key} ctx={ctx} predicateKey={key} />
      ))}
      <AddPredicatePanel ctx={ctx} />

      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="button" data-testid="ontology-preview" disabled={busy} onClick={() => void runPreview()}>
          저장 전에 확인
        </Button>
        <Button type="button" variant="outline" data-testid="ontology-form-to-yaml" disabled={busy} onClick={() => void toYaml()}>
          YAML 로 보기
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="ontology-draft-discard"
          onClick={() => {
            setPreview(null)
            onDraftChange(null)
            onClose()
          }}
        >
          초안 버리기
        </Button>
      </div>
      {previewError && (
        <Alert role={undefined} variant="destructive" className="mt-3" data-testid="ontology-preview-failed">
          <AlertDescription>{previewError}</AlertDescription>
        </Alert>
      )}
      {preview && sent && (
        <OntologyPreviewPanel
          preview={preview}
          onSave={({ note, confirm }) => api.ontology.save({ baseVersion: draft.baseVersion, definition: sent, note: note || undefined, confirm })}
          onSaved={onSaved}
          onRestart={() => void restart()}
          onRebase={rebase}
        />
      )}
    </div>
  )
}
