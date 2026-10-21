import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { nodeLink } from '../lib/links'

interface Props {
  nodeId: string
  /** data-testid. 결과는 `${testId}`, `${testId}-done`, `${testId}-fallback` */
  testId: string
  label?: string
}

/** 항목 링크를 클립보드에 복사한다. 클립보드를 쓸 수 없으면 주소를 입력칸에 보여 직접 복사하게 한다. */
export function CopyLinkButton({ nodeId, testId, label = '링크 복사' }: Props) {
  const [result, setResult] = useState<'done' | 'fallback' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const url = nodeLink(nodeId, typeof window === 'undefined' ? '' : window.location.origin)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setResult('done')
    } catch {
      setResult('fallback')
      // 입력칸은 다음 렌더에 생기므로 그 뒤에 선택한다.
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Button type="button" variant="link" className="h-auto p-0" data-testid={testId} onClick={() => void copy()}>
        {label}
      </Button>
      {result === 'done' && (
        <span className="text-xs text-muted-foreground" data-testid={`${testId}-done`}>
          링크를 복사했습니다
        </span>
      )}
      {result === 'fallback' && (
        <input
          ref={inputRef}
          readOnly
          className="w-56 rounded border px-1 text-xs"
          data-testid={`${testId}-fallback`}
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </span>
  )
}
