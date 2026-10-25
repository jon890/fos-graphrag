// 체결 값을 화면에 보이는 모양으로 바꾼다. 수와 금액은 천 단위 쉼표를 넣는다.

const QUANTITY_FORMAT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 8 })
const MONEY_FORMAT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 4 })

/** 수량. 소수 수량도 그대로 보인다. 예: 「1,234.5」 */
export function formatQuantity(quantity: number): string {
  return QUANTITY_FORMAT.format(quantity)
}

/** 금액에 통화 코드를 붙인다. 예: 「1,234.5 USD」 */
export function formatMoney(amount: number, currency: string): string {
  return `${MONEY_FORMAT.format(amount)} ${currency}`
}

export function sideLabel(side: string): string {
  return side === 'BUY' ? '매수' : side === 'SELL' ? '매도' : side
}
