import { useApp } from '../../context'
import type { PropertyDef } from '../../api/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TypeBadge } from '../TypeBadge'

function constraints(def: PropertyDef): string {
  const parts: string[] = []
  if (def.maxLength !== undefined) parts.push(`최대 ${def.maxLength}자`)
  if (def.values) parts.push(def.values.join(' | '))
  if (def.min !== undefined) parts.push(`최소 ${def.min}`)
  if (def.max !== undefined) parts.push(`최대 ${def.max}`)
  return parts.join(', ')
}

export function OntologyView() {
  const { ontology } = useApp()
  return (
    <div>
      <h3 className="mb-2 mt-4 text-[15px] font-bold">노드 타입</h3>
      {Object.entries(ontology.nodeTypes).map(([name, def]) => (
        <Card key={name} className="mb-4 gap-3 py-4" data-testid="ontology-node-type" data-type={name}>
          <CardHeader className="px-4">
            <CardTitle className="flex flex-wrap items-center gap-1 text-sm">
              <TypeBadge type={name} /> {name}
              <span className="text-xs font-normal text-muted-foreground">
                {' '}
                라벨 속성 {def.labelProperty}
                {def.managedBy ? ` · ${def.managedBy} API 전용` : ''}
              </span>
            </CardTitle>
            <CardDescription>{def.description}</CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead>이름</TableHead>
                  <TableHead>타입</TableHead>
                  <TableHead>필수</TableHead>
                  <TableHead>제약</TableHead>
                  <TableHead>설명</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(def.properties).map(([prop, p]) => (
                  <TableRow key={prop}>
                    <TableCell className="font-mono">{prop}</TableCell>
                    <TableCell>{p.type}</TableCell>
                    <TableCell>{p.required ? '예' : ''}</TableCell>
                    <TableCell>{constraints(p)}</TableCell>
                    <TableCell>{p.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <h3 className="mb-2 mt-4 text-[15px] font-bold">관계 타입</h3>
      <Table data-testid="ontology-relationships">
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead>이름</TableHead>
            <TableHead>시작 → 끝</TableHead>
            <TableHead>설명</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.entries(ontology.relationshipTypes).map(([name, def]) => (
            <TableRow key={name}>
              <TableCell className="font-mono">{name}</TableCell>
              <TableCell>
                {def.from.join(', ')} → {def.to.join(', ')}
              </TableCell>
              <TableCell>{def.description}</TableCell>
            </TableRow>
          ))}
          {Object.entries(ontology.claimRelationships ?? {}).map(([name, def]) => (
            <TableRow key={name} className="text-muted-foreground">
              <TableCell className="font-mono">{name}</TableCell>
              <TableCell>
                {(def.from ?? []).join(', ')} → {(def.to ?? ['(주어/목적어 노드)']).join(', ')}
              </TableCell>
              <TableCell>{def.description} (Claim API 전용)</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <h3 className="mb-2 mt-4 text-[15px] font-bold">Claim predicate</h3>
      <Table data-testid="ontology-predicates">
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead>predicate</TableHead>
            <TableHead>주어 타입 → 목적어 타입</TableHead>
            <TableHead>설명</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.entries(ontology.claimPredicates).map(([name, def]) => (
            <TableRow key={name}>
              <TableCell className="font-mono">{name}</TableCell>
              <TableCell>
                {def.subjectTypes.join(', ')} → {def.objectTypes.join(', ')}
              </TableCell>
              <TableCell>{def.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
