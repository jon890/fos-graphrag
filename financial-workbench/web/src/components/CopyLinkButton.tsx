import { useRef, useState, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { nodeLink } from '../lib/links'

type CopyResult = 'done' | 'fallback' | null

/**
 * 항목 링크를 클립보드에 복사하는 상태. 단추와 결과를 다른 자리에 그릴 때 쓴다.
 * 상세의 「⋯」 메뉴는 메뉴가 닫혀도 결과가 남도록 단추는 메뉴 항목으로, 결과는 메뉴 밖에 그린다.
 */
export function useCopyLink(nodeId: string) {
  const [result, setResult] = useState<CopyResult>(null)
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

  return { url, result, inputRef, copy, reset: () => setResult(null) }
}

interface ResultProps {
  /** 결과는 `${testId}-done`, `${testId}-fallback` */
  testId: string
  url: string
  result: CopyResult
  inputRef: RefObject<HTMLInputElement | null>
}

/** 복사 결과. 클립보드를 쓸 수 없으면 주소를 입력칸에 보여 직접 복사하게 한다 */
export function CopyLinkResult({ testId, url, result, inputRef }: ResultProps) {
  if (result === 'done') {
    return (
      <span className="text-xs text-muted-foreground" data-testid={`${testId}-done`}>
        링크를 복사했습니다
      </span>
    )
  }
  if (result === 'fallback') {
    return (
      <input
        ref={inputRef}
        readOnly
        className="w-56 max-w-full rounded border px-1 text-xs"
        data-testid={`${testId}-fallback`}
        value={url}
        onFocus={(e) => e.currentTarget.select()}
      />
    )
  }
  return null
}

interface Props {
  nodeId: string
  /** data-testid. 결과는 `${testId}`, `${testId}-done`, `${testId}-fallback` */
  testId: string
  label?: string
}

/** 항목 링크를 클립보드에 복사한다. 클립보드를 쓸 수 없으면 주소를 입력칸에 보여 직접 복사하게 한다. */
export function CopyLinkButton({ nodeId, testId, label = '링크 복사' }: Props) {
  const { url, result, inputRef, copy } = useCopyLink(nodeId)

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Button type="button" variant="link" className="h-auto p-0" data-testid={testId} onClick={() => void copy()}>
        {label}
      </Button>
      <CopyLinkResult testId={testId} url={url} result={result} inputRef={inputRef} />
    </span>
  )
}
