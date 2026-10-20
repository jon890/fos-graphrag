import { useMemo, useState } from 'react'
import { api, ApiError, errorMessage } from '../api/client'
import type { NodeView } from '../api/types'
import { useApp, useLabels } from '../context'
import { withEulReul } from '../lib/labels'
import { NodeCreateForm } from './NodeCreateForm'
import { NodePicker } from './NodePicker'
import { fieldErrorsOf } from './PropertyFields'
import { TypeBadge } from './TypeBadge'

interface Props {
  subject: NodeView
  onCreated: () => void
  onCancel: () => void
}

/** 이 항목을 주체로 하는 주장을 만든다. form 요소를 쓰지 않는다: 안에 문서 생성 form 이 들어간다. */
export function ClaimCreateForm({ subject, onCreated, onCancel }: Props) {
  const { ontology } = useApp()
  const labels = useLabels()
  const predicates = useMemo(
    () => Object.entries(ontology.claimPredicates).filter(([, def]) => def.subjectTypes.includes(subject.type)),
    [ontology, subject.type],
  )
  const [predicate, setPredicate] = useState(predicates[0]?.[0] ?? '')
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
  const objectTypes = predicateDef?.objectTypes ?? []

  const changePredicate = (next: string) => {
    setPredicate(next)
    // 목적어 타입 제한이 바뀌면 맞지 않는 목적어를 비운다.
    if (object && !ontology.claimPredicates[next]?.objectTypes.includes(object.type)) setObject(null)
  }

  const addDocument = (doc: NodeView) => setDocuments((prev) => (prev.some((d) => d.id === doc.id) ? prev : [...prev, doc]))

  const submit = async () => {
    const errs: Record<string, string> = {}
    if (!predicate) errs.predicate = `${withEulReul(labels.property('Claim', 'predicate'))} 고르세요.`
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
      await api.claims.create({
        predicate,
        subjectId: subject.id,
        objectId: object!.id,
        documentIds: documents.map((d) => d.id),
        description: description.trim(),
        evidenceText: evidenceText.trim(),
        validFrom: validFrom || null,
        validTo: validTo || null,
        authoringMethod: 'MANUAL',
        extractionConfidence: null,
      })
      onCreated()
    } catch (e) {
      setError(errorMessage(e))
      if (e instanceof ApiError) setFieldErrors(fieldErrorsOf(e.details))
    } finally {
      setBusy(false)
    }
  }

  if (predicates.length === 0) return null

  return (
    <div className="sub-form" data-testid="claim-add-form">
      <div className="field">
        <label>{labels.property('Claim', 'predicate')}</label>
        <select data-testid="claim-predicate-select" value={predicate} onChange={(e) => changePredicate(e.target.value)}>
          {predicates.map(([name]) => (
            <option key={name} value={name}>
              {labels.predicate(name)}
            </option>
          ))}
        </select>
        {predicateDef && (
          <div className="hint">
            {predicateDef.description} ({labels.relationship('SUBJECT')}: {predicateDef.subjectTypes.map(labels.type).join(', ')} · {labels.relationship('OBJECT')}:{' '}
            {predicateDef.objectTypes.map(labels.type).join(', ')})
          </div>
        )}
      </div>

      <div className="field">
        <label>{labels.relationship('SUBJECT')}</label>
        <div>
          <TypeBadge type={subject.type} /> {subject.label}
        </div>
      </div>

      <div className="field">
        <label>{labels.relationship('OBJECT')} ({objectTypes.map(labels.type).join(', ')})</label>
        {object ? (
          <div className="chip" data-testid="claim-object-selected">
            <TypeBadge type={object.type} /> {object.label}
            <button className="link-button" onClick={() => setObject(null)}>
              바꾸기
            </button>
          </div>
        ) : (
          <NodePicker types={objectTypes} onPick={setObject} testIdPrefix="claim-object-picker" excludeIds={[subject.id]} />
        )}
        {fieldErrors.objectId && <div className="field-error">{fieldErrors.objectId}</div>}
      </div>

      <div className="field">
        <label>{labels.relationship('SUPPORTED_BY')} (1개 이상)</label>
        {documents.length > 0 && (
          <ul className="chip-list">
            {documents.map((d) => (
              <li key={d.id} className="chip" data-testid="claim-doc-selected">
                <TypeBadge type="Document" /> {d.label}
                <button className="link-button" onClick={() => setDocuments((prev) => prev.filter((x) => x.id !== d.id))}>
                  빼기
                </button>
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
          <button className="link-button" data-testid="claim-doc-create-toggle" onClick={() => setCreatingDoc(true)}>
            + 근거 문서 새로 등록
          </button>
        ) : (
          <div className="nested-box">
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
        {fieldErrors.documentIds && <div className="field-error">{fieldErrors.documentIds}</div>}
      </div>

      <div className="field">
        <label htmlFor="claim-description">
          {labels.property('Claim', 'description')}
          <span className="required"> *</span>
        </label>
        <textarea
          id="claim-description"
          data-testid="claim-description"
          rows={2}
          maxLength={4000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {fieldErrors.description && <div className="field-error">{fieldErrors.description}</div>}
      </div>
      <div className="field">
        <label htmlFor="claim-evidence">
          {labels.property('Claim', 'evidenceText')}
          <span className="required"> *</span>
        </label>
        <textarea
          id="claim-evidence"
          data-testid="claim-evidence"
          rows={3}
          maxLength={4000}
          value={evidenceText}
          onChange={(e) => setEvidenceText(e.target.value)}
        />
        {fieldErrors.evidenceText && <div className="field-error">{fieldErrors.evidenceText}</div>}
      </div>
      <div className="row">
        <label className="field-inline">
          {labels.property('Claim', 'validFrom')}
          <input type="date" data-testid="claim-valid-from-input" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </label>
        <label className="field-inline">
          {labels.property('Claim', 'validTo')}
          <input type="date" data-testid="claim-valid-to-input" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </label>
      </div>
      <div className="hint">유효기간을 모르면 비워 두세요. 「미상」 으로 표시됩니다.</div>
      {fieldErrors.validTo && <div className="field-error">{fieldErrors.validTo}</div>}

      {error && (
        <div className="error-box" role="alert" data-testid="claim-add-error">
          {error}
        </div>
      )}
      <div className="row">
        <button className="primary" data-testid="claim-add-submit" disabled={busy} onClick={() => void submit()}>
          {busy ? '저장 중…' : '주장 만들기'}
        </button>
        <button onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}
