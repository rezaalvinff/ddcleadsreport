-- Master Cabang DIPO — dealer dan grup WhatsApp DDC.
--
-- Jalankan SEKALI di Supabase → SQL Editor, setelah migrasi skema.
-- Aman dijalankan ulang: baris yang sudah ada dilewati (on conflict do nothing).
--
-- Nama grup ditulis persis seperti di WhatsApp agar mudah dicari.
-- Link undangan sengaja dikosongkan; isi lewat Master Cabang bila ada.
--
-- Tiga grup ditandai NONAKTIF karena lokasinya belum pasti (lihat bagian C).
-- Aktifkan dan perbaiki wilayahnya lewat halaman Master Cabang.

-- A. Dealer ------------------------------------------------------------------
insert into public.dealers (dealer_name, city, province, reporting_region) values
  ('DIPO PURI INDAH',        'Jakarta Barat',       'DKI Jakarta',        'JABODETABEK'),
  ('DIPO KELAPA GADING',     'Jakarta Utara',       'DKI Jakarta',        'JABODETABEK'),
  ('DIPO GOLF ISLAND',       'Jakarta Utara',       'DKI Jakarta',        'JABODETABEK'),
  ('DIPO PLUIT',             'Jakarta Utara',       'DKI Jakarta',        'JABODETABEK'),
  ('DIPO PONDOK INDAH',      'Jakarta Selatan',     'DKI Jakarta',        'JABODETABEK'),

  ('DIPO RANCAEKEK',         'Kabupaten Bandung',   'Jawa Barat',         'JAWA BARAT'),
  ('DIPO TASIKMALAYA',       'Tasikmalaya',         'Jawa Barat',         'JAWA BARAT'),
  ('DIPO GARUT',             'Garut',               'Jawa Barat',         'JAWA BARAT'),

  ('DIPO TANGERANG',         'Tangerang',           'Banten',             'BANTEN'),
  ('DIPO CIPUTAT',           'Tangerang Selatan',   'Banten',             'BANTEN'),
  ('DIPO BALARAJA',          'Kabupaten Tangerang', 'Banten',             'BANTEN'),
  ('DIPO RANGKASBITUNG',     'Lebak',               'Banten',             'BANTEN'),
  ('DIPO LINGKAR SELATAN',   'Cilegon',             'Banten',             'BANTEN'),

  ('DIPO SIDOARJO',          'Sidoarjo',            'Jawa Timur',         'JAWA TIMUR'),
  ('DIPO JEMBER',            'Jember',              'Jawa Timur',         'JAWA TIMUR'),
  ('DIPO MADIUN',            'Madiun',              'Jawa Timur',         'JAWA TIMUR'),
  ('DIPO BANYUWANGI',        'Banyuwangi',          'Jawa Timur',         'JAWA TIMUR'),

  ('DIPO SM RAJA MEDAN',     'Medan',               'Sumatera Utara',     'SUMATERA & KALIMANTAN'),
  ('DIPO MEDAN RINGROAD',    'Medan',               'Sumatera Utara',     'SUMATERA & KALIMANTAN'),
  ('DIPO BINJAI',            'Binjai',              'Sumatera Utara',     'SUMATERA & KALIMANTAN'),
  ('DIPO PEMATANGSIANTAR',   'Pematangsiantar',     'Sumatera Utara',     'SUMATERA & KALIMANTAN'),
  ('DIPO PADANGSIDIMPUAN',   'Padangsidimpuan',     'Sumatera Utara',     'SUMATERA & KALIMANTAN'),
  ('DIPO RANTAUPRAPAT',      'Labuhanbatu',         'Sumatera Utara',     'SUMATERA & KALIMANTAN'),
  ('DIPO PADANG BYPASS',     'Padang',              'Sumatera Barat',     'SUMATERA & KALIMANTAN'),
  ('DIPO BUKITTINGGI',       'Bukittinggi',         'Sumatera Barat',     'SUMATERA & KALIMANTAN'),
  ('DIPO PASAMAN',           'Pasaman',             'Sumatera Barat',     'SUMATERA & KALIMANTAN'),
  ('DIPO PEKANBARU',         'Pekanbaru',           'Riau',               'SUMATERA & KALIMANTAN'),
  ('DIPO JAMBI',             'Jambi',               'Jambi',              'SUMATERA & KALIMANTAN'),
  ('DIPO BENGKULU',          'Bengkulu',            'Bengkulu',           'SUMATERA & KALIMANTAN'),
  ('DIPO LAMPUNG',           'Bandar Lampung',      'Lampung',            'SUMATERA & KALIMANTAN'),
  ('DIPO BALIKPAPAN',        'Balikpapan',          'Kalimantan Timur',   'SUMATERA & KALIMANTAN')
on conflict do nothing;

-- B. Grup WhatsApp ------------------------------------------------------------
-- Kolom: nama grup (persis seperti di WhatsApp), dealer, wilayah, aktif.
-- Dealer NULL = grup area/gabungan, direkomendasikan berdasarkan wilayah saja.
insert into public.whatsapp_groups (group_name, dealer_id, reporting_region, is_active)
select v.group_name, d.id, v.reporting_region, v.is_active
from (values
  -- JABODETABEK
  ('DDC PURI INDAH',                     'DIPO PURI INDAH',      'JABODETABEK',           true),
  ('DDC DIPO KELAPA GADING',             'DIPO KELAPA GADING',   'JABODETABEK',           true),
  ('DDC DIPO GOLF ISLAND NEW',           'DIPO GOLF ISLAND',     'JABODETABEK',           true),
  ('DDC DIPO PLUIT',                     'DIPO PLUIT',           'JABODETABEK',           true),
  ('DDC DIPO PONDOK INDAH',              'DIPO PONDOK INDAH',    'JABODETABEK',           true),

  -- JAWA BARAT
  ('DDC DIPO RANCAEKEK',                 'DIPO RANCAEKEK',       'JAWA BARAT',            true),
  ('DDC DIPO TASIKMALAYA',               'DIPO TASIKMALAYA',     'JAWA BARAT',            true),
  ('DDC DIPO GARUT',                     'DIPO GARUT',           'JAWA BARAT',            true),

  -- BANTEN
  ('DDC DIPO TANGERANG',                 'DIPO TANGERANG',       'BANTEN',                true),
  ('DDC DIPO CIPUTAT',                   'DIPO CIPUTAT',         'BANTEN',                true),
  ('DDC Dipo Balaraja',                  'DIPO BALARAJA',        'BANTEN',                true),
  ('DDC DIPO RANGKAS',                   'DIPO RANGKASBITUNG',   'BANTEN',                true),
  ('DDC DIPO LINGKAR SELATAN (CILEGON)', 'DIPO LINGKAR SELATAN', 'BANTEN',                true),
  ('DDC DIPO SERANG GROUP',              null,                   'BANTEN',                true),
  ('DDC BANTEN AREA',                    null,                   'BANTEN',                true),

  -- JAWA TIMUR
  ('DDC DIPO SIDOARJO',                  'DIPO SIDOARJO',        'JAWA TIMUR',            true),
  ('DDC DIPO JEMBER',                    'DIPO JEMBER',          'JAWA TIMUR',            true),
  ('DDC DIPO MADIUN',                    'DIPO MADIUN',          'JAWA TIMUR',            true),
  ('DDC DIPO BANYUWANGI',                'DIPO BANYUWANGI',      'JAWA TIMUR',            true),

  -- SUMATERA & KALIMANTAN
  ('DDC DIPO SM RAJA MEDAN',             'DIPO SM RAJA MEDAN',   'SUMATERA & KALIMANTAN', true),
  ('DDC MEDAN RINGROAD',                 'DIPO MEDAN RINGROAD',  'SUMATERA & KALIMANTAN', true),
  ('DDC DIPO BINJAI',                    'DIPO BINJAI',          'SUMATERA & KALIMANTAN', true),
  ('DDC PEMATANG SIANTAR (SUMUT)',       'DIPO PEMATANGSIANTAR', 'SUMATERA & KALIMANTAN', true),
  ('DDC PADANGSIDIMPUAN',                'DIPO PADANGSIDIMPUAN', 'SUMATERA & KALIMANTAN', true),
  ('DDC RANTAUPRAPAT LABUHANBATU',       'DIPO RANTAUPRAPAT',    'SUMATERA & KALIMANTAN', true),
  ('DDC PADANG BYPASS',                  'DIPO PADANG BYPASS',   'SUMATERA & KALIMANTAN', true),
  ('DDC PADANG BUKIT TINGGI',            'DIPO BUKITTINGGI',     'SUMATERA & KALIMANTAN', true),
  ('DDC PASAMAN (SUMBAR)',               'DIPO PASAMAN',         'SUMATERA & KALIMANTAN', true),
  ('DDC PEKANBARU',                      'DIPO PEKANBARU',       'SUMATERA & KALIMANTAN', true),
  ('DDC DIPO JAMBI',                     'DIPO JAMBI',           'SUMATERA & KALIMANTAN', true),
  ('DDC Dipo Bengkulu',                  'DIPO BENGKULU',        'SUMATERA & KALIMANTAN', true),
  ('DDC Lampung',                        'DIPO LAMPUNG',         'SUMATERA & KALIMANTAN', true),
  ('DDC BALIKPAPAN',                     'DIPO BALIKPAPAN',      'SUMATERA & KALIMANTAN', true),
  ('DDC BANDA ACEH & MEULABOH',          null,                   'SUMATERA & KALIMANTAN', true),

  -- C. PERLU DIPERIKSA — wilayah masih tebakan, karena itu dinonaktifkan.
  -- 'Seneja' dan 'Krakatau' ada di Cilegon (Banten), tetapi 'Krakatau' dan
  -- 'Gatot Subroto' juga nama jalan besar di Medan dan Jakarta.
  -- Buka Master Cabang: perbaiki wilayah + dealer, lalu Aktifkan.
  ('DDC DIPO SENEJA',                    null,                   'BANTEN',                false),
  ('DDC KRAKATAU',                       null,                   'BANTEN',                false),
  ('DDC DIPO GATOT SUBROTO',             null,                   'JABODETABEK',           false)
) as v(group_name, dealer_name, reporting_region, is_active)
left join public.dealers d on lower(d.dealer_name) = lower(v.dealer_name)
on conflict do nothing;
