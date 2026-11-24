// 단어 목록 -> { 단어: 등장횟수 }  (키 삽입 순서 유지)
export function countBy(words) {
  return words.reduce((acc, w) => ({ ...acc, [w]: (acc[w] || 0) + 1 }), {});
}
