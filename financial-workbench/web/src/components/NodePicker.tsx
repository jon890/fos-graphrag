import { useEffect, useState, type KeyboardEvent } from 'react'
import { api, errorMessage } from '../api/client'
import type { NodeView } from '../api/types'
import { useLabels } from '../context'
import { TypeBadge } from './TypeBadge'

interface Props {
  /** 검색할 노드 타입. 비우면 전체 */
  types: string[]
  onPick: (node: NodeView) => void
  /** data-testid 접두사. `${prefix}-input`, `${prefix}-search`, `${prefix}-result` */
  testIdPrefix: string
  placeholder?: string
  excludeIds?: string[]
  /** 고를 후보가 하나도 없을 때 입력 위에 보이는 안내 */
  emptyHint?: string
}

/** 이름이나 종목 코드로 노드를 찾아 하나 고른다. */
export function NodePicker({ types, onPick, testIdPrefix, placeholder, excludeIds = [], emptyHint }: Props) {
  const labels = useLabels()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<NodeView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [noCandidates, setNoCandidates] = useState(false)

  const typesKey = types.join(',')
  const excludeKey = excludeIds.join(',')
  useEffect(() => {
    if (!emptyHint) return
    let live = true
    api.nodes
      .search({ q: '', types, size: excludeIds.length + 1 })
      .then((page) => live && setNoCandidates(page.items.every((n) => excludeIds.includes(n.id))))
      .catch(() => live && setNoCandidates(false))
    return () => {
      live = false
    }
    // types, excludeIds 는 배열이라 키 문자열로 비교한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emptyHint, typesKey, excludeKey])

  const search = async () => {
    setBusy(true)
    setError(null)
    try {
      const page = await api.nodes.search({ q, types, size: 10 })
      setResults(page.items.filter((n) => !excludeIds.includes(n.id)))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void search()
    }
  }

  return (
    <div className="picker">
      {noCandidates && (
        <div className="muted small" data-testid={`${testIdPrefix}-none`}>
          {emptyHint}
        </div>
      )}
      <div className="row">
        <input
          data-testid={`${testIdPrefix}-input`}
          value={q}
          placeholder={placeholder ?? `${types.map(labels.type).join(', ')} 검색`}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="button" data-testid={`${testIdPrefix}-search`} onClick={() => void search()} disabled={busy}>
          {busy ? '검색 중…' : '검색'}
        </button>
      </div>
      {error && <div className="error-box">{error}</div>}
      {results && results.length === 0 && (
        <div className="muted small" data-testid={`${testIdPrefix}-empty`}>
          검색 결과가 없습니다.
        </div>
      )}
      {results && results.length > 0 && (
        <ul className="picker-results">
          {results.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className="link-button"
                data-testid={`${testIdPrefix}-result`}
                data-node-id={n.id}
                onClick={() => {
                  onPick(n)
                  setResults(null)
                  setQ('')
                }}
              >
                <TypeBadge type={n.type} /> {labels.node(n)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
