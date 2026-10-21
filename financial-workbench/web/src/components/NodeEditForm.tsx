import { useState, type FormEvent } from 'react'
import { api, ApiError } from '../api/client'
import type { NodeView } from '../api/types'
import { useApp, useLabels } from '../context'
import { applyConflict, compareConflict, hasReapplicable, type ConflictField, type EditDraft } from '../lib/conflict'
import { truncate } from '../lib/format'
import { buildPatchProperties, initialFormValues, type FormValues } from '../lib/formValues'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { fieldErrorsOf, PropertyFields } from './PropertyFields'

interface Props {
  node: NodeView
  onSaved: (node: NodeView) => void
  onError: (e: unknown) => void
  /** 409 로 남은 내 입력. 이 노드이고 node.revision 이 draft.revision 과 다를 때만 비교를 보인다 */
  draft?: EditDraft | null
  /** 409 를 받으면 저장하려던 입력을 부모에 맡긴다. 그다음 onError 를 부른다 */
  onConflict?: (draft: EditDraft) => void
  /** 비교를 닫을 때(다시 적용, 버리기) */
  onDraftDone?: () => void
}

type Choices = Record<string, 'mine' | 'latest'>

function ConflictBox({
  node,
  fields,
  onApply,
  onDiscard,
}: {
  node: NodeView
  fields: ConflictField[]
  onApply: (choices: Choices) => void
  onDiscard: () => void
}) {
  const labels = useLabels()
  const [choices, setChoices] = useState<Choices>({})
  const show = (name: string, v: string) => {
    if (v === '') return '(비어 있음)'
    const shown = labels.propertyDef(node.type, name)?.type === 'enum' ? labels.value(node.type, name, v) : v
    return truncate(String(shown), 120)
  }
  return (
    <div className="info-box" data-testid="edit-conflict">
      <div>저장하지 못한 내 입력이 있습니다. 칸마다 확인하고 다시 적용하세요.</div>
      <ul>
        {fields.map((f) => (
          <li key={f.name} data-testid="edit-conflict-field" data-field={f.name} data-kind={f.kind}>
            <strong>{labels.property(node.type, f.name)}</strong>{' '}
            {f.kind === 'theirs' && <span>다른 쪽이 바꿈: {show(f.name, f.latest)}</span>}
            {f.kind === 'mine' && <span>내 입력: {show(f.name, f.mine)}</span>}
            {f.kind === 'both' && (
              <>
                <span>둘 다 바꿈</span>
                {(['mine', 'latest'] as const).map((choice) => (
                  <div key={choice} className="field-inline">
                    <input
                      type="radio"
                      id={`conflict-${f.name}-${choice}`}
                      name={`conflict-${f.name}`}
                      data-testid={`edit-conflict-choice-${f.name}-${choice}`}
                      checked={(choices[f.name] ?? 'latest') === choice}
                      onChange={() => setChoices((prev) => ({ ...prev, [f.name]: choice }))}
                    />
                    <Label htmlFor={`conflict-${f.name}-${choice}`}>
                      {choice === 'mine' ? `내 값: ${show(f.name, f.mine)}` : `최신 값: ${show(f.name, f.latest)}`}
                    </Label>
                  </div>
                ))}
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="row">
        <Button type="button" size="sm" data-testid="edit-conflict-apply" onClick={() => onApply(choices)}>
          다시 적용
        </Button>
        <Button type="button" size="sm" variant="outline" data-testid="edit-conflict-discard" onClick={onDiscard}>
          버리기
        </Button>
      </div>
    </div>
  )
}

/**
 * 노드 속성 수정 폼. 부모가 key 에 revision 을 넣어, 최신 상세를 다시 읽으면 입력값도 새 값으로 바뀐다.
 */
export function NodeEditForm({ node, onSaved, onError, draft, onConflict, onDraftDone }: Props) {
  const { ontology, canEdit } = useApp()
  const defs = ontology.nodeTypes[node.type]?.properties ?? {}
  const [values, setValues] = useState<FormValues>(() => initialFormValues(defs, node.properties))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [localMessage, setLocalMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const { properties, errors: localErrors } = buildPatchProperties(defs, node.properties, values)
    setErrors(localErrors)
    if (Object.keys(localErrors).length > 0) {
      setLocalMessage('입력값을 확인하세요.')
      return
    }
    if (Object.keys(properties).length === 0) {
      setLocalMessage('바뀐 내용이 없습니다.')
      return
    }
    setBusy(true)
    setLocalMessage(null)
    try {
      onSaved(await api.nodes.patch(node.id, node.revision, properties))
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REVISION_CONFLICT') {
        onConflict?.({ nodeId: node.id, revision: node.revision, base: node.properties, mine: values })
      }
      if (err instanceof ApiError && err.code === 'VALIDATION_FAILED') setErrors(fieldErrorsOf(err.details))
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  const conflictFields =
    draft && draft.nodeId === node.id && draft.revision !== node.revision && !node.archived
      ? compareConflict(defs, draft.base, draft.mine, node.properties)
      : []

  return (
    <form onSubmit={submit} data-testid="node-edit-form">
      {node.archived && <div className="info-box">보관된 항목은 수정할 수 없습니다. 먼저 복원하세요.</div>}
      {hasReapplicable(conflictFields) && (
        <ConflictBox
          node={node}
          fields={conflictFields}
          onApply={(choices) => {
            setValues((prev) => applyConflict(prev, conflictFields, choices))
            setLocalMessage('내 입력을 다시 넣었습니다. 확인한 뒤 저장하세요.')
            onDraftDone?.()
          }}
          onDiscard={() => onDraftDone?.()}
        />
      )}
      <PropertyFields
        defs={defs}
        values={values}
        errors={errors}
        disabled={node.archived || !canEdit}
        testIdPrefix="edit-prop"
        onChange={(name, v) => setValues((prev) => ({ ...prev, [name]: v }))}
      />
      {localMessage && (
        <div className="info-box" data-testid="node-edit-local-message">
          {localMessage}
        </div>
      )}
      {canEdit && (
        <button type="submit" className="primary" disabled={busy || node.archived} data-testid="node-save">
          {busy ? '저장 중…' : '저장'}
        </button>
      )}
    </form>
  )
}
