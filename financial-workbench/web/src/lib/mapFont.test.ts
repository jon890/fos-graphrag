import { describe, expect, it } from 'vitest'
import { MAP_EDGE_FONT, MAP_NODE_FONT, readableFontSize } from './mapFont'

describe('readableFontSize', () => {
  // 배율마다 기대하는 스타일 값. 화면 크기(값 × 배율)가 최소 크기 아래로 내려가지 않는다
  const cases = [
    { font: MAP_NODE_FONT, zoom: 1.2, value: 12 },
    { font: MAP_NODE_FONT, zoom: 1, value: 13 },
    { font: MAP_NODE_FONT, zoom: 0.5, value: 26 },
    { font: MAP_NODE_FONT, zoom: 0.2, value: 65 },
    { font: MAP_EDGE_FONT, zoom: 1.2, value: 10 },
    { font: MAP_EDGE_FONT, zoom: 1, value: 11 },
    { font: MAP_EDGE_FONT, zoom: 0.5, value: 22 },
    { font: MAP_EDGE_FONT, zoom: 0.2, value: 55 },
  ]
  for (const { font, zoom, value } of cases) {
    it(`기본 ${font.base} 는 배율 ${zoom} 에서 ${value} 이고 화면 크기가 ${font.minPx}px 이상이다`, () => {
      const actual = readableFontSize(font.base, font.minPx, zoom)
      expect(actual).toBeCloseTo(value)
      expect(actual * zoom).toBeGreaterThanOrEqual(font.minPx - 1e-9)
    })
  }

  for (const font of [MAP_NODE_FONT, MAP_EDGE_FONT]) {
    it(`기본 ${font.base} 는 배율 2 에서 기본 크기다`, () => {
      expect(readableFontSize(font.base, font.minPx, 2)).toBe(font.base)
    })
  }
})
