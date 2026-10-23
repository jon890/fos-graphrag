import { useState } from 'react'
import { addRelationshipType, keyError, updateRelationshipType } from '../../../lib/ontologyDraft'
import { Field, RemoveControl, TypeChecks, KeyInput, type FormContext } from './shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** 노드 타입을 빼서 이 종류가 쓸 수 없게 됐다는 안내 */
export function EmptiedWarning({ show }: { show: boolean }) {
  return show ? (
    <p className="m-0 mt-1 text-xs text-destructive" data-testid="ontology-form-emptied">
      이 종류도 함께 빼야 합니다
    </p>
  ) : null
}

export function RelationshipRow({ ctx, relKey }: { ctx: FormContext; relKey: string }) {
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

export function AddRelationshipPanel({ ctx }: { ctx: FormContext }) {
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
