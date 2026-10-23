import { useMemo, useState } from 'react'
import { api, errorMessage } from '../api/client'
import type { NodeView, RelationshipView } from '../api/types'
import { useApp, useLabels } from '../context'
import { NodePicker } from './NodePicker'
import { TypeBadge } from './TypeBadge'

interface Option {
  key: string
  type: string
  /** out: 이 노드가 시작점, in: 이 노드가 끝점 */
  direction: 'out' | 'in'
  otherTypes: string[]
}

interface Props {
  node: NodeView
  relationships: RelationshipView[]
  onChanged: (message: string) => void
  onError: (e: unknown) => void
  onOpenNode: (id: string) => void
}

export function RelationshipSection({ node, relationships, onChanged, onError, onOpenNode }: Props) {
  const { ontology, canEdit } = useApp()
  const labels = useLabels()
  const options = useMemo<Option[]>(() => {
    const out: Option[] = []
    for (const [type, def] of Object.entries(ontology.relationshipTypes)) {
      if (def.from.includes(node.type)) out.push({ key: `${type}:out`, type, direction: 'out', otherTypes: def.to })
      if (def.to.includes(node.type)) out.push({ key: `${type}:in`, type, direction: 'in', otherTypes: def.from })
    }
    return out
  }, [ontology, node.type])

  const [adding, setAdding] = useState(false)
  const [optionKey, setOptionKey] = useState(options[0]?.key ?? '')
  const [target, setTarget] = useState<NodeView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const option = options.find((o) => o.key === optionKey) ?? options[0]

  const submit = async () => {
    if (!option || !target) {
      setError('연결할 항목을 고르세요.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const fromId = option.direction === 'out' ? node.id : target.id
      const toId = option.direction === 'out' ? target.id : node.id
      await api.relationships.create(option.type, fromId, toId)
      setAdding(false)
      setTarget(null)
      onChanged(`「${labels.relationship(option.type)}」 관계를 추가했습니다.`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const toggleArchive = async (rel: RelationshipView) => {
    try {
      if (rel.archived) await api.relationships.restore(rel.id, rel.revision)
      else await api.relationships.archive(rel.id, rel.revision)
      onChanged(rel.archived ? '관계를 복원했습니다.' : '관계를 보관했습니다.')
    } catch (e) {
      onError(e)
    }
  }

  return (
    <section className="detail-section" data-testid="relationship-section">
      <h3>관계</h3>
      {relationships.length === 0 && <div className="muted small">연결된 항목이 없습니다.</div>}
      <ul className="rel-list">
        {relationships.map((r) => (
          <li key={r.id} data-testid="relationship-row" data-rel-type={r.type} className={r.archived ? 'archived' : ''}>
            <button className="link-button" disabled={r.from.id === node.id} onClick={() => onOpenNode(r.from.id)}>
              <TypeBadge type={r.from.type} /> {r.from.label}
            </button>
            <span className="rel-type">—{labels.relationship(r.type)}→</span>
            <button className="link-button" disabled={r.to.id === node.id} onClick={() => onOpenNode(r.to.id)}>
              <TypeBadge type={r.to.type} /> {r.to.label}
            </button>
            {r.archived && <span className="archived-badge">보관됨</span>}
            {!ontology.relationshipTypes[r.type] && (
              <span className="archived-badge" data-testid="relationship-undefined">
                정의에서 빠진 관계
              </span>
            )}
            {canEdit && ontology.relationshipTypes[r.type] && (
              <button className="link-button small" data-testid="relationship-archive-toggle" onClick={() => void toggleArchive(r)}>
                {r.archived ? '관계 복원' : '관계 보관'}
              </button>
            )}
          </li>
        ))}
      </ul>

      {canEdit && options.length > 0 && !adding && (
        <button data-testid="relationship-add-toggle" onClick={() => setAdding(true)} disabled={node.archived}>
          관계 추가
        </button>
      )}
      {canEdit && adding && option && (
        <div className="sub-form" data-testid="relationship-add-form">
          <div className="field">
            <label>관계 종류</label>
            <select
              data-testid="relationship-type-select"
              value={option.key}
              onChange={(e) => {
                setOptionKey(e.target.value)
                setTarget(null)
              }}
            >
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.direction === 'out'
                    ? `이 항목 —${labels.relationship(o.type)}→ (${o.otherTypes.map(labels.type).join(', ')})`
                    : `(${o.otherTypes.map(labels.type).join(', ')}) —${labels.relationship(o.type)}→ 이 항목`}
                </option>
              ))}
            </select>
            <div className="hint">{ontology.relationshipTypes[option.type]?.description}</div>
          </div>
          <div className="field">
            <label>{option.direction === 'out' ? '연결할 항목(끝)' : '연결할 항목(시작)'}</label>
            {target ? (
              <div className="chip" data-testid="relationship-target-selected">
                <TypeBadge type={target.type} /> {target.label}
                <button className="link-button" onClick={() => setTarget(null)}>
                  바꾸기
                </button>
              </div>
            ) : (
              <NodePicker types={option.otherTypes} onPick={setTarget} testIdPrefix="relationship-target-picker" excludeIds={[node.id]} />
            )}
          </div>
          {error && (
            <div className="error-box" data-testid="relationship-add-error">
              {error}
            </div>
          )}
          <div className="row">
            <button className="primary" data-testid="relationship-add-submit" disabled={busy || !target} onClick={() => void submit()}>
              추가
            </button>
            <button onClick={() => setAdding(false)}>취소</button>
          </div>
        </div>
      )}
    </section>
  )
}
