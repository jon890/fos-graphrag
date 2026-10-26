import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** 안내 문장. 화면 단위마다 다르게 줄 수 있다 */
  message?: string
  /** 바뀌면 오류 상태를 풀고 다시 그린다. 탭이 바뀌면 새 탭을 바로 그리게 할 때 쓴다 */
  resetKey?: string
}

interface State {
  error: Error | null
  resetKey: string | undefined
}

export const DEFAULT_ERROR_MESSAGE = '이 화면을 불러오지 못했습니다.'

/** 렌더링 중 던진 오류를 붙잡아 머리글과 탭은 그대로 둔다. 오류가 난 영역만 안내로 바꾼다. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('화면 오류', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <ErrorFallback message={this.props.message} onRetry={() => this.setState({ error: null })} />
  }
}

export function ErrorFallback({ message = DEFAULT_ERROR_MESSAGE, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="error-box" role="alert" data-testid="error-boundary">
      {message}{' '}
      <button type="button" data-testid="error-boundary-retry" onClick={onRetry}>
        다시 시도
      </button>
    </div>
  )
}
