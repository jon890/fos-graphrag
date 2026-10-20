import { useApp } from '../context'
import type { PropertyDef } from '../api/types'
import { TypeBadge } from './TypeBadge'

function constraints(def: PropertyDef): string {
  const parts: string[] = []
  if (def.maxLength !== undefined) parts.push(`최대 ${def.maxLength}자`)
  if (def.values) parts.push(def.values.join(' | '))
  if (def.min !== undefined) parts.push(`최소 ${def.min}`)
  if (def.max !== undefined) parts.push(`최대 ${def.max}`)
  return parts.join(', ')
}

export function OntologyTab() {
  const { ontology } = useApp()
  return (
    <div className="tab-page ontology" data-testid="ontology-tab">
      <h2>
        온톨로지 <span className="muted" data-testid="ontology-version">schemaVersion {ontology.schemaVersion}</span>
      </h2>
      <p className="hint">읽기 전용입니다. 바꾸려면 저장소의 온톨로지 YAML 을 고칩니다.</p>

      <h3>노드 타입</h3>
      {Object.entries(ontology.nodeTypes).map(([name, def]) => (
        <section key={name} className="ontology-type" data-testid="ontology-node-type" data-type={name}>
          <h4>
            <TypeBadge type={name} /> {name}
            <span className="muted small">
              {' '}
              라벨 속성 {def.labelProperty}
              {def.managedBy ? ` · ${def.managedBy} API 전용` : ''}
            </span>
          </h4>
          <p>{def.description}</p>
          <table className="data-table compact">
            <thead>
              <tr>
                <th>이름</th>
                <th>타입</th>
                <th>필수</th>
                <th>제약</th>
                <th>설명</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(def.properties).map(([prop, p]) => (
                <tr key={prop}>
                  <td className="mono">{prop}</td>
                  <td>{p.type}</td>
                  <td>{p.required ? '예' : ''}</td>
                  <td>{constraints(p)}</td>
                  <td>{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <h3>관계 타입</h3>
      <table className="data-table compact" data-testid="ontology-relationships">
        <thead>
          <tr>
            <th>이름</th>
            <th>시작 → 끝</th>
            <th>설명</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(ontology.relationshipTypes).map(([name, def]) => (
            <tr key={name}>
              <td className="mono">{name}</td>
              <td>
                {def.from.join(', ')} → {def.to.join(', ')}
              </td>
              <td>{def.description}</td>
            </tr>
          ))}
          {Object.entries(ontology.claimRelationships ?? {}).map(([name, def]) => (
            <tr key={name} className="muted">
              <td className="mono">{name}</td>
              <td>
                {(def.from ?? []).join(', ')} → {(def.to ?? ['(주어/목적어 노드)']).join(', ')}
              </td>
              <td>{def.description} (Claim API 전용)</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Claim predicate</h3>
      <table className="data-table compact" data-testid="ontology-predicates">
        <thead>
          <tr>
            <th>predicate</th>
            <th>주어 타입 → 목적어 타입</th>
            <th>설명</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(ontology.claimPredicates).map(([name, def]) => (
            <tr key={name}>
              <td className="mono">{name}</td>
              <td>
                {def.subjectTypes.join(', ')} → {def.objectTypes.join(', ')}
              </td>
              <td>{def.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
