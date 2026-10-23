import type { NodeView } from '../api/types'
import { Alert, AlertDescription } from '@/components/ui/alert'

/** 온톨로지 정의에서 빠진 타입의 노드. 저장된 속성을 고칠 수 없게 읽기 전용으로 보인다 */
export function UndefinedTypeProperties({ node }: { node: NodeView }) {
  return (
    <div>
      <Alert role={undefined} data-testid="node-undefined-type">
        <AlertDescription>이 타입은 온톨로지에서 빠졌습니다. 고칠 수 없고 보관과 복원만 됩니다.</AlertDescription>
      </Alert>
      <dl className="kv mt-2">
        {Object.entries(node.properties).map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="font-mono">{key}</dt>
            <dd>{value === null || value === '' ? '(없음)' : String(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
