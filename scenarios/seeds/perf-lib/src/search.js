// 상품 이름 검색: 모든 검색어 토큰이 포함된 상품만, 대소문자 무시
export function searchProducts(products, query) {
  const tokens = query.split(/\s+/).filter(Boolean);
  return products.filter((p) => tokens.every((t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(p.name)));
}
