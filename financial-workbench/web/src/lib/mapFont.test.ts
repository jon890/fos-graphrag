import { describe, expect, it } from 'vitest'
import { MAP_EDGE_FONT, MAP_NODE_FONT, readableFontSize } from './mapFont'

describe('readableFontSize', () => {
  for (const font of [MAP_NODE_FONT, MAP_EDGE_FONT]) {
    for (const zoom of [1.2, 1, 0.5, 0.2]) {
      it(`기본 ${font.base} 는 배율 ${zoom} 에서 화면 크기가 ${font.minPx}px 이상이다`, () => {
        const value = readableFontSize(font.base, font.minPx, zoom)
        expect(value).toBeCloseTo(Math.max(font.base, font.minPx / zoom))
        expect(value * zoom).toBeGreaterThanOrEqual(font.minPx - 1e-9)
      })
    }

    it(`기본 ${font.base} 는 배율 2 에서 기본 크기다`, () => {
      expect(readableFontSize(font.base, font.minPx, 2)).toBe(font.base)
    })
  }

  it('배율 1 근처에서도 노드 글자를 13px 로 키운다', () => {
    expect(readableFontSize(12, 13, 1)).toBe(13)
    expect(readableFontSize(12, 13, 0.5)).toBe(26)
  })
})
