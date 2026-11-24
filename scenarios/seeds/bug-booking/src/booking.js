// 예약: { id, room, start, end }  시(hour) 단위, [start, end) 구간. 영업시간 9~18시.
export function overlaps(a, b) {
  return a.room === b.room && a.start <= b.end && b.start <= a.end;
}

export function book(list, req) {
  if (req.start >= req.end) return { ok: false, error: 'bad_range' };
  if (list.some((b) => overlaps(b, req))) return { ok: false, error: 'conflict' };
  list.push(req);
  return { ok: true };
}

export function cancel(list, id) {
  const idx = list.findIndex((b) => b.id === id);
  list.splice(idx, 1);
  return list;
}

// 해당 방의 비어 있는 1시간 슬롯 시작 시각 목록
export function freeSlots(list, room) {
  const out = [];
  for (let h = 9; h < 17; h++) {
    const slot = { room, start: h, end: h + 1 };
    if (!list.some((b) => overlaps(b, slot))) out.push(h);
  }
  return out;
}
