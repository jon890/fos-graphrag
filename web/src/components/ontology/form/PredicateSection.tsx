import { useState } from 'react'
import { addClaimPredicate, keyError, sentenceError, updateClaimPredicate } from '../../../lib/ontologyDraft'
import { Field, FieldError, RemoveControl, TypeChecks, KeyInput, type FormContext } from './shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { EmptiedWarning } from './RelationshipSection'

export function PredicateRow({ ctx, predicateKey }: { ctx: FormContext; predicateKey: string }) {
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

export function AddPredicatePanel({ ctx }: { ctx: FormContext }) {
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
