import { useState, type KeyboardEvent } from 'react'
import { api, errorMessage } from '../api/client'
import type { NodeView } from '../api/types'
import { TypeBadge } from './TypeBadge'

interface Props {
  /** 검색할 노드 타입. 비우면 전체 */
  types: string[]
  onPick: (node: NodeView) => void
  /** data-testid 접두사. `${prefix}-input`, `${prefix}-search`, `${prefix}-result` */
  testIdPrefix: string
  placeholder?: string
  excludeIds?: string[]
}

/** 이름이나 종목 코드로 노드를 찾아 하나 고른다. */
export function NodePicker({ types, onPick, testIdPrefix, placeholder, excludeIds = [] }: Props) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<NodeView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
      <div className="row">
        <input
          data-testid={`${testIdPrefix}-input`}
          value={q}
          placeholder={placeholder ?? `${types.join(', ')} 검색`}
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
                <TypeBadge type={n.type} /> {n.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
