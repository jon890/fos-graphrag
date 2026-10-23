import { useState } from 'react'
import type { PropertyDef, PropertyType } from '../../../api/types'
import { CODE_READ_KEYS, NODE_SHAPES, addNodeType, addProperty, keyError, updateNodeType, updateProperty } from '../../../lib/ontologyDraft'
import { Field, FieldError, RemoveControl, KeyInput, numberOrUndefined, PROPERTY_TYPES, DEFAULT_COLOR, type FormContext } from './shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'

export function EnumValues({ ctx, type, propKey, prop }: { ctx: FormContext; type: string; propKey: string; prop: PropertyDef }) {
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

export function PropertyRow({ ctx, type, propKey }: { ctx: FormContext; type: string; propKey: string }) {
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

export function AddPropertyPanel({ ctx, type }: { ctx: FormContext; type: string }) {
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

export function NodeTypeCard({ ctx, type }: { ctx: FormContext; type: string }) {
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

export function AddNodeTypePanel({ ctx }: { ctx: FormContext }) {
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
