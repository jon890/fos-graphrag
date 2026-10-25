// 개념 지도 글자 크기 규칙. docs/flow.md 「개념 지도」 와 같다.
// min-zoomed-font-size 는 작아진 글자를 숨기기만 하므로 쓰지 않고, 글자 크기를 배율로 나눠 화면 크기를 지킨다.

export interface MapFont {
  /** 배율 1 의 스타일 값 */
  base: number
  /** 화면에 그려지는 최소 크기(px) */
  minPx: number
}

export const MAP_NODE_FONT: MapFont = { base: 12, minPx: 13 }
export const MAP_EDGE_FONT: MapFont = { base: 10, minPx: 11 }

/** 스타일에 둘 글자 크기. 화면 크기(값 × zoom)가 minPx 아래로 내려가지 않고, 많이 확대하면 base 다 */
export function readableFontSize(base: number, minPx: number, zoom: number): number {
  return Math.max(base, minPx / zoom)
}
