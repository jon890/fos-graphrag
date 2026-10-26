import type { NodeView } from '../api/types'
import { useApp, useLabels } from '../context'

/** 일반 노드의 속성 목록. 온톨로지 속성 순서대로, 빈 값은 숨기고 enum 은 선택지 이름으로 보인다 */
export function NodeReadCard({ node }: { node: NodeView }) {
  const { ontology } = useApp()
  const labels = useLabels()
  const defs = ontology.nodeTypes[node.type]?.properties ?? {}
  const shown = Object.keys(defs).filter((name) => {
    const value = node.properties[name]
    return value !== null && value !== undefined && value !== ''
  })

  if (shown.length === 0) {
    return (
      <div className="muted small" data-testid="node-props">
        적은 내용이 없습니다.
      </div>
    )
  }
  return (
    <dl className="kv" data-testid="node-props">
      {shown.map((name) => (
        <div key={name} className="contents" data-testid="node-prop" data-prop={name}>
          <dt>{labels.property(node.type, name)}</dt>
          <dd>{labels.value(node.type, name, node.properties[name])}</dd>
        </div>
      ))}
    </dl>
  )
}
