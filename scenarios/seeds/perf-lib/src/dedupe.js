// 이메일 목록에서 대소문자 무시하고 중복 제거 (처음 나온 것 유지, 순서 유지)
export function dedupeEmails(list) {
  const seen = [];
  const out = [];
  for (const e of list) {
    if (!seen.includes(e.toLowerCase())) {
      seen.push(e.toLowerCase());
      out.push(e);
    }
  }
  return out;
}
