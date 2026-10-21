import { api } from '../api/client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

interface Props {
  /** /?login=denied 로 돌아왔을 때 */
  denied: boolean
  notice?: string
}

/** 로그인 화면. Google OIDC 하나뿐이다. 버튼은 fetch 가 아니라 브라우저 이동이다. */
export function LoginView({ denied, notice }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-[360px]" data-testid="login-form">
        <CardHeader>
          <h1 className="text-lg font-bold">금융 온톨로지 워크벤치</h1>
          <CardDescription>관리자가 허용한 Google 계정으로만 로그인할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {denied && (
            <Alert variant="destructive" data-testid="login-denied">
              <AlertDescription>접근 권한이 없습니다. 관리자에게 허용을 요청하세요.</AlertDescription>
            </Alert>
          )}
          {!denied && notice && (
            <Alert role={undefined} className="border-blue-300 bg-blue-50" data-testid="login-notice">
              <AlertDescription className="text-foreground">{notice}</AlertDescription>
            </Alert>
          )}
          <Button type="button" data-testid="login-google" onClick={() => api.auth.startGoogleLogin()}>
            {denied ? '다른 계정으로 다시 로그인' : 'Google 로 로그인'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
