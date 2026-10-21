import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { api, ApiError, errorMessage } from '../api/client'
import type { ClaimPredicateDef, ClaimView, NodeView } from '../api/types'
import { useApp, useLabels } from '../context'
import { claimSentenceParts, createFirstHint, withEulReul } from '../lib/labels'
import { NodeCreateForm } from './NodeCreateForm'
import { NodePicker } from './NodePicker'
import { fieldErrorsOf } from './PropertyFields'
import { TypeBadge } from './TypeBadge'

interface Props {
  /** 처음 채울 주체. 상세의 「주장 추가」 는 그 항목을 넘기고, 왼쪽 「무엇을 만들까요?」 는 넘기지 않는다 */
  initialSubject?: NodeView | null
  onCreated: (claim: ClaimView) => void
  onCancel: () => void
}

/** 관계 종류가 받지 않는 타입의 주체와 대상을 비운다. 정의가 없으면 그대로 둔다 */
export function keepAccepted(
  def: ClaimPredicateDef | undefined,
  subject: NodeView | null,
  object: NodeView | null,
): { subject: NodeView | null; object: NodeView | null } {
  if (!def) return { subject, object }
  return {
    subject: subject && def.subjectTypes.includes(subject.type) ? subject : null,
    object: object && def.objectTypes.includes(object.type) ? object : null,
  }
}

/** 문장 채우기로 주장을 만든다. form 요소를 쓰지 않는다: 안에 문서 생성 form 이 들어간다. */
export function ClaimCreateForm({ initialSubject = null, onCreated, onCancel }: Props) {
  const { ontology } = useApp()
  const labels = useLabels()
  const predicateNames = Object.keys(ontology.claimPredicates)
  const [predicate, setPredicate] = useState(
    () =>
      (initialSubject && predicateNames.find((n) => ontology.claimPredicates[n].subjectTypes.includes(initialSubject.type))) ||
      predicateNames[0] ||
      '',
  )
  const [subject, setSubject] = useState<NodeView | null>(initialSubject)
  const [object, setObject] = useState<NodeView | null>(null)
  const [documents, setDocuments] = useState<NodeView[]>([])
  const [creatingDoc, setCreatingDoc] = useState(false)
  const [description, setDescription] = useState('')
  const [evidenceText, setEvidenceText] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const predicateDef = ontology.claimPredicates[predicate]

  const apply = (next: { subject: NodeView | null; object: NodeView | null }) => {
    setSubject(next.subject)
    setObject(next.object)
  }
  const changePredicate = (next: string) => {
    setPredicate(next)
    apply(keepAccepted(ontology.claimPredicates[next], subject, object))
  }
  const swap = () => apply(keepAccepted(predicateDef, object, subject))

  const addDocument = (doc: NodeView) => setDocuments((prev) => (prev.some((d) => d.id === doc.id) ? prev : [...prev, doc]))

  const submit = async () => {
    const errs: Record<string, string> = {}
    if (!predicate) errs.predicate = `${withEulReul(labels.property('Claim', 'predicate'))} 고르세요.`
    if (!subject) errs.subjectId = `${withEulReul(labels.relationship('SUBJECT'))} 고르세요.`
    if (!object) errs.objectId = `${withEulReul(labels.relationship('OBJECT'))} 고르세요.`
    if (documents.length === 0) errs.documentIds = `${withEulReul(labels.relationship('SUPPORTED_BY'))} 한 개 이상 고르세요.`
    if (!description.trim()) errs.description = '필수 값입니다.'
    if (!evidenceText.trim()) errs.evidenceText = '필수 값입니다.'
    if (validFrom && validTo && validFrom > validTo) errs.validTo = '종료일이 시작일보다 빠릅니다.'
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) {
      setError('입력값을 확인하세요.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const claim = await api.claims.create({
        predicate,
        subjectId: subject!.id,
        objectId: object!.id,
        documentIds: documents.map((d) => d.id),
        description: description.trim(),
        evidenceText: evidenceText.trim(),
        validFrom: validFrom || null,
        validTo: validTo || null,
        authoringMethod: 'MANUAL',
        extractionConfidence: null,
      })
      onCreated(claim)
    } catch (e) {
      setError(errorMessage(e))
      if (e instanceof ApiError) setFieldErrors(fieldErrorsOf(e.details))
    } finally {
      setBusy(false)
    }
  }

  if (!predicateDef) return null

  const parts = claimSentenceParts(ontology, predicate, {
    subject: subject ? labels.node(subject) : null,
    object: object ? labels.node(object) : null,
  })
  const slot = (which: 'subject' | 'object') => {
    const picked = which === 'subject' ? subject : object
    const other = which === 'subject' ? object : subject
    const types = which === 'subject' ? predicateDef.subjectTypes : predicateDef.objectTypes
    if (picked) {
      return (
        <div key={which} className="flex items-center gap-1 rounded-md border px-2 py-1" data-testid={`claim-${which}-selected`}>
          <TypeBadge type={picked.type} /> {labels.node(picked)}
          <Button type="button" variant="link" size="xs" onClick={() => (which === 'subject' ? setSubject(null) : setObject(null))}>
            다시 고르기
          </Button>
        </div>
      )
    }
    return (
      <div key={which} className="min-w-48">
        <NodePicker
          types={types}
          onPick={which === 'subject' ? setSubject : setObject}
          testIdPrefix={`claim-${which}-picker`}
          excludeIds={other ? [other.id] : []}
          emptyHint={createFirstHint(types.map(labels.type))}
        />
      </div>
    )
  }

  return (
    <div className="grid gap-3" data-testid="claim-add-form">
      <div className="grid gap-1">
        <Label htmlFor="claim-predicate">{labels.property('Claim', 'predicate')}</Label>
        <NativeSelect id="claim-predicate" data-testid="claim-predicate-select" value={predicate} onChange={(e) => changePredicate(e.target.value)}>
          {predicateNames.map((name) => (
            <option key={name} value={name}>
              {labels.predicate(name)}
            </option>
          ))}
        </NativeSelect>
        {predicateDef.description && <div className="text-xs text-muted-foreground">{predicateDef.description}</div>}
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="claim-sentence">
        {parts.map((part, i) => {
          if (part.kind === 'slot') return slot(part.slot)
          const text = part.text.trim()
          return text ? (
            <span key={i} data-testid="claim-sentence-text">
              {text}
            </span>
          ) : null
        })}
      </div>
      <div>
        <Button type="button" variant="outline" size="sm" data-testid="claim-swap" disabled={!subject && !object} onClick={swap}>
          주체와 대상 바꾸기
        </Button>
      </div>
      {fieldErrors.subjectId && (
        <div className="text-sm text-destructive">
          {labels.relationship('SUBJECT')}: {fieldErrors.subjectId}
        </div>
      )}
      {fieldErrors.objectId && (
        <div className="text-sm text-destructive">
          {labels.relationship('OBJECT')}: {fieldErrors.objectId}
        </div>
      )}

      <div className="grid gap-1">
        <Label>{labels.relationship('SUPPORTED_BY')} (1개 이상)</Label>
        {documents.length > 0 && (
          <ul className="grid gap-1">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center gap-1" data-testid="claim-doc-selected">
                <TypeBadge type="Document" /> {d.label}
                <Button type="button" variant="link" size="xs" onClick={() => setDocuments((prev) => prev.filter((x) => x.id !== d.id))}>
                  빼기
                </Button>
              </li>
            ))}
          </ul>
        )}
        <NodePicker
          types={['Document']}
          onPick={addDocument}
          testIdPrefix="claim-doc-picker"
          placeholder="근거 문서 제목 검색"
          excludeIds={documents.map((d) => d.id)}
        />
        {!creatingDoc ? (
          <div>
            <Button type="button" variant="link" size="sm" data-testid="claim-doc-create-toggle" onClick={() => setCreatingDoc(true)}>
              + 근거 문서 새로 등록
            </Button>
          </div>
        ) : (
          <div className="rounded-md border p-3">
            <NodeCreateForm
              type="Document"
              testIdPrefix="claim-doc-create"
              onCancel={() => setCreatingDoc(false)}
              onCreated={(doc) => {
                addDocument(doc)
                setCreatingDoc(false)
              }}
            />
          </div>
        )}
        {fieldErrors.documentIds && <div className="text-sm text-destructive">{fieldErrors.documentIds}</div>}
      </div>

      <div className="grid gap-1">
        <Label htmlFor="claim-description">
          {labels.property('Claim', 'description')}
          <span className="text-destructive"> *</span>
        </Label>
        <Textarea id="claim-description" data-testid="claim-description" rows={2} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} />
        {fieldErrors.description && <div className="text-sm text-destructive">{fieldErrors.description}</div>}
      </div>
      <div className="grid gap-1">
        <Label htmlFor="claim-evidence">
          {labels.property('Claim', 'evidenceText')}
          <span className="text-destructive"> *</span>
        </Label>
        <Textarea id="claim-evidence" data-testid="claim-evidence" rows={3} maxLength={4000} value={evidenceText} onChange={(e) => setEvidenceText(e.target.value)} />
        {fieldErrors.evidenceText && <div className="text-sm text-destructive">{fieldErrors.evidenceText}</div>}
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="grid gap-1">
          <Label htmlFor="claim-valid-from">{labels.property('Claim', 'validFrom')}</Label>
          <Input id="claim-valid-from" type="date" data-testid="claim-valid-from-input" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="claim-valid-to">{labels.property('Claim', 'validTo')}</Label>
          <Input id="claim-valid-to" type="date" data-testid="claim-valid-to-input" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </div>
      </div>
      <div className="text-xs text-muted-foreground">유효기간을 모르면 비워 두세요. 「미상」 으로 표시됩니다.</div>
      {fieldErrors.validTo && <div className="text-sm text-destructive">{fieldErrors.validTo}</div>}

      {error && (
        <Alert role={undefined} variant="destructive" data-testid="claim-add-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="button" data-testid="claim-add-submit" disabled={busy} onClick={() => void submit()}>
          {busy ? '저장 중…' : '주장 만들기'}
        </Button>
        <Button type="button" variant="outline" data-testid="claim-add-cancel" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  )
}
