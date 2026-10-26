/** 1부터 세는 line 번째 줄의 [start, end) 위치. 줄 수보다 큰 번호는 마지막 줄이고, end 는 줄바꿈을 뺀 끝이다 */
export function lineRange(text: string, line: number): { start: number; end: number } {
  const lines = text.split('\n')
  const index = Math.min(Math.max(line, 1), lines.length) - 1
  let start = 0
  for (let i = 0; i < index; i++) start += lines[i].length + 1
  return { start, end: start + lines[index].length }
}
