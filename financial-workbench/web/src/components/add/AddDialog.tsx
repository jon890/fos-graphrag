import { useEffect, useState } from 'react'
import { CheckIcon } from 'lucide-react'
import type { NodeView } from '../../api/types'
import { useApp, useLabels } from '../../context'
import { withEulReul, withJosa } from '../../lib/labels'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ClaimCreateForm } from '../ClaimCreateForm'
import { NodeCreateForm } from '../NodeCreateForm'
import { useGuide } from '../guide/GuideProvider'

interface Props {
  type: string
  onClose: () => void
  onCreated: (node: NodeView, message: string, kind?: 'success' | 'error') => void
  onOpenNode: (id: string) => void
}

/** 가이드 말풍선 안을 누른 것인지. 말풍선은 창 위에 떠 있어도 창 밖으로 보지 않는다 */
function inGuideBubble(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-testid="guide-bubble"]') !== null
}

/** 「＋ 추가」 로 고른 타입의 만들기 창. 단계 표시와 그 타입의 만들기 폼을 담는다 */
export function AddDialog({ type, onClose, onCreated, onOpenNode }: Props) {
  const { ontology } = useApp()
  const labels = useLabels()
  const guide = useGuide()
  // 가이드의 값은 가져가면 비므로 창이 열릴 때 복사해 둔다. 다른 타입의 창은 미리 채우지 않는다.
  const [prefill] = useState(() => (guide.prefill?.type === type ? guide.prefill : null))
  const { consumePrefill } = guide
  useEffect(() => {
    if (prefill) consumePrefill()
  }, [prefill, consumePrefill])

  const typeDef = ontology.nodeTypes[type]
  if (!typeDef) return null
  const isClaim = typeDef.managedBy === 'claims'
  const pickerLabel = Object.values(ontology.relationshipTypes).find((r) => r.createPicker && r.to.includes(type))?.createPicker?.label
  const showLinkStep = !isClaim && pickerLabel !== undefined

  /** 취소, 창 닫기. 가이드는 그 단계에 남는다 */
  const cancel = () => {
    guide.cancelForm()
    onClose()
  }

  const steps = ['1. 종류 고르기', '2. 내용 적기', ...(showLinkStep ? ['3. 연결하기'] : [])]

  return (
    <Dialog open onOpenChange={(open) => !open && cancel()}>
      {/* 좁은 화면은 위쪽에 붙인다. 아래쪽의 가이드 카드가 짧은 창의 만들기 단추를 덮지 않게 한다 */}
      <DialogContent
        className="top-4 max-h-[calc(100dvh-2rem)] translate-y-0 overflow-y-auto sm:top-[50%] sm:max-w-xl sm:translate-y-[-50%]"
        data-testid="add-dialog"
        data-type={type}
        onInteractOutside={(event) => {
          if (inGuideBubble(event.target)) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>새 {labels.type(type)} 추가</DialogTitle>
          <DialogDescription>{typeDef.description}</DialogDescription>
        </DialogHeader>
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" data-testid="add-steps">
          {steps.map((text, i) => (
            <li key={text} className={i === 0 ? 'flex items-center gap-1 text-foreground' : undefined} data-done={i === 0 ? 'true' : undefined}>
              {i === 0 && <CheckIcon className="size-3" aria-label="끝남" />}
              {text}
            </li>
          ))}
        </ol>
        {isClaim ? (
          <ClaimCreateForm
            onCancel={cancel}
            onCreated={(claim) => {
              onClose()
              guide.report({ kind: 'claim-created', node: claim })
              onCreated(claim, `「${labels.node(claim)}」 ${withEulReul(labels.type(claim.type))} 만들었습니다. 다른 편집자의 검토를 기다립니다.`)
            }}
          />
        ) : (
          <NodeCreateForm
            type={type}
            testIdPrefix="create"
            showStepHeadings
            initialValues={prefill?.values}
            onCancel={cancel}
            onUseExisting={(n) => {
              // 있는 항목을 여는 것은 만들기가 아니다. 가이드는 그 단계에 남는다.
              cancel()
              onOpenNode(n.id)
            }}
            onCreated={(node, linkError) => {
              onClose()
              guide.report({ kind: 'node-created', node })
              if (linkError) {
                onCreated(
                  node,
                  `「${labels.node(node)}」 ${withEulReul(labels.type(node.type))} 만들었지만 ${withJosa(pickerLabel ?? '관계', '을(를)')} 잇지 못했습니다. 상세의 「＋ 연결 추가」 로 다시 이으세요. (${linkError})`,
                  'error',
                )
              } else {
                onCreated(node, `「${labels.node(node)}」 ${withEulReul(labels.type(node.type))} 만들었습니다.`)
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
