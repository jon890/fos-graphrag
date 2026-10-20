import { useState, type FormEvent } from 'react'
import { api, ApiError, errorMessage } from '../api/client'
import type { NodeView } from '../api/types'
import { useApp } from '../context'
import { buildCreateProperties, initialFormValues, type FormValues } from '../lib/formValues'
import { fieldErrorsOf, PropertyFields } from './PropertyFields'

interface Props {
  type: string
  onCreated: (node: NodeView) => void
  onCancel: () => void
  testIdPrefix: string
}

/** 온톨로지 속성 정의로 생성 폼을 만든다. */
export function NodeCreateForm({ type, onCreated, onCancel, testIdPrefix }: Props) {
  const { ontology } = useApp()
  const defs = ontology.nodeTypes[type]?.properties ?? {}
  const [values, setValues] = useState<FormValues>(() => initialFormValues(defs))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const { properties, errors: localErrors } = buildCreateProperties(defs, values)
    setErrors(localErrors)
    if (Object.keys(localErrors).length > 0) {
      setError('입력값을 확인하세요.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onCreated(await api.nodes.create(type, properties))
    } catch (err) {
      setError(errorMessage(err))
      if (err instanceof ApiError) setErrors(fieldErrorsOf(err.details))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="create-form" onSubmit={submit} data-testid={`${testIdPrefix}-form`}>
      <PropertyFields
        defs={defs}
        values={values}
        errors={errors}
        testIdPrefix={`${testIdPrefix}-prop`}
        onChange={(name, v) => setValues((prev) => ({ ...prev, [name]: v }))}
      />
      {error && (
        <div className="error-box" role="alert" data-testid={`${testIdPrefix}-error`}>
          {error}
        </div>
      )}
      <div className="row">
        <button type="submit" className="primary" disabled={busy} data-testid={`${testIdPrefix}-submit`}>
          {busy ? '저장 중…' : `${type} 만들기`}
        </button>
        <button type="button" onClick={onCancel} data-testid={`${testIdPrefix}-cancel`}>
          취소
        </button>
      </div>
    </form>
  )
}
