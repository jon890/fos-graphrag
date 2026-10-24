import { useState, type FormEvent } from 'react'
import { api, ApiError, errorMessage } from '../api/client'
import type { NodeView } from '../api/types'
import { useApp, useLabels } from '../context'
import { buildCreateProperties, initialCreateValues, type FormValues } from '../lib/formValues'
import { sameName, withJosa } from '../lib/labels'
import { NodePicker } from './NodePicker'
import { fieldErrorsOf, PropertyFields } from './PropertyFields'
import { TypeBadge } from './TypeBadge'

interface Props {
  type: string
  /** linkError 는 시작 노드 관계만 실패했을 때의 이유다 */
  onCreated: (node: NodeView, linkError?: string) => void
  onCancel: () => void
  testIdPrefix: string
  /** 같은 이름 경고의 후보를 누를 때. 없으면 후보에 단추가 없다 */
  onUseExisting?: (node: NodeView) => void
  /** 그 단추의 글자. 기본 「열기」 */
  useExistingLabel?: string
  /** 폼의 처음 값 위에 덮어쓸 값. 첫 접속 가이드가 연습 이름을 넣는다 */
  initialValues?: FormValues
  /** 만들기 창의 단계 소제목(「2. 내용 적기」, 「3. 연결하기 (선택)」)을 그린다. 주장 폼 안의 근거 문서 등록은 그리지 않는다 */
  showStepHeadings?: boolean
}

/** 온톨로지 속성 정의로 생성 폼을 만든다. */
export function NodeCreateForm({
  type,
  onCreated,
  onCancel,
  testIdPrefix,
  onUseExisting,
  useExistingLabel,
  initialValues,
  showStepHeadings = false,
}: Props) {
  const { ontology } = useApp()
  const labels = useLabels()
  const typeDef = ontology.nodeTypes[type]
  const defs = typeDef?.properties ?? {}
  const labelProperty = typeDef?.labelProperty ?? ''
  const [values, setValues] = useState<FormValues>(() => ({ ...initialCreateValues(defs), ...initialValues }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [duplicates, setDuplicates] = useState<NodeView[]>([])
  const [picked, setPicked] = useState<Record<string, NodeView>>({})
  // 처음에는 필수 칸만 보인다. 접혀 있어도 선택 칸의 값(미리 채운 값 포함)은 함께 저장한다.
  const [showOptional, setShowOptional] = useState(false)
  const hasOptional = Object.values(defs).some((def) => !def.required)

  /** 칸 오류를 보이고, 선택 칸에 오류가 있으면 선택 칸을 펼친다 */
  const showErrors = (next: Record<string, string>) => {
    setErrors(next)
    if (Object.keys(next).some((name) => defs[name] && !defs[name].required)) setShowOptional(true)
  }

  const pickers = Object.entries(ontology.relationshipTypes).filter(
    ([, rel]) => rel.createPicker && rel.to.includes(type),
  )

  const save = async ({ skipDuplicateCheck }: { skipDuplicateCheck: boolean }) => {
    const { properties, errors: localErrors } = buildCreateProperties(defs, values)
    showErrors(localErrors)
    if (Object.keys(localErrors).length > 0) {
      setError('입력값을 확인하세요.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (!skipDuplicateCheck) {
        const name = values[labelProperty] ?? ''
        try {
          const page = await api.nodes.search({ q: name.trim(), types: [type], size: 100 })
          const same = page.items.filter((n) => sameName(n.label, name))
          if (same.length > 0) {
            setDuplicates(same)
            return
          }
        } catch {
          // 같은 이름 검사는 돕는 기능이라 실패해도 저장은 막지 않는다
        }
      }
      setDuplicates([])
      const created = await api.nodes.create(type, properties)
      const linkErrors: string[] = []
      for (const [relType] of pickers) {
        const from = picked[relType]
        if (!from) continue
        try {
          await api.relationships.create(relType, from.id, created.id)
        } catch (e) {
          linkErrors.push(errorMessage(e))
        }
      }
      onCreated(created, linkErrors.length > 0 ? linkErrors.join('\n') : undefined)
    } catch (err) {
      setError(errorMessage(err))
      if (err instanceof ApiError) showErrors(fieldErrorsOf(err.details))
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    void save({ skipDuplicateCheck: false })
  }

  const fieldProps = {
    defs,
    values,
    errors,
    testIdPrefix: `${testIdPrefix}-prop`,
    onChange: (name: string, v: string) => {
      if (name === labelProperty) setDuplicates([])
      setValues((prev) => ({ ...prev, [name]: v }))
    },
  }

  return (
    <form className="create-form" onSubmit={submit} data-testid={`${testIdPrefix}-form`}>
      {showStepHeadings && <h3 className="mb-2 text-sm font-semibold">2. 내용 적기</h3>}
      <PropertyFields only="required" {...fieldProps} />
      {hasOptional && (
        <>
          <button
            type="button"
            className="link-button mb-2"
            aria-expanded={showOptional}
            data-testid={`${testIdPrefix}-optional-toggle`}
            onClick={() => setShowOptional((v) => !v)}
          >
            {showOptional ? '선택 항목 접기' : '선택 항목 더 보기'}
          </button>
          {showOptional && <PropertyFields only="optional" {...fieldProps} />}
        </>
      )}
      {showStepHeadings && pickers.length > 0 && <h3 className="mt-3 mb-2 text-sm font-semibold">3. 연결하기 (선택)</h3>}
      {pickers.map(([relType, rel]) => (
        <div className="field" key={relType}>
          <div className="label">{rel.createPicker?.label}</div>
          {picked[relType] ? (
            <div className="row" data-testid={`${testIdPrefix}-link-${relType}-selected`}>
              <TypeBadge type={picked[relType].type} />
              <span>{labels.node(picked[relType])}</span>
              <button
                type="button"
                data-testid={`${testIdPrefix}-link-${relType}-clear`}
                onClick={() =>
                  setPicked((prev) => {
                    const next = { ...prev }
                    delete next[relType]
                    return next
                  })
                }
              >
                다시 고르기
              </button>
            </div>
          ) : (
            <NodePicker
              types={rel.from}
              testIdPrefix={`${testIdPrefix}-link-${relType}-picker`}
              onPick={(n) => setPicked((prev) => ({ ...prev, [relType]: n }))}
            />
          )}
          {rel.createPicker?.description && <div className="hint">{rel.createPicker.description}</div>}
        </div>
      ))}
      {duplicates.length > 0 && (
        <div className="hint" role="status" data-testid={`${testIdPrefix}-duplicate`}>
          <div>같은 이름의 {withJosa(labels.type(type), '이(가)')} 이미 있습니다.</div>
          <ul>
            {duplicates.map((n) => (
              <li key={n.id} data-testid={`${testIdPrefix}-duplicate-item`} data-node-id={n.id}>
                <TypeBadge type={n.type} /> {labels.node(n)} <span className="muted small">{labels.hint(n)}</span>
                {onUseExisting && (
                  <button type="button" data-testid={`${testIdPrefix}-duplicate-open`} onClick={() => onUseExisting(n)}>
                    {useExistingLabel ?? '열기'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy}
            data-testid={`${testIdPrefix}-duplicate-confirm`}
            onClick={() => void save({ skipDuplicateCheck: true })}
          >
            그래도 만들기
          </button>
        </div>
      )}
      {error && (
        <div className="error-box" role="alert" data-testid={`${testIdPrefix}-error`}>
          {error}
        </div>
      )}
      <div className="row">
        <button type="submit" className="primary" disabled={busy} data-testid={`${testIdPrefix}-submit`}>
          {busy ? '저장 중…' : `${labels.type(type)} 만들기`}
        </button>
        <button type="button" onClick={onCancel} data-testid={`${testIdPrefix}-cancel`}>
          취소
        </button>
      </div>
    </form>
  )
}
