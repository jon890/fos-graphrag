import { useEffect, useMemo, useRef, useState } from 'react'
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape'
import { useApp, useLabels } from '../context'
import { collapseClaims, expandedDisplay, type GraphData, type GraphDisplay, layoutRoots, typeColor, typeShape } from '../lib/graph'
import type { Ontology } from '../api/types'
import { nodeDisplayLabel, predicateLabel, relationshipLabel } from '../lib/labels'
import { AddMenu } from './add/AddMenu'

interface Props {
  data: GraphData
  centerId: string | null
  selectedId: string | null
  loading: boolean
  error: string | null
  onSelect: (id: string) => void
  onExpand: (id: string) => void
  onRecenter: (id: string) => void
  claimsAsNodes: boolean
  /** 탭 배치에서 그래프 탭이 숨겨져 있으면 false. 숨겨진 컨테이너는 크기가 0 이라 배치를 미룬다 */
  visible?: boolean
}

const STYLE: cytoscape.StylesheetJson = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      shape: (ele: cytoscape.NodeSingular) => ele.data('shape') as cytoscape.Css.NodeShape,
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
  { selector: 'node[?compact]', style: { width: 22, height: 22 } },
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
      label: 'data(label)',
      'font-size': 9,
      color: '#475569',
      'text-rotation': 'autorotate',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.85,
      'text-background-padding': '1px',
    },
  },
  {
    selector: 'edge[kind = "claim"]',
    style: { width: 2.5, 'line-color': '#dc2626', 'target-arrow-color': '#dc2626', 'font-size': 10 },
  },
  { selector: 'edge[kind = "claim"][reviewStatus = "DRAFT"]', style: { 'line-style': 'dashed' } },
  { selector: 'edge[kind = "claim"][reviewStatus = "REJECTED"]', style: { opacity: 0.55 } },
  { selector: 'edge.selected', style: { width: 4, 'line-color': '#111827', 'target-arrow-color': '#111827' } },
]

/** 그래프에 그릴 요소. 노드 이름과 선 이름은 온톨로지 표시 이름으로 바꾸고, 저장된 키는 type 에 남긴다 */
function toElements(data: GraphDisplay, ontology: Ontology): ElementDefinition[] {
  return [
    ...data.nodes.map((n) => ({
      group: 'nodes' as const,
      data: { id: n.id, label: nodeDisplayLabel(ontology, n), type: n.type, reviewStatus: n.reviewStatus ?? '', color: typeColor(ontology, n.type),
        shape: typeShape(ontology, n.type),
        compact: ontology.nodeTypes[n.type]?.managedBy === 'claims',
      },
    })),
    ...data.edges.map((e) => ({
      group: 'edges' as const,
      data: { id: e.id, source: e.source, target: e.target, type: e.type, label: relationshipLabel(ontology, e.type) },
    })),
    ...data.claimEdges.map((c) => ({
      group: 'edges' as const,
      data: {
        id: `claim:${c.claimId}`,
        source: c.source,
        target: c.target,
        kind: 'claim',
        claimId: c.claimId,
        type: 'Claim',
        label: c.predicate ? predicateLabel(ontology, c.predicate) : '',
        reviewStatus: c.reviewStatus ?? '',
      },
    })),
  ]
}

/** 노드가 적으면 fit 이 지나치게 확대한다. 글자가 읽기 좋은 배율에서 멈춘다 */
function limitZoom(cy: Core): void {
  if (cy.zoom() > 1.2) {
    cy.zoom(1.2)
    cy.center()
  }
}

function runLayout(cy: Core, roots: string[]): void {
  // 관계 방향대로 위에서 아래로 놓는다. 뿌리는 layoutRoots 가 고른 값을 그대로 쓴다.
  const layout = cy.layout({ name: 'breadthfirst', directed: true, roots, spacingFactor: 1.2, padding: 48, animate: false, fit: true })
  layout.one('layoutstop', () => {
    cy.fit(undefined, 48)
    limitZoom(cy)
  })
  layout.run()
}

export function GraphPanel(props: Props) {
  const { data, centerId, selectedId, loading, error, claimsAsNodes, visible = true } = props
  const { ontology, canEdit } = useApp()
  const labels = useLabels()
  const display = useMemo(() => (claimsAsNodes ? expandedDisplay(data) : collapseClaims(data, centerId)), [data, centerId, claimsAsNodes])
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  // Cytoscape 이벤트는 한 번만 등록하고, 최신 콜백은 ref 로 읽는다.
  const handlers = useRef(props)
  handlers.current = props
  // 숨겨진 동안 새 요소가 생겼으면 다시 보일 때 배치를 돌린다.
  // effect 안에서는 ref 를 읽고, 브라우저 테스트가 보는 data-layout-pending 은 state 로 그린다.
  const pendingLayout = useRef(false)
  const [layoutPending, setLayoutPending] = useState(false)
  const visibleRef = useRef(visible)
  visibleRef.current = visible
  // 마지막으로 배치한 중심 노드. 숨김이 풀릴 때 배치에 쓰는 최신 그래프와 중심도 ref 로 읽는다.
  const layoutCenter = useRef<string | null>(null)
  const displayRef = useRef(display)
  displayRef.current = display
  const centerRef = useRef(centerId)
  centerRef.current = centerId

  useEffect(() => {
    if (!containerRef.current) return
    const cy = cytoscape({ container: containerRef.current, style: STYLE, elements: [], minZoom: 0.2, maxZoom: 3 })
    cy.on('tap', 'node', (evt) => handlers.current.onSelect(evt.target.id()))
    cy.on('dbltap', 'node', (evt) => handlers.current.onExpand(evt.target.id()))
    cy.on('tap', 'edge[kind = "claim"]', (evt) => handlers.current.onSelect(evt.target.data('claimId')))
    cy.on('dbltap', 'edge[kind = "claim"]', (evt) => handlers.current.onExpand(evt.target.data('claimId')))
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
    const wanted = toElements(display, ontology)
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
    // 중심 노드가 바뀌면 뿌리가 달라질 수 있어 새 요소가 없어도 다시 배치한다.
    const centerChanged = layoutCenter.current !== centerId
    layoutCenter.current = centerId
    if ((added || centerChanged) && cy.nodes().length > 0) {
      if (visibleRef.current) runLayout(cy, layoutRoots(display, centerId))
      else {
        pendingLayout.current = true
        setLayoutPending(true)
      }
    }
  }, [display, ontology, centerId])

  // 다시 보이면 크기를 새로 재고, 미뤄 둔 배치를 돌리거나 지금 크기에 맞춘다.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !visible) return
    cy.resize()
    if (pendingLayout.current) {
      pendingLayout.current = false
      setLayoutPending(false)
      if (cy.nodes().length > 0) runLayout(cy, layoutRoots(displayRef.current, centerRef.current))
    } else if (cy.nodes().length > 0) {
      cy.fit(undefined, 48)
      limitZoom(cy)
    }
  }, [visible])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.elements().removeClass('center selected')
    if (centerId) cy.getElementById(centerId).addClass('center')
    if (selectedId) {
      cy.getElementById(selectedId).addClass('selected')
      cy.getElementById('claim:' + selectedId).addClass('selected')
    }
  }, [centerId, selectedId, display])

  const empty = !centerId ? 'none' : !loading && !error && data.nodes.length <= 1 ? 'no-neighbors' : null
  const canExpand = !!selectedId && data.nodes.some((n) => n.id === selectedId)

  return (
    <div className="graph-panel">
      <div className="graph-toolbar">
        <button data-testid="graph-expand" disabled={!canExpand || loading} onClick={() => selectedId && props.onExpand(selectedId)}>
          이웃 확장
        </button>
        <button
          data-testid="graph-recenter"
          disabled={!selectedId || selectedId === centerId}
          onClick={() => selectedId && props.onRecenter(selectedId)}
        >
          선택한 항목을 중심으로
        </button>
        <button data-testid="graph-fit" disabled={data.nodes.length === 0} onClick={() => cyRef.current?.fit(undefined, 48)}>
          화면 맞춤
        </button>
        <span className="muted small" data-testid="graph-status">
          항목 {display.listed.length} · 관계 {display.edges.length + display.claimEdges.length}
        </span>
        {loading && (
          <span className="muted small" data-testid="graph-loading">
            불러오는 중…
          </span>
        )}
      </div>

      {data.truncated && (
        <div className="warn-box" data-testid="graph-truncated">
          결과가 잘렸습니다(최대 항목 {data.limits?.maxNodes ?? '?'}개, 관계 {data.limits?.maxRelationships ?? '?'}개).
        </div>
      )}
      {error && (
        <div className="error-box" data-testid="graph-error">
          {error}
        </div>
      )}

      <div className="graph-canvas-wrap">
        <div ref={containerRef} className="graph-canvas" data-testid="graph-canvas" data-layout-pending={String(layoutPending)}
          data-collapsed-claims={String(display.claimEdges.length)}
        />
        {empty === 'none' && (
          <div className="graph-overlay" data-testid="graph-empty">
            <p>항목을 검색해 고르면 이어진 항목이 그래프로 보입니다.</p>
          </div>
        )}
        {empty === 'no-neighbors' && (
          <div className="graph-overlay subtle" data-testid="graph-no-neighbors">
            이 항목에 연결된 이웃이 없습니다.
          </div>
        )}
        {/* 캔버스 위에 떠 있는 「＋ 추가」 메뉴 단추. 그래프 조작을 가리지 않게 작게 둔다 */}
        {canEdit && (
          <AddMenu
            align="end"
            trigger={
              <button
                type="button"
                className="absolute right-3 bottom-3 z-10 flex size-10 items-center justify-center rounded-full bg-primary text-xl text-primary-foreground shadow-md"
                aria-label="추가"
                data-testid="graph-add"
              >
                ＋
              </button>
            }
          />
        )}
      </div>

      <div className="legend" data-testid="graph-legend">
        {labels.types.map((t) => (
          <span key={t} className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: typeColor(ontology, t) }} />
            {labels.type(t)}
          </span>
        ))}
        <span className="legend-item muted">
          점선: {labels.status('DRAFT')} · 흐림: {labels.status('REJECTED')} · 주장 선을 누르면 상세 · 더블클릭: 이웃 확장
        </span>
      </div>

      <details className="graph-node-list" open>
        <summary>그래프에 나온 항목 ({display.listed.length})</summary>
        <ul data-testid="graph-node-list">
          {display.listed.map((n) => (
            <li
              key={n.id}
              data-testid="graph-node"
              data-node-id={n.id}
              data-node-type={n.type}
              data-review-status={n.reviewStatus ?? ''}
              data-collapsed={String(display.claimEdges.some((c) => c.claimId === n.id))}
            >
              <button className="link-button" onClick={() => props.onSelect(n.id)}>
                [{labels.type(n.type)}] {labels.node(n)}
                {n.reviewStatus ? ` (${labels.status(n.reviewStatus)})` : ''}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
