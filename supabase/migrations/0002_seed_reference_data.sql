-- ============================================================================
-- Reference data: home-page location tiles, subway tiles, amenity vocabulary.
-- Coordinates are district/city centroids — good enough to centre a map.
-- Individual properties get precise coordinates from Kakao geocoding on import.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 10 Seoul districts. Chosen for where 고시원/셰어하우스 demand actually is:
-- university belts (관악/서대문/마포/동작), CBD (종로/중구/영등포),
-- and the Gangnam job centres (강남/서초/송파).
-- ---------------------------------------------------------------------------
insert into public.regions (slug, name_ko, name_en, tier, parent_ko, parent_en, image_url, lat, lng, sort_order) values
  ('gangnam-gu',     '강남구',   'Gangnam-gu',     'seoul', '서울특별시', 'Seoul', '/images/regions/gangnam-gu.jpg',     37.5172, 127.0473,  1),
  ('seocho-gu',      '서초구',   'Seocho-gu',      'seoul', '서울특별시', 'Seoul', '/images/regions/seocho-gu.jpg',      37.4837, 127.0324,  2),
  ('songpa-gu',      '송파구',   'Songpa-gu',      'seoul', '서울특별시', 'Seoul', '/images/regions/songpa-gu.jpg',      37.5145, 127.1059,  3),
  ('mapo-gu',        '마포구',   'Mapo-gu',        'seoul', '서울특별시', 'Seoul', '/images/regions/mapo-gu.jpg',        37.5638, 126.9084,  4),
  ('seodaemun-gu',   '서대문구', 'Seodaemun-gu',   'seoul', '서울특별시', 'Seoul', '/images/regions/seodaemun-gu.jpg',   37.5791, 126.9368,  5),
  ('gwanak-gu',      '관악구',   'Gwanak-gu',      'seoul', '서울특별시', 'Seoul', '/images/regions/gwanak-gu.jpg',      37.4784, 126.9516,  6),
  ('jongno-gu',      '종로구',   'Jongno-gu',      'seoul', '서울특별시', 'Seoul', '/images/regions/jongno-gu.jpg',      37.5735, 126.9790,  7),
  ('jung-gu-seoul',  '중구',     'Jung-gu',        'seoul', '서울특별시', 'Seoul', '/images/regions/jung-gu-seoul.jpg',  37.5636, 126.9976,  8),
  ('yeongdeungpo-gu','영등포구', 'Yeongdeungpo-gu','seoul', '서울특별시', 'Seoul', '/images/regions/yeongdeungpo-gu.jpg',37.5264, 126.8962,  9),
  ('dongjak-gu',     '동작구',   'Dongjak-gu',     'seoul', '서울특별시', 'Seoul', '/images/regions/dongjak-gu.jpg',     37.5124, 126.9393, 10);

-- 5 Incheon districts
insert into public.regions (slug, name_ko, name_en, tier, parent_ko, parent_en, image_url, lat, lng, sort_order) values
  ('yeonsu-gu',    '연수구',   'Yeonsu-gu',    'incheon', '인천광역시', 'Incheon', '/images/regions/yeonsu-gu.jpg',    37.4101, 126.6784, 1),
  ('namdong-gu',   '남동구',   'Namdong-gu',   'incheon', '인천광역시', 'Incheon', '/images/regions/namdong-gu.jpg',   37.4471, 126.7314, 2),
  ('bupyeong-gu',  '부평구',   'Bupyeong-gu',  'incheon', '인천광역시', 'Incheon', '/images/regions/bupyeong-gu.jpg',  37.5070, 126.7219, 3),
  ('michuhol-gu',  '미추홀구', 'Michuhol-gu',  'incheon', '인천광역시', 'Incheon', '/images/regions/michuhol-gu.jpg',  37.4636, 126.6503, 4),
  ('seo-gu-incheon','서구',    'Seo-gu',       'incheon', '인천광역시', 'Incheon', '/images/regions/seo-gu-incheon.jpg',37.5455, 126.6759, 5);

-- 10 other major Korean cities
insert into public.regions (slug, name_ko, name_en, tier, parent_ko, parent_en, image_url, lat, lng, sort_order) values
  ('busan',     '부산광역시', 'Busan',     'major_city', null, null, '/images/regions/busan.jpg',     35.1796, 129.0756,  1),
  ('daegu',     '대구광역시', 'Daegu',     'major_city', null, null, '/images/regions/daegu.jpg',     35.8714, 128.6014,  2),
  ('daejeon',   '대전광역시', 'Daejeon',   'major_city', null, null, '/images/regions/daejeon.jpg',   36.3504, 127.3845,  3),
  ('gwangju',   '광주광역시', 'Gwangju',   'major_city', null, null, '/images/regions/gwangju.jpg',   35.1595, 126.8526,  4),
  ('ulsan',     '울산광역시', 'Ulsan',     'major_city', null, null, '/images/regions/ulsan.jpg',     35.5384, 129.3114,  5),
  ('suwon',     '수원시',     'Suwon',     'major_city', '경기도', 'Gyeonggi-do', '/images/regions/suwon.jpg',     37.2636, 127.0286,  6),
  ('seongnam',  '성남시',     'Seongnam',  'major_city', '경기도', 'Gyeonggi-do', '/images/regions/seongnam.jpg',  37.4200, 127.1267,  7),
  ('goyang',    '고양시',     'Goyang',    'major_city', '경기도', 'Gyeonggi-do', '/images/regions/goyang.jpg',    37.6584, 126.8320,  8),
  ('cheonan',   '천안시',     'Cheonan',   'major_city', '충청남도', 'Chungcheongnam-do', '/images/regions/cheonan.jpg', 36.8151, 127.1139,  9),
  ('cheongju',  '청주시',     'Cheongju',  'major_city', '충청북도', 'Chungcheongbuk-do', '/images/regions/cheongju.jpg', 36.6424, 127.4890, 10);

-- ---------------------------------------------------------------------------
-- 10 featured Seoul subway stations.
-- ---------------------------------------------------------------------------
insert into public.subway_stations (slug, name_ko, name_en, lines_ko, lines_en, image_url, lat, lng, is_featured, sort_order) values
  ('gangnam',      '강남역',     'Gangnam',            '{"2호선","신분당선"}',              '{"Line 2","Sinbundang"}',                      '/images/subway/gangnam.jpg',      37.4979, 127.0276, true,  1),
  ('hongik-univ',  '홍대입구역', 'Hongik Univ.',       '{"2호선","공항철도","경의중앙선"}', '{"Line 2","AREX","Gyeongui-Jungang"}',         '/images/subway/hongik-univ.jpg',  37.5572, 126.9245, true,  2),
  ('sinchon',      '신촌역',     'Sinchon',            '{"2호선"}',                          '{"Line 2"}',                                   '/images/subway/sinchon.jpg',      37.5551, 126.9368, true,  3),
  ('seoul-station','서울역',     'Seoul Station',      '{"1호선","4호선","공항철도","경의중앙선"}', '{"Line 1","Line 4","AREX","Gyeongui-Jungang"}', '/images/subway/seoul-station.jpg', 37.5546, 126.9707, true,  4),
  ('jamsil',       '잠실역',     'Jamsil',             '{"2호선","8호선"}',                  '{"Line 2","Line 8"}',                          '/images/subway/jamsil.jpg',       37.5133, 127.1000, true,  5),
  ('konkuk-univ',  '건대입구역', 'Konkuk Univ.',       '{"2호선","7호선"}',                  '{"Line 2","Line 7"}',                          '/images/subway/konkuk-univ.jpg',  37.5405, 127.0700, true,  6),
  ('sillim',       '신림역',     'Sillim',             '{"2호선"}',                          '{"Line 2"}',                                   '/images/subway/sillim.jpg',       37.4842, 126.9296, true,  7),
  ('sadang',       '사당역',     'Sadang',             '{"2호선","4호선"}',                  '{"Line 2","Line 4"}',                          '/images/subway/sadang.jpg',       37.4766, 126.9816, true,  8),
  ('yeouido',      '여의도역',   'Yeouido',            '{"5호선","9호선"}',                  '{"Line 5","Line 9"}',                          '/images/subway/yeouido.jpg',      37.5215, 126.9243, true,  9),
  ('jongno-3ga',   '종로3가역',  'Jongno 3-ga',        '{"1호선","3호선","5호선"}',          '{"Line 1","Line 3","Line 5"}',                 '/images/subway/jongno-3ga.jpg',   37.5704, 126.9917, true, 10);

-- ---------------------------------------------------------------------------
-- Amenity vocabulary, grouped the way the reference site groups them.
-- ---------------------------------------------------------------------------
insert into public.amenities (slug, name_ko, name_en, category, icon, sort_order) values
  -- living
  ('bed',            '침대',        'Bed',                'living',  'bed',        1),
  ('desk',           '책상',        'Desk',               'living',  'desk',       2),
  ('chair',          '의자',        'Chair',              'living',  'armchair',   3),
  ('wardrobe',       '옷장',        'Wardrobe',           'living',  'shirt',      4),
  ('wifi',           '와이파이',    'WiFi',               'living',  'wifi',       5),
  ('aircon-private', '개별 에어컨', 'Private AC',         'living',  'wind',       6),
  ('heating',        '난방',        'Heating',            'living',  'flame',      7),
  ('tv',             'TV',          'TV',                 'living',  'tv',         8),
  ('window',         '창문',        'Window',             'living',  'panel-top',  9),
  ('private-bath',   '개인 욕실',   'Private Bathroom',   'living',  'shower-head',10),

  -- safety
  ('cctv',           'CCTV',        'CCTV',               'safety',  'cctv',       1),
  ('door-lock',      '도어락',      'Digital Door Lock',  'safety',  'lock',       2),
  ('fire-equipment', '소방 설비',   'Fire Equipment',     'safety',  'fire-extinguisher', 3),
  ('security-24h',   '24시간 보안', '24h Security',       'safety',  'shield',     4),
  ('female-only-floor','여성 전용 층','Female-only Floor','safety',  'user-check', 5),

  -- kitchen
  ('shared-kitchen', '공용 주방',   'Shared Kitchen',     'kitchen', 'cooking-pot',1),
  ('cooktop',        '인덕션/가스레인지','Cooktop',       'kitchen', 'flame',      2),
  ('microwave',      '전자레인지',  'Microwave',          'kitchen', 'microwave',  3),
  ('fridge-shared',  '공용 냉장고', 'Shared Fridge',      'kitchen', 'refrigerator',4),
  ('fridge-private', '개인 냉장고', 'Private Fridge',     'kitchen', 'refrigerator',5),
  ('water-purifier', '정수기',      'Water Purifier',     'kitchen', 'droplets',   6),
  ('cookware',       '조리도구',    'Cookware',           'kitchen', 'utensils',   7),
  ('rice-free',      '쌀 무료 제공','Free Rice',          'kitchen', 'wheat',      8),
  ('ramen-free',     '라면 무료 제공','Free Ramen',       'kitchen', 'soup',       9),

  -- laundry
  ('washer',         '세탁기',      'Washing Machine',    'laundry', 'washing-machine', 1),
  ('dryer',          '건조기',      'Dryer',              'laundry', 'air-vent',   2),
  ('drying-rack',    '건조대',      'Drying Rack',        'laundry', 'grip',       3),

  -- provided
  ('bedding',        '침구 제공',   'Bedding Provided',   'provided','bed-double', 1),
  ('towels',         '수건 제공',   'Towels Provided',    'provided','bath',       2),
  ('toiletries',     '세면용품',    'Toiletries',         'provided','soap',       3),
  ('cleaning',       '청소 서비스', 'Cleaning Service',   'provided','sparkles',   4),
  ('utilities-incl', '공과금 포함', 'Utilities Included', 'provided','plug',       5),

  -- shared spaces
  ('lounge',         '라운지',      'Lounge',             'shared',  'sofa',       1),
  ('study-room',     '독서실',      'Study Room',         'shared',  'book-open',  2),
  ('rooftop',        '옥상',        'Rooftop',            'shared',  'building',   3),
  ('parking',        '주차장',      'Parking',            'shared',  'car',        4),
  ('elevator',       '엘리베이터',  'Elevator',           'shared',  'move-vertical',5),
  ('bike-storage',   '자전거 보관소','Bike Storage',      'shared',  'bike',       6);
