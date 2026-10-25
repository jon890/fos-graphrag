import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape'
import { api, errorMessage } from '../../api/client'
import type { Ontology } from '../../api/types'
import { useApp, useLabels } from '../../context'
import { typeColor, typeShape } from '../../lib/graph'
import { relationshipLabel, typeLabel, withJosa } from '../../lib/labels'
import { MAP_EDGE_FONT, MAP_NODE_FONT, readableFontSize } from '../../lib/mapFont'
import { managedTypes, orderedTypes, rootTypes } from '../../lib/typeOrder'
import { mapSearch, parseMapQuery, TAB_PATHS } from '../../routes'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { TypeBadge } from '../TypeBadge'
import { TypePanel } from './TypePanel'

/** 지도 스타일. 글자 크기만 배율에 따라 바뀌므로 인자로 받는다 */
function mapStyle(nodeFont: number, edgeFont: number): cytoscape.StylesheetJson {
  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)',
        shape: (ele: cytoscape.NodeSingular) => ele.data('shape') as cytoscape.Css.NodeShape,
        label: 'data(label)',
        color: '#1f2937',
        'font-size': nodeFont,
        'text-valign': 'bottom',
        'text-margin-y': 4,
        width: 34,
        height: 34,
        'border-width': 0,
      },
    },
    { selector: 'node.selected', style: { 'border-width': 4, 'border-style': 'solid', 'border-color': '#111827', 'font-weight': 'bold' } },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'line-color': '#94a3b8',
        'target-arrow-color': '#94a3b8',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        label: 'data(label)',
        'font-size': edgeFont,
        color: '#475569',
        'text-rotation': 'autorotate',
        'text-background-color': '#ffffff',
        'text-background-opacity': 1,
        'text-background-padding': '3px',
        'text-background-shape': 'roundrectangle',
      },
    },
    // 좁은 화면에서는 선 글자가 서로 겹친다. 관계는 타입 칸의 문장으로 읽는다
    { selector: 'edge.no-label', style: { label: '' } },
  ]
}

/** 타입 노드의 글자. 개수를 모르면 타입 이름만 */
function nodeLabel(o: Ontology, type: string, counts: Record<string, number> | null): string {
  const n = counts?.[type]
  return n === undefined ? typeLabel(o, type) : `${typeLabel(o, type)} ${n}개`
}

/** 지도에 그릴 요소. 노드는 순서를 매긴 타입이고, 간선은 관계 종류의 from×to 조합마다 하나다 */
function toElements(o: Ontology, types: string[]): ElementDefinition[] {
  const shown = new Set(types)
  const edges: ElementDefinition[] = []
  for (const [key, def] of Object.entries(o.relationshipTypes)) {
    for (const from of def.from) {
      for (const to of def.to) {
        if (!shown.has(from) || !shown.has(to)) continue
        edges.push({ group: 'edges', data: { id: `${key}:${from}:${to}`, source: from, target: to, label: relationshipLabel(o, key), self: from === to } })
      }
    }
  }
  return [
    ...types.map((t) => ({ group: 'nodes' as const, data: { id: t, label: typeLabel(o, t), color: typeColor(o, t), shape: typeShape(o, t) } })),
    ...edges,
  ]
}

/** 노드가 적으면 fit 이 지나치게 확대한다. 글자가 읽기 좋은 배율에서 멈춘다 */
function limitZoom(cy: Core): void {
  if (cy.zoom() > 1.2) {
    cy.zoom(1.2)
    cy.center()
  }
}

/** 배율 1 의 글자 크기. 배치가 끝나기 전에 쓴다 */
const INITIAL_NODE_FONT = readableFontSize(MAP_NODE_FONT.base, MAP_NODE_FONT.minPx, 1)
const INITIAL_EDGE_FONT = readableFontSize(MAP_EDGE_FONT.base, MAP_EDGE_FONT.minPx, 1)

/**
 * 배율에 맞춰 노드와 선의 글자 크기를 다시 둔다. 스타일시트만 바꾸고 요소는 다시 놓지 않는다.
 * selector() 로 규칙을 덧붙이면 확대할 때마다 스타일시트가 길어지므로 fromJson 으로 통째로 바꾼다.
 * 화면에 그려지는 노드 글자 크기(px)를 돌려준다.
 */
function applyReadableFont(cy: Core): number {
  const zoom = cy.zoom()
  const node = readableFontSize(MAP_NODE_FONT.base, MAP_NODE_FONT.minPx, zoom)
  const edge = readableFontSize(MAP_EDGE_FONT.base, MAP_EDGE_FONT.minPx, zoom)
  cy.style().fromJson(mapStyle(node, edge)).update()
  return Math.round(node * zoom)
}

/** 첫 화면. 온톨로지의 타입과 관계를 그리고 타입마다 항목 수를 붙인다. 동작은 docs/flow.md 「개념 지도」 */
export function ConceptMapTab({ onOpenNode, onTrace }: { onOpenNode: (id: string) => void; onTrace: (id: string) => void }) {
  const { ontology, canEdit } = useApp()
  const labels = useLabels()
  const location = useLocation()
  const navigate = useNavigate()
  const selected = parseMapQuery(location.search).type
  const wide = useMediaQuery('(min-width: 1024px)')
  const types = useMemo(() => orderedTypes(ontology), [ontology])
  const managed = useMemo(() => managedTypes(ontology), [ontology])
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [countsError, setCountsError] = useState<string | null>(null)
  const [layoutDone, setLayoutDone] = useState(false)
  const [nodeFontPx, setNodeFontPx] = useState(Math.round(INITIAL_NODE_FONT))
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)

  const select = (type: string) => {
    if (type === selected) return
    navigate(TAB_PATHS.map + mapSearch({ type }))
  }
  // Cytoscape 이벤트는 한 번만 등록하고, 최신 콜백은 ref 로 읽는다.
  const selectRef = useRef(select)
  selectRef.current = select

  useEffect(() => {
    let cancelled = false
    api.nodes
      .counts()
      .then((r) => !cancelled && setCounts(r.counts))
      .catch((e) => !cancelled && setCountsError(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const cy = cytoscape({
      container: containerRef.current,
      style: mapStyle(INITIAL_NODE_FONT, INITIAL_EDGE_FONT),
      elements: [],
      minZoom: 0.2,
      maxZoom: 3,
      autoungrabify: true,
    })
    cy.on('tap', 'node', (evt) => selectRef.current(evt.target.id()))
    // 확대와 축소, fit 이 모두 zoom 을 낸다. 글자가 최소 화면 크기 아래로 작아지지 않게 다시 둔다
    cy.on('zoom', () => setNodeFontPx(applyReadableFont(cy)))
    cyRef.current = cy
    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [])

  // 온톨로지가 바뀌면 요소를 새로 놓는다. 자기 자신을 잇는 간선은 선으로만 그리고 배치 계산에서 뺀다.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    setLayoutDone(false)
    cy.elements().remove()
    cy.add(toElements(ontology, types))
    if (cy.nodes().length === 0) {
      setLayoutDone(true)
      return
    }
    // 뿌리가 없으면(모두 고리) 타입 순서의 첫 타입을 뿌리로 쓴다. roots 는 노드 id 목록이다.
    const rootIds = rootTypes(ontology).filter((t) => types.includes(t))
    const roots = rootIds.length > 0 ? rootIds : types.slice(0, 1)
    const layout = cy.elements().not(cy.edges('[?self]')).layout({ name: 'breadthfirst', directed: true, roots, spacingFactor: 1.6, padding: 24 })
    layout.one('layoutstop', () => {
      limitZoom(cy)
      setNodeFontPx(applyReadableFont(cy))
      setLayoutDone(true)
    })
    layout.run()
  }, [ontology, types])

  // 개수는 글자만 바꾼다. 배치는 그대로다.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.nodes().forEach((n) => {
      n.data('label', nodeLabel(ontology, n.id(), counts))
    })
  }, [ontology, types, counts])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.nodes().removeClass('selected')
    if (selected) cy.getElementById(selected).addClass('selected')
  }, [selected, types])

  // 좁은 화면(1024px 미만)에서는 선 글자를 숨긴다. 요소를 새로 놓으면 클래스도 사라지므로 온톨로지가 바뀔 때도 다시 붙인다
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    if (wide) cy.edges().removeClass('no-label')
    else cy.edges().addClass('no-label')
  }, [wide, ontology, types])

  // 넓은 화면과 좁은 화면을 오가면 그림 칸의 크기가 바뀐다. 크기를 다시 재고 화면에 맞춘다.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || cy.nodes().length === 0) return
    cy.resize()
    cy.fit(undefined, 24)
    limitZoom(cy)
  }, [wide])

  const allZero = counts !== null && Object.values(counts).every((n) => n === 0)
  const managedCount = counts === null ? null : managed.reduce((sum, t) => sum + (counts[t] ?? 0), 0)
  const panelType = types.includes(selected) ? selected : null

  return (
    <div className="min-h-full bg-card px-3 py-4 lg:px-6" data-testid="concept-map">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <div className="min-w-0">
          <section className="mb-3" data-testid="map-intro">
            <h2 className="text-lg font-bold">투자 온톨로지</h2>
            <p className="text-sm text-muted-foreground">
              투자 판단을 근거와 함께 쌓는 온톨로지입니다. 상자를 누르면 그 종류의 항목을 보고 바로 추가할 수 있습니다.
            </p>
          </section>
          {countsError && (
            <Alert role={undefined} variant="destructive" className="mb-3" data-testid="map-counts-error">
              <AlertDescription>항목 수를 불러오지 못했습니다. {countsError}</AlertDescription>
            </Alert>
          )}
          {allZero && (
            <Alert role={undefined} className="mb-3" data-testid="map-empty">
              <AlertDescription>
                <p>아직 등록한 항목이 없습니다.</p>
                {canEdit && <p>오른쪽 위 「＋ 추가」 로 첫 항목을 만드세요.</p>}
              </AlertDescription>
            </Alert>
          )}
          <div className="relative h-[360px] rounded-md border bg-white lg:h-[600px]">
            <div
              ref={containerRef}
              className="absolute inset-0"
              data-testid="concept-map-canvas"
              data-node-count={types.length}
              data-layout-done={String(layoutDone)}
              data-node-font-px={nodeFontPx}
            />
          </div>
          {managed.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground" data-testid="map-claim-note">
              {withJosa(labels.type(managed[0]), '은(는)')} 어느 항목에나 붙일 수 있습니다
              {managedCount !== null && ` · ${labels.type(managed[0])} ${managedCount}개`}
            </p>
          )}
          <ul className="mt-3 flex flex-wrap gap-2" data-testid="map-type-list">
            {types.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-sm aria-pressed:border-slate-900 aria-pressed:ring-1 aria-pressed:ring-slate-900"
                  data-testid="map-type"
                  data-type={t}
                  aria-pressed={t === selected}
                  onClick={() => select(t)}
                >
                  <TypeBadge type={t} />
                  {counts && (
                    <span className="text-muted-foreground" data-testid="map-type-count">
                      {counts[t] ?? 0}개
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
        {panelType && <TypePanel key={panelType} type={panelType} count={counts?.[panelType]} onOpenNode={onOpenNode} onTrace={onTrace} />}
      </div>
    </div>
  )
}
