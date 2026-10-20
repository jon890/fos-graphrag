import { useState, type FormEvent } from 'react'
import { api, ApiError } from '../api/client'
import type { NodeView } from '../api/types'
import { useApp } from '../context'
import { buildPatchProperties, initialFormValues, type FormValues } from '../lib/formValues'
import { fieldErrorsOf, PropertyFields } from './PropertyFields'

interface Props {
  node: NodeView
  onSaved: (node: NodeView) => void
  onError: (e: unknown) => void
}

/**
 * 노드 속성 수정 폼. 부모가 key 에 revision 을 넣어, 최신 상세를 다시 읽으면 입력값도 새 값으로 바뀐다.
 */
export function NodeEditForm({ node, onSaved, onError }: Props) {
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
      if (err instanceof ApiError && err.code === 'VALIDATION_FAILED') setErrors(fieldErrorsOf(err.details))
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} data-testid="node-edit-form">
      {node.archived && <div className="info-box">보관된 노드는 수정할 수 없습니다. 먼저 복원하세요.</div>}
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
