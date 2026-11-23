export function validateUser(u) {
  const errors = {};
  if (typeof u.email !== 'string' || u.email.trim() === '') errors.email = '필수';
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email)) errors.email = '형식 오류';
  if (typeof u.name !== 'string' || u.name.trim() === '') errors.name = '필수';
  else if (u.name.trim().length < 2) errors.name = '너무 짧음';
  else if (u.name.trim().length > 12) errors.name = '너무 김';
  if (typeof u.age !== 'number' || Number.isNaN(u.age)) errors.age = '필수';
  else if (u.age < 0) errors.age = '0 이상';
  else if (u.age > 150) errors.age = '150 이하';
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateProduct(p) {
  const errors = {};
  if (typeof p.title !== 'string' || p.title.trim() === '') errors.title = '필수';
  else if (p.title.trim().length < 2) errors.title = '너무 짧음';
  else if (p.title.trim().length > 50) errors.title = '너무 김';
  if (typeof p.price !== 'number' || Number.isNaN(p.price)) errors.price = '필수';
  else if (p.price < 0) errors.price = '0 이상';
  else if (p.price > 10000000) errors.price = '1000만 이하';
  if (typeof p.sku !== 'string' || p.sku.trim() === '') errors.sku = '필수';
  else if (!/^[A-Z]{2,4}-\d{1,4}$/.test(p.sku)) errors.sku = '형식 오류';
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateReview(r) {
  const errors = {};
  if (typeof r.author !== 'string' || r.author.trim() === '') errors.author = '필수';
  else if (r.author.trim().length < 2) errors.author = '너무 짧음';
  else if (r.author.trim().length > 12) errors.author = '너무 김';
  if (typeof r.rating !== 'number' || Number.isNaN(r.rating)) errors.rating = '필수';
  else if (r.rating < 1) errors.rating = '1 이상';
  else if (r.rating > 5) errors.rating = '5 이하';
  if (typeof r.body !== 'string' || r.body.trim() === '') errors.body = '필수';
  else if (r.body.trim().length > 500) errors.body = '너무 김';
  return { ok: Object.keys(errors).length === 0, errors };
}
