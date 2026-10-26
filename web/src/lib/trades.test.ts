import { describe, expect, it } from 'vitest'
import { formatMoney, formatQuantity, sideLabel } from './trades'

describe('체결 표시', () => {
  it('금액은 천 단위 쉼표와 통화 코드를 붙인다', () => {
    expect(formatMoney(1234.5, 'USD')).toBe('1,234.5 USD')
    expect(formatMoney(0, 'KRW')).toBe('0 KRW')
  })

  it('수량은 소수도 그대로 보인다', () => {
    expect(formatQuantity(0.5)).toBe('0.5')
    expect(formatQuantity(1234)).toBe('1,234')
  })

  it('매수와 매도를 한글로 보이고 모르는 값은 그대로 둔다', () => {
    expect(sideLabel('BUY')).toBe('매수')
    expect(sideLabel('SELL')).toBe('매도')
    expect(sideLabel('X')).toBe('X')
  })
})
