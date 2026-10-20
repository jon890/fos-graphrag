import { useEffect, useState, type FormEvent } from 'react'
import { api, errorMessage } from '../api/client'
import type { ChangeEventView, Ontology, Page } from '../api/types'
import { useApp, useLabels } from '../context'
import { formatDateTime, summarizeValue, userName } from '../lib/format'
import { enumValueLabel, propertyDef, propertyLabel } from '../lib/labels'
import { Pager } from './Pager'

interface Props {
  targetId: string
  onTargetIdChange: (id: string) => void
  onOpen: (id: string) => void
}

/** 변경 내용 한 줄. 속성 이름과 enum 값은 온톨로지 표시 이름으로 바꾸고, 온톨로지에 없는 키(archived 등)는 그대로 둔다 */
function changeLine(ontology: Ontology, targetType: string, key: string, diff: { before: unknown; after: unknown } | undefined) {
  const def = propertyDef(ontology, targetType, key)
  const show = (v: unknown) => (def?.type === 'enum' && typeof v === 'string' ? enumValueLabel(def, v) : summarizeValue(v))
  return `${show(diff?.before)} → ${show(diff?.after)}`
}

export function ChangeRows({ items, onOpen }: { items: ChangeEventView[]; onOpen: (id: string) => void }) {
  const { ontology } = useApp()
  const labels = useLabels()
  return (
    <>
      {items.map((c) => (
        <tr key={c.id} data-testid="change-row" data-action={c.action} data-target-id={c.targetId}>
          <td>{formatDateTime(c.at)}</td>
          <td title={c.actor?.email}>{userName(c.actor)}</td>
          <td data-testid="change-action">
            <span className={`action-badge action-${c.action.toLowerCase()}`}>{labels.action(c.action)}</span>
          </td>
          <td>
            {c.targetKind === 'RELATIONSHIP' ? labels.relationship(c.targetType) : labels.type(c.targetType)}
            {c.targetKind === 'RELATIONSHIP' ? ' (관계)' : c.targetKind === 'USER' ? ' (사용자)' : ''}
          </td>
          <td>
            {c.targetKind === 'NODE' ? (
              <button className="link-button" onClick={() => onOpen(c.targetId)}>
                {labels.node({ type: c.targetType, label: c.targetLabel })}
              </button>
            ) : (
              c.targetLabel
            )}
          </td>
          <td>{c.revision}</td>
          <td>
            <ul className="change-list">
              {Object.entries(c.changes ?? {}).map(([key, diff]) => (
                <li key={key}>
                  <span className={propertyDef(ontology, c.targetType, key) ? undefined : 'mono'}>{propertyLabel(ontology, c.targetType, key)}</span>:{' '}
                  {changeLine(ontology, c.targetType, key, diff)}
                </li>
              ))}
            </ul>
          </td>
          <td>{c.note ?? ''}</td>
        </tr>
      ))}
    </>
  )
}

export function ChangesTab({ targetId, onTargetIdChange, onOpen }: Props) {
  const [targetInput, setTargetInput] = useState(targetId)
  const [actor, setActor] = useState('')
  const [actorInput, setActorInput] = useState('')
  const [pageNo, setPageNo] = useState(0)
  const [page, setPage] = useState<Page<ChangeEventView> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => setTargetInput(targetId), [targetId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.changes
      .list({ targetId, actor, page: pageNo, size: 20 })
      .then((p) => !cancelled && setPage(p))
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [targetId, actor, pageNo])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setPageNo(0)
    setActor(actorInput.trim())
    onTargetIdChange(targetInput.trim())
  }

  return (
    <div className="tab-page" data-testid="changes-tab">
      <form className="row toolbar" onSubmit={submit}>
        <label className="field-inline">
          대상 ID
          <input data-testid="changes-target-filter" className="mono" size={38} value={targetInput} onChange={(e) => setTargetInput(e.target.value)} />
        </label>
        <label className="field-inline">
          사용자 이메일
          <input data-testid="changes-actor-filter" type="email" placeholder="alice@example.com" value={actorInput} onChange={(e) => setActorInput(e.target.value)} />
        </label>
        <button type="submit" data-testid="changes-filter-submit">
          조회
        </button>
        {targetId && (
          <button
            type="button"
            data-testid="changes-filter-clear"
            onClick={() => {
              setPageNo(0)
              onTargetIdChange('')
            }}
          >
            대상 필터 해제
          </button>
        )}
        {loading && <span className="muted small">불러오는 중…</span>}
      </form>
      {error && <div className="error-box">{error}</div>}
      <table className="data-table" data-testid="changes-table">
        <thead>
          <tr>
            <th>시각</th>
            <th>사용자</th>
            <th>작업</th>
            <th>대상 종류</th>
            <th>대상 이름</th>
            <th>수정 번호</th>
            <th>변경 내용</th>
            <th>메모</th>
          </tr>
        </thead>
        <tbody>
          {page && <ChangeRows items={page.items} onOpen={onOpen} />}
          {page && page.items.length === 0 && (
            <tr>
              <td colSpan={8} className="muted" data-testid="changes-empty">
                변경 이력이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {page && <Pager page={page} onPage={setPageNo} testIdPrefix="changes-pager" />}
    </div>
  )
}
