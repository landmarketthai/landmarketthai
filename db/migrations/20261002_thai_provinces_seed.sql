-- Fill public.provinces with all 77 Thai provinces for the /sell province dropdown.
--
-- Source: Open Admin Data — Thailand administrative divisions 2026.06 (CC-BY-4.0)
--   https://openadmindata.org/th/ · https://github.com/open-admin-data/thailand-administrative-divisions
--   (vendored copy: src/data/thailand-flat.json). lat/lng are approximate province centers.
--
-- Safe + idempotent:
-- * Existing rows are matched by name_th (ignoring a leading "จังหวัด"), known legacy aliases, or slug.
--   Their id and slug are never changed (property_submissions/lands/buyer_* reference provinces.id).
-- * Matched rows only get blank metadata filled: lat/lng when null, name_en when empty.
-- * Unmatched provinces are inserted with a generated UUID and a stable slug; on slug conflict the row is skipped.
-- * Fails (and rolls back) if any of the 77 provinces is still missing afterwards.

begin;

create temporary table thai_provinces_src (
  name_th text primary key,
  name_en text not null,
  slug    text not null unique,
  region  text,
  lat     numeric(10,6),
  lng     numeric(10,6),
  aliases text[] not null default '{}'  -- legacy name_th / slug values already used in production
) on commit drop;

insert into thai_provinces_src (name_th, name_en, slug, region, lat, lng, aliases) values
  ('กรุงเทพมหานคร',     'Bangkok',                  'bangkok',                  null,  13.753, 100.5,   array['กรุงเทพ','กรุงเทพฯ']),
  ('สมุทรปราการ',       'Samut Prakan',             'samut-prakan',             null,  13.656, 100.533, '{}'),
  ('นนทบุรี',           'Nonthaburi',               'nonthaburi',               null,  13.914, 100.422, '{}'),
  ('ปทุมธานี',          'Pathum Thani',             'pathum-thani',             null,  14.031, 100.552, '{}'),
  ('พระนครศรีอยุธยา',   'Phra Nakhon Si Ayutthaya', 'phra-nakhon-si-ayutthaya', null,  14.328, 100.404, array['อยุธยา','ayutthaya']),
  ('อ่างทอง',           'Ang Thong',                'ang-thong',                null,  14.588, 100.459, '{}'),
  ('ลพบุรี',            'Lop Buri',                 'lop-buri',                 null,  14.802, 100.611, array['lopburi','loburi']),
  ('สิงห์บุรี',          'Sing Buri',                'sing-buri',                null,  14.89,  100.404, array['singburi']),
  ('ชัยนาท',            'Chai Nat',                 'chai-nat',                 null,  15.263, 100.041, array['chainat']),
  ('สระบุรี',           'Saraburi',                 'saraburi',                 null,  14.586, 101.002, '{}'),
  ('ชลบุรี',            'Chon Buri',                'chon-buri',                'EEC', 12.611, 100.889, array['chonburi']),
  ('ระยอง',             'Rayong',                   'rayong',                   'EEC', 12.646, 101.171, '{}'),
  ('จันทบุรี',           'Chanthaburi',              'chanthaburi',              null,  12.465, 102.066, '{}'),
  ('ตราด',              'Trat',                     'trat',                     null,  11.817, 102.397, '{}'),
  ('ฉะเชิงเทรา',        'Chachoengsao',             'chachoengsao',             'EEC', 13.707, 101.1,   '{}'),
  ('ปราจีนบุรี',         'Prachin Buri',             'prachin-buri',             null,  14.057, 101.374, array['prachinburi']),
  ('นครนายก',           'Nakhon Nayok',             'nakhon-nayok',             null,  14.204, 101.219, '{}'),
  ('สระแก้ว',           'Sa Kaeo',                  'sa-kaeo',                  null,  13.68,  102.517, '{}'),
  ('นครราชสีมา',        'Nakhon Ratchasima',        'nakhon-ratchasima',        null,  14.909, 101.851, array['korat']),
  ('บุรีรัมย์',           'Buri Ram',                 'buri-ram',                 null,  14.999, 103.104, array['buriram']),
  ('สุรินทร์',           'Surin',                    'surin',                    null,  14.884, 103.49,  '{}'),
  ('ศรีสะเกษ',          'Si Sa Ket',                'si-sa-ket',                null,  14.669, 104.271, array['sisaket']),
  ('อุบลราชธานี',       'Ubon Ratchathani',         'ubon-ratchathani',         null,  15.244, 104.894, '{}'),
  ('ยโสธร',             'Yasothon',                 'yasothon',                 null,  15.799, 104.148, '{}'),
  ('ชัยภูมิ',            'Chaiyaphum',               'chaiyaphum',               null,  16.61,  101.921, '{}'),
  ('อำนาจเจริญ',        'Amnat Charoen',            'amnat-charoen',            null,  15.823, 104.562, '{}'),
  ('บึงกาฬ',            'Bueng Kan',                'bueng-kan',                null,  18.031, 103.711, array['buogkan','buengkan']),
  ('หนองบัวลำภู',       'Nong Bua Lam Phu',         'nong-bua-lam-phu',         null,  17.308, 102.117, '{}'),
  ('ขอนแก่น',           'Khon Kaen',                'khon-kaen',                null,  16.035, 102.723, '{}'),
  ('อุดรธานี',          'Udon Thani',               'udon-thani',               null,  17.411, 102.792, '{}'),
  ('เลย',               'Loei',                     'loei',                     null,  17.493, 101.732, '{}'),
  ('หนองคาย',           'Nong Khai',                'nong-khai',                null,  17.89,  102.761, '{}'),
  ('มหาสารคาม',         'Maha Sarakham',            'maha-sarakham',            null,  16.162, 103.484, '{}'),
  ('ร้อยเอ็ด',           'Roi Et',                   'roi-et',                   null,  15.6,   104.139, '{}'),
  ('กาฬสินธุ์',          'Kalasin',                  'kalasin',                  null,  16.266, 103.737, '{}'),
  ('สกลนคร',            'Sakon Nakhon',             'sakon-nakhon',             null,  17.125, 104.26,  '{}'),
  ('นครพนม',            'Nakhon Phanom',            'nakhon-phanom',            null,  17.066, 104.749, '{}'),
  ('มุกดาหาร',          'Mukdahan',                 'mukdahan',                 null,  16.53,  104.724, '{}'),
  ('เชียงใหม่',          'Chiang Mai',               'chiang-mai',               null,  18.785, 98.985,  '{}'),
  ('ลำพูน',             'Lamphun',                  'lamphun',                  null,  18.537, 98.933,  '{}'),
  ('ลำปาง',             'Lampang',                  'lampang',                  null,  18.752, 99.996,  '{}'),
  ('อุตรดิตถ์',          'Uttaradit',                'uttaradit',                null,  17.652, 100.039, '{}'),
  ('แพร่',              'Phrae',                    'phrae',                    null,  18.14,  100.142, '{}'),
  ('น่าน',              'Nan',                      'nan',                      null,  18.793, 100.786, '{}'),
  ('พะเยา',             'Phayao',                   'phayao',                   null,  19.172, 99.894,  '{}'),
  ('เชียงราย',          'Chiang Rai',               'chiang-rai',               null,  19.907, 99.832,  '{}'),
  ('แม่ฮ่องสอน',         'Mae Hong Son',             'mae-hong-son',             null,  19.302, 97.97,   '{}'),
  ('นครสวรรค์',         'Nakhon Sawan',             'nakhon-sawan',             null,  15.896, 100.315, '{}'),
  ('อุทัยธานี',          'Uthai Thani',              'uthai-thani',              null,  15.371, 99.9,    '{}'),
  ('กำแพงเพชร',         'Kamphaeng Phet',           'kamphaeng-phet',           null,  16.473, 99.528,  '{}'),
  ('ตาก',               'Tak',                      'tak',                      null,  16.862, 99.129,  '{}'),
  ('สุโขทัย',            'Sukhothai',                'sukhothai',                null,  17.012, 99.822,  '{}'),
  ('พิษณุโลก',          'Phitsanulok',              'phitsanulok',              null,  16.789, 100.25,  '{}'),
  ('พิจิตร',            'Phichit',                  'phichit',                  null,  16.222, 100.427, '{}'),
  ('เพชรบูรณ์',          'Phetchabun',               'phetchabun',               null,  16.839, 101.239, '{}'),
  ('ราชบุรี',            'Ratchaburi',               'ratchaburi',               null,  13.816, 99.873,  '{}'),
  ('กาญจนบุรี',          'Kanchanaburi',             'kanchanaburi',             null,  13.954, 99.752,  '{}'),
  ('สุพรรณบุรี',         'Suphan Buri',              'suphan-buri',              null,  14.85,  99.988,  array['suphanburi']),
  ('นครปฐม',            'Nakhon Pathom',            'nakhon-pathom',            null,  13.787, 100.192, '{}'),
  ('สมุทรสาคร',         'Samut Sakhon',             'samut-sakhon',             null,  13.533, 100.276, '{}'),
  ('สมุทรสงคราม',       'Samut Songkhram',          'samut-songkhram',          null,  13.487, 99.958,  '{}'),
  ('เพชรบุรี',           'Phetchaburi',              'phetchaburi',              null,  13.121, 99.9,    '{}'),
  ('ประจวบคีรีขันธ์',    'Prachuap Khiri Khan',      'prachuap-khiri-khan',      null,  11.805, 99.784,  '{}'),
  ('นครศรีธรรมราช',     'Nakhon Si Thammarat',      'nakhon-si-thammarat',      null,  9.324,  99.775,  '{}'),
  ('กระบี่',             'Krabi',                    'krabi',                    null,  8.049,  98.676,  '{}'),
  ('พังงา',             'Phang Nga',                'phang-nga',                null,  9.406,  97.901,  array['phangnga']),
  ('ภูเก็ต',             'Phuket',                   'phuket',                   null,  7.924,  98.455,  '{}'),
  ('สุราษฎร์ธานี',       'Surat Thani',              'surat-thani',              null,  9.708,  99.675,  '{}'),
  ('ระนอง',             'Ranong',                   'ranong',                   null,  9.401,  98.392,  '{}'),
  ('ชุมพร',             'Chumphon',                 'chumphon',                 null,  10.459, 99.403,  '{}'),
  ('สงขลา',             'Songkhla',                 'songkhla',                 null,  7.561,  100.356, '{}'),
  ('สตูล',              'Satun',                    'satun',                    null,  6.546,  99.706,  '{}'),
  ('ตรัง',              'Trang',                    'trang',                    null,  7.033,  99.449,  '{}'),
  ('พัทลุง',             'Phatthalung',              'phatthalung',              null,  7.589,  100.05,  '{}'),
  ('ปัตตานี',            'Pattani',                  'pattani',                  null,  6.87,   101.256, '{}'),
  ('ยะลา',              'Yala',                     'yala',                     null,  6.464,  101.374, '{}'),
  ('นราธิวาส',          'Narathiwat',               'narathiwat',               null,  6.424,  101.82,  '{}');

-- Existing province rows -> dataset province (by Thai name, legacy alias, or slug).
create temporary table thai_provinces_match on commit drop as
select p.id, s.name_th as src_name
from provinces p
join thai_provinces_src s
  on regexp_replace(btrim(p.name_th), '^จังหวัด\s*', '') = s.name_th
  or regexp_replace(btrim(p.name_th), '^จังหวัด\s*', '') = any(s.aliases)
  or p.slug = s.slug
  or p.slug = any(s.aliases);

-- Harmless metadata only: never touch id, slug, name_th or region of existing rows.
update provinces p set
  lat = coalesce(p.lat, s.lat),
  lng = coalesce(p.lng, s.lng),
  name_en = case when btrim(coalesce(p.name_en, '')) = '' then s.name_en else p.name_en end
from thai_provinces_match m
join thai_provinces_src s on s.name_th = m.src_name
where p.id = m.id
  and (p.lat is null or p.lng is null or btrim(coalesce(p.name_en, '')) = '');

insert into provinces (id, name_th, name_en, slug, region, lat, lng)
select gen_random_uuid(), s.name_th, s.name_en, s.slug, s.region, s.lat, s.lng
from thai_provinces_src s
where not exists (select 1 from thai_provinces_match m where m.src_name = s.name_th)
on conflict (slug) do nothing;

do $$
declare missing text;
begin
  select string_agg(s.name_th, ', ') into missing
  from thai_provinces_src s
  where not exists (
    select 1 from provinces p
    where regexp_replace(btrim(p.name_th), '^จังหวัด\s*', '') = s.name_th
       or regexp_replace(btrim(p.name_th), '^จังหวัด\s*', '') = any(s.aliases)
  );
  if missing is not null then
    raise exception 'Thai province seed incomplete; missing: %', missing;
  end if;
end $$;

commit;

-- Verify: select count(*) from provinces;  -- expect >= 77 (exactly 77 if no extra legacy rows)
