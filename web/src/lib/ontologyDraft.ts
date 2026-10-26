/** 저장이나 다시 시작 뒤 온톨로지를 다시 읽는다. 읽지 못해도 던지지 않고 성공 여부만 돌려준다 */
export async function reloadSucceeded(reload: () => Promise<void>): Promise<boolean> {
  try {
    await reload()
    return true
  } catch {
    return false
  }
}

export const RELOAD_FAILED_HINT = '온톨로지를 다시 읽지 못했습니다. 다시 읽기를 눌러 주세요.'

/** 다시 시작 뒤 온톨로지를 다시 읽는다. 읽지 못하면 화면에 보일 안내를, 읽었으면 null 을 돌려준다 */
export async function restartError(reload: () => Promise<void>): Promise<string | null> {
  return (await reloadSucceeded(reload)) ? null : RELOAD_FAILED_HINT
}

/** 저장 성공 안내. 다시 읽지 못했으면 그 사실을 덧붙인다 */
export function savedMessage(version: number, reloaded: boolean): string {
  return reloaded ? `버전 ${version} 을 저장했습니다.` : `버전 ${version} 을 저장했지만 ${RELOAD_FAILED_HINT}`
}
