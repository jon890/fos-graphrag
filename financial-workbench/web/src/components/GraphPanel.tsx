import { useEffect, useRef } from 'react'
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape'
import { NODE_TYPES } from '../api/types'
import { colorForType, type GraphData } from '../lib/graph'

interface Props {
  data: GraphData
  centerId: string | null
  selectedId: string | null
  loading: boolean
  error: string | null
  hops: number
  onHopsChange: (hops: number) => void
  onSelect: (id: string) => void
  onExpand: (id: string) => void
  onRecenter: (id: string) => void
}

const STYLE: cytoscape.StylesheetJson = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      label: 'data(label)',
      color: '#1f2937',
      'font-size': 11,
      'text-valign': 'bottom',
      'text-margin-y': 4,
      'text-wrap': 'ellipsis',
      'text-max-width': '120px',
      width: 26,
      height: 26,
      'border-width': 0,
    },
  },
  { selector: 'node[type = "Claim"]', style: { shape: 'round-diamond', width: 22, height: 22 } },
  { selector: 'node[type = "Document"]', style: { shape: 'round-rectangle' } },
  { selector: 'node[type = "Sector"]', style: { shape: 'hexagon' } },
  { selector: 'node[reviewStatus = "DRAFT"]', style: { 'border-width': 2, 'border-style': 'dashed', 'border-color': '#6b7280' } },
  { selector: 'node[reviewStatus = "REJECTED"]', style: { opacity: 0.55 } },
  { selector: 'node.center', style: { width: 36, height: 36, 'font-weight': 'bold' } },
  { selector: 'node.selected', style: { 'border-width': 4, 'border-style': 'solid', 'border-color': '#111827' } },
  {
    selector: 'edge',
    style: {
      width: 1.5,
      'line-color': '#94a3b8',
      'target-arrow-color': '#94a3b8',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      label: 'data(type)',
      'font-size': 9,
      color: '#475569',
      'text-rotation': 'autorotate',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.85,
      'text-background-padding': '1px',
    },
  },
]

function toElements(data: GraphData): ElementDefinition[] {
  return [
    ...data.nodes.map((n) => ({
      group: 'nodes' as const,
      data: { id: n.id, label: n.label, type: n.type, reviewStatus: n.reviewStatus ?? '', color: colorForType(n.type) },
    })),
    ...data.edges.map((e) => ({ group: 'edges' as const, data: { id: e.id, source: e.source, target: e.target, type: e.type } })),
  ]
}

export function GraphPanel(props: Props) {
  const { data, centerId, selectedId, loading, error, hops, onHopsChange } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  // Cytoscape 이벤트는 한 번만 등록하고, 최신 콜백은 ref 로 읽는다.
  const handlers = useRef(props)
  handlers.current = props

  useEffect(() => {
    if (!containerRef.current) return
    const cy = cytoscape({ container: containerRef.current, style: STYLE, elements: [], minZoom: 0.2, maxZoom: 3 })
    cy.on('tap', 'node', (evt) => handlers.current.onSelect(evt.target.id()))
    cy.on('dbltap', 'node', (evt) => handlers.current.onExpand(evt.target.id()))
    cyRef.current = cy
    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [])

  // 합쳐진 그래프와 Cytoscape 요소를 맞춘다. 새 요소가 생겼을 때만 배치를 다시 한다.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    const wanted = toElements(data)
    const wantedIds = new Set(wanted.map((el) => el.data.id as string))
    let added = false
    cy.batch(() => {
      cy.elements().forEach((el) => {
        if (!wantedIds.has(el.id())) el.remove()
      })
      for (const el of wanted) {
        const existing = cy.getElementById(el.data.id as string)
        if (existing.nonempty()) existing.data(el.data)
        else {
          cy.add(el)
          added = true
        }
      }
    })
    if (added && cy.nodes().length > 0) {
      const layout = cy.layout({ name: 'cose', animate: false, fit: true, padding: 40, nodeRepulsion: () => 8000, idealEdgeLength: () => 90 })
      // 노드가 적으면 fit 이 지나치게 확대한다. 글자가 읽기 좋은 배율에서 멈춘다.
      layout.one('layoutstop', () => {
        if (cy.zoom() > 1.2) {
          cy.zoom(1.2)
          cy.center()
        }
      })
      layout.run()
    }
  }, [data])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.nodes().removeClass('center selected')
    if (centerId) cy.getElementById(centerId).addClass('center')
    if (selectedId) cy.getElementById(selectedId).addClass('selected')
  }, [centerId, selectedId, data])

  const empty = !centerId ? 'none' : !loading && !error && data.nodes.length <= 1 ? 'no-neighbors' : null
  const canExpand = !!selectedId && data.nodes.some((n) => n.id === selectedId)

  return (
    <div className="graph-panel">
      <div className="graph-toolbar">
        <label className="field-inline">
          홉 수
          <select data-testid="graph-hops" value={hops} onChange={(e) => onHopsChange(Number(e.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
        <button data-testid="graph-expand" disabled={!canExpand || loading} onClick={() => selectedId && props.onExpand(selectedId)}>
          이웃 확장
        </button>
        <button
          data-testid="graph-recenter"
          disabled={!selectedId || selectedId === centerId}
          onClick={() => selectedId && props.onRecenter(selectedId)}
        >
          선택 노드를 중심으로
        </button>
        <button data-testid="graph-fit" disabled={data.nodes.length === 0} onClick={() => cyRef.current?.fit(undefined, 40)}>
          화면 맞춤
        </button>
        <span className="muted small" data-testid="graph-status">
          노드 {data.nodes.length} · 관계 {data.edges.length}
        </span>
        {loading && (
          <span className="muted small" data-testid="graph-loading">
            불러오는 중…
          </span>
        )}
      </div>

      {data.truncated && (
        <div className="warn-box" data-testid="graph-truncated">
          결과가 잘렸습니다(최대 노드 {data.limits?.maxNodes ?? '?'}, 관계 {data.limits?.maxRelationships ?? '?'}).
        </div>
      )}
      {error && (
        <div className="error-box" data-testid="graph-error">
          {error}
        </div>
      )}

      <div className="graph-canvas-wrap">
        <div ref={containerRef} className="graph-canvas" data-testid="graph-canvas" />
        {empty === 'none' && (
          <div className="graph-overlay" data-testid="graph-empty">
            왼쪽에서 노드를 검색해 선택하면 주변 그래프를 보여 줍니다.
          </div>
        )}
        {empty === 'no-neighbors' && (
          <div className="graph-overlay subtle" data-testid="graph-no-neighbors">
            이 노드에 연결된 이웃이 없습니다.
          </div>
        )}
      </div>

      <div className="legend" data-testid="graph-legend">
        {NODE_TYPES.map((t) => (
          <span key={t} className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: colorForType(t) }} />
            {t}
          </span>
        ))}
        <span className="legend-item muted">점선 테두리: DRAFT · 흐림: REJECTED · 더블클릭: 이웃 확장</span>
      </div>

      <details className="graph-node-list" open>
        <summary>그래프 노드 목록 ({data.nodes.length})</summary>
        <ul data-testid="graph-node-list">
          {data.nodes.map((n) => (
            <li key={n.id} data-testid="graph-node" data-node-id={n.id} data-node-type={n.type} data-review-status={n.reviewStatus ?? ''}>
              <button className="link-button" onClick={() => props.onSelect(n.id)}>
                [{n.type}] {n.label}
                {n.reviewStatus ? ` (${n.reviewStatus})` : ''}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
