/** public/geo/th/index.json: province name -> code, district name -> province codes that have it. */
export interface AreaIndex {
  p: Record<string, string>;
  d: Record<string, string[]>;
}

/**
 * Finds the province (and district) named in free search text, e.g. "ระยอง", "อ.นิคมพัฒนา จ.ระยอง", "บางพลัด".
 * A district name shared by several provinces only counts when its province is also named.
 */
export function areaFromText(text: string | undefined, index: AreaIndex): { code: string; district?: string } | null {
  if (!text) return null;
  const tokens = text
    .replace(/(จังหวัด|จ\.|อำเภอ|อ\.|เขต|ตำบล|ต\.)/g, " ")
    .split(/[\s,/]+/)
    .filter(Boolean);
  const province = tokens.map((token) => index.p[token]).find(Boolean);
  for (const token of tokens) {
    const codes = index.d[token];
    if (!codes) continue;
    if (province && codes.includes(province)) return { code: province, district: token };
    if (!province && codes.length === 1) return { code: codes[0], district: token };
  }
  return province ? { code: province } : null;
}
