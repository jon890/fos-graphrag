import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ERROR_MESSAGE, ErrorBoundary, ErrorFallback } from './ErrorBoundary'

describe('ErrorBoundary', () => {
  it('렌더링 오류를 붙잡으면 오류 상태로 바뀐다', () => {
    const error = new TypeError('Cannot read properties of null')
    expect(ErrorBoundary.getDerivedStateFromError(error)).toEqual({ error })
  })

  it('오류 상태에서는 children 대신 안내와 「다시 시도」 를 그린다', () => {
    const boundary = new ErrorBoundary({ children: 'child' })
    expect(boundary.render()).toBe('child')
    boundary.state = { error: new Error('boom'), resetKey: undefined }
    const html = renderToStaticMarkup(boundary.render())
    expect(html).toContain(DEFAULT_ERROR_MESSAGE)
    expect(html).toContain('다시 시도')
  })

  it('resetKey 가 바뀌면 오류 상태를 푼다(다른 탭으로 옮기면 새 탭을 바로 그린다)', () => {
    const errored = { error: new Error('boom'), resetKey: 'changes' }
    expect(ErrorBoundary.getDerivedStateFromProps({ children: null, resetKey: 'changes' }, errored)).toBeNull()
    expect(ErrorBoundary.getDerivedStateFromProps({ children: null, resetKey: 'list' }, errored)).toEqual({ error: null, resetKey: 'list' })
  })

  it('안내 문장을 바꿔 쓸 수 있다', () => {
    expect(renderToStaticMarkup(<ErrorFallback message="화면을 그리다 문제가 생겼습니다." onRetry={() => {}} />)).toContain('화면을 그리다')
  })
})
