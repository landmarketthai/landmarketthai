-- Correct the boundary/deed map total: 39,289 + 1,133 = 40,422 sq.wah.
-- 20260929_marketplace_v2.sql makes total_price writable (drops generated expression).
-- Safe to rerun; does nothing if this slug is absent. Do not change lifecycle/trust fields.
UPDATE lands
SET size_rai = 101.055,
    area_rai = 101,
    area_ngan = 0,
    area_sqwa = 22,
    price_per_rai = 1500000,
    total_price = 151582500
WHERE slug = '101-rai-kabin-buri';
