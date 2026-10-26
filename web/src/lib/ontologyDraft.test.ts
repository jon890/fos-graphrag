import { describe, expect, it } from 'vitest'
import { RELOAD_FAILED_HINT, reloadSucceeded, restartError, savedMessage } from './ontologyDraft'

describe('reloadSucceeded', () => {
  it('다시 읽기가 실패해도 던지지 않고 false 를 돌려준다', async () => {
    expect(await reloadSucceeded(async () => {})).toBe(true)
    expect(await reloadSucceeded(() => Promise.reject(new Error('down')))).toBe(false)
  })

  it('다시 시작 뒤 다시 읽기가 성공하면 null, 실패하면 안내 문구를 돌려준다', async () => {
    expect(await restartError(async () => {})).toBeNull()
    expect(await restartError(() => Promise.reject(new Error('down')))).toBe(RELOAD_FAILED_HINT)
  })

  it('저장 안내는 다시 읽지 못했을 때 그 사실을 덧붙인다', () => {
    expect(savedMessage(3, true)).toBe('버전 3 을 저장했습니다.')
    expect(savedMessage(3, false)).toBe(`버전 3 을 저장했지만 ${RELOAD_FAILED_HINT}`)
  })
})
