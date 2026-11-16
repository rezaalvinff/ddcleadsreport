import type { ReportingRegion } from "../constants";

/**
 * Deterministic location dataset: every kota/kabupaten in Indonesia (514, per
 * the 38-province administrative division) grouped by province, plus common
 * aliases (regency capitals, well-known districts, abbreviations).
 *
 * Reporting-region rules (internal, not purely geographic):
 * - DKI Jakarta, Bogor, Depok, Bekasi           -> JABODETABEK
 * - rest of Jawa Barat                          -> JAWA BARAT
 * - Banten (incl. Tangerang & Tangerang Selatan) -> BANTEN
 * - Jawa Timur                                  -> JAWA TIMUR
 * - all Sumatra and Kalimantan provinces        -> SUMATERA & KALIMANTAN
 * - any other province                          -> outside the reporting regions (region null)
 *
 * Alias targets refer to a city in the same province, optionally prefixed with
 * "kota:" or "kab:" when the name exists as both a kota and a kabupaten.
 */
export interface ProvinceData {
  province: string;
  /** Default reporting region of the province, null when outside the five regions. */
  region: ReportingRegion | null;
  /** Cities whose region differs from the province default. */
  cityRegions?: Record<string, ReportingRegion>;
  /** True when the province alone does not determine a single region. */
  regionNeedsCity?: boolean;
  provinceAliases?: string[];
  kota: string[];
  kabupaten: string[];
  aliases?: Record<string, string>;
}

const SK: ReportingRegion = "SUMATERA & KALIMANTAN";

export const PROVINCES: ProvinceData[] = [
  // ----- Sumatra -----------------------------------------------------------
  {
    province: "Aceh",
    region: SK,
    provinceAliases: ["NAD", "Nanggroe Aceh Darussalam"],
    kota: ["Banda Aceh", "Sabang", "Langsa", "Lhokseumawe", "Subulussalam"],
    kabupaten: [
      "Aceh Barat", "Aceh Barat Daya", "Aceh Besar", "Aceh Jaya", "Aceh Selatan", "Aceh Singkil",
      "Aceh Tamiang", "Aceh Tengah", "Aceh Tenggara", "Aceh Timur", "Aceh Utara", "Bener Meriah",
      "Bireuen", "Gayo Lues", "Nagan Raya", "Pidie", "Pidie Jaya", "Simeulue",
    ],
    aliases: {
      Meulaboh: "Aceh Barat", Takengon: "Aceh Tengah", Kutacane: "Aceh Tenggara", Sigli: "Pidie",
      Calang: "Aceh Jaya", Tapaktuan: "Aceh Selatan", "Kuala Simpang": "Aceh Tamiang",
      Lhoksukon: "Aceh Utara", Jantho: "Aceh Besar", Blangpidie: "Aceh Barat Daya",
      "Suka Makmue": "Nagan Raya", Sinabang: "Simeulue", Blangkejeren: "Gayo Lues",
      Meureudu: "Pidie Jaya", Singkil: "Aceh Singkil", Redelong: "Bener Meriah",
    },
  },
  {
    province: "Sumatera Utara",
    region: SK,
    provinceAliases: ["Sumut", "Sumatra Utara"],
    kota: [
      "Medan", "Binjai", "Pematangsiantar", "Tebing Tinggi", "Tanjungbalai", "Sibolga",
      "Padangsidimpuan", "Gunungsitoli",
    ],
    kabupaten: [
      "Asahan", "Batu Bara", "Dairi", "Deli Serdang", "Humbang Hasundutan", "Karo", "Labuhanbatu",
      "Labuhanbatu Selatan", "Labuhanbatu Utara", "Langkat", "Mandailing Natal", "Nias", "Nias Barat",
      "Nias Selatan", "Nias Utara", "Padang Lawas", "Padang Lawas Utara", "Pakpak Bharat", "Samosir",
      "Serdang Bedagai", "Simalungun", "Tapanuli Selatan", "Tapanuli Tengah", "Tapanuli Utara", "Toba",
    ],
    aliases: {
      Siantar: "Pematangsiantar", "Padang Sidempuan": "Padangsidimpuan",
      Padangsidempuan: "Padangsidimpuan", Kisaran: "Asahan", "Rantau Prapat": "Labuhanbatu",
      Rantauprapat: "Labuhanbatu", Kabanjahe: "Karo", Berastagi: "Karo", Brastagi: "Karo",
      Stabat: "Langkat", "Lubuk Pakam": "Deli Serdang", "Sei Rampah": "Serdang Bedagai",
      Panyabungan: "Mandailing Natal", Sidikalang: "Dairi", Balige: "Toba", "Toba Samosir": "Toba",
      Tarutung: "Tapanuli Utara", "Dolok Sanggul": "Humbang Hasundutan", Doloksanggul: "Humbang Hasundutan",
      Pangururan: "Samosir", "Lima Puluh": "Batu Bara", Sipirok: "Tapanuli Selatan",
      "Kota Pinang": "Labuhanbatu Selatan", "Aek Kanopan": "Labuhanbatu Utara", Sibuhuan: "Padang Lawas",
      "Gunung Tua": "Padang Lawas Utara", "Pematang Raya": "Simalungun", "Teluk Dalam": "Nias Selatan",
      "Tanjung Morawa": "Deli Serdang", Percut: "Deli Serdang", Pancurbatu: "Deli Serdang",
      Belawan: "Medan", "Medan Johor": "Medan", "Labuhan Batu": "Labuhanbatu",
    },
  },
  {
    province: "Sumatera Barat",
    region: SK,
    provinceAliases: ["Sumbar", "Sumatra Barat"],
    kota: ["Padang", "Bukittinggi", "Padang Panjang", "Pariaman", "Payakumbuh", "Sawahlunto", "Solok"],
    kabupaten: [
      "Agam", "Dharmasraya", "Kepulauan Mentawai", "Lima Puluh Kota", "Padang Pariaman", "Pasaman",
      "Pasaman Barat", "Pesisir Selatan", "Sijunjung", "Solok", "Solok Selatan", "Tanah Datar",
    ],
    aliases: {
      "Lubuk Basung": "Agam", "Pulau Punjung": "Dharmasraya", Mentawai: "Kepulauan Mentawai",
      Tuapejat: "Kepulauan Mentawai", Sarilamak: "Lima Puluh Kota", "Limapuluh Kota": "Lima Puluh Kota",
      "50 Kota": "Lima Puluh Kota", Painan: "Pesisir Selatan", "Muaro Sijunjung": "Sijunjung",
      Batusangkar: "Tanah Datar", "Lubuk Sikaping": "Pasaman", Arosuka: "kab:Solok",
      "Padang Aro": "Solok Selatan", "Parit Malintang": "Padang Pariaman",
    },
  },
  {
    province: "Riau",
    region: SK,
    kota: ["Pekanbaru", "Dumai"],
    kabupaten: [
      "Bengkalis", "Indragiri Hilir", "Indragiri Hulu", "Kampar", "Kepulauan Meranti", "Kuantan Singingi",
      "Pelalawan", "Rokan Hilir", "Rokan Hulu", "Siak",
    ],
    aliases: {
      Tembilahan: "Indragiri Hilir", Inhil: "Indragiri Hilir", Rengat: "Indragiri Hulu", Inhu: "Indragiri Hulu",
      Bangkinang: "Kampar", Selatpanjang: "Kepulauan Meranti", "Selat Panjang": "Kepulauan Meranti",
      Meranti: "Kepulauan Meranti", "Teluk Kuantan": "Kuantan Singingi", Kuansing: "Kuantan Singingi",
      "Pangkalan Kerinci": "Pelalawan", Bagansiapiapi: "Rokan Hilir", "Bagan Siapiapi": "Rokan Hilir",
      Rohil: "Rokan Hilir", "Pasir Pengaraian": "Rokan Hulu", Rohul: "Rokan Hulu",
      "Siak Sri Indrapura": "Siak", Duri: "Bengkalis",
    },
  },
  {
    province: "Kepulauan Riau",
    region: SK,
    provinceAliases: ["Kepri"],
    kota: ["Batam", "Tanjungpinang"],
    kabupaten: ["Bintan", "Karimun", "Kepulauan Anambas", "Lingga", "Natuna"],
    aliases: {
      "Tanjung Balai Karimun": "Karimun", "Tanjungbalai Karimun": "Karimun", Ranai: "Natuna",
      Anambas: "Kepulauan Anambas", Tarempa: "Kepulauan Anambas", "Batu Aji": "Batam",
      Batuaji: "Batam", Sekupang: "Batam", Nongsa: "Batam", "Batam Center": "Batam",
    },
  },
  {
    province: "Jambi",
    region: SK,
    kota: ["Jambi", "Sungai Penuh"],
    kabupaten: [
      "Batanghari", "Bungo", "Kerinci", "Merangin", "Muaro Jambi", "Sarolangun", "Tanjung Jabung Barat",
      "Tanjung Jabung Timur", "Tebo",
    ],
    aliases: {
      "Muara Bungo": "Bungo", "Muarabungo": "Bungo", "Muara Bulian": "Batanghari", Bangko: "Merangin",
      "Muara Tebo": "Tebo", "Muara Sabak": "Tanjung Jabung Timur", "Kuala Tungkal": "Tanjung Jabung Barat",
      Sengeti: "Muaro Jambi", "Muara Jambi": "Muaro Jambi", Tanjabbar: "Tanjung Jabung Barat",
      Tanjabtim: "Tanjung Jabung Timur", "Siulak": "Kerinci",
    },
  },
  {
    province: "Sumatera Selatan",
    region: SK,
    provinceAliases: ["Sumsel", "Sumatra Selatan"],
    kota: ["Palembang", "Lubuklinggau", "Pagar Alam", "Prabumulih"],
    kabupaten: [
      "Banyuasin", "Empat Lawang", "Lahat", "Muara Enim", "Musi Banyuasin", "Musi Rawas", "Musi Rawas Utara",
      "Ogan Ilir", "Ogan Komering Ilir", "Ogan Komering Ulu", "Ogan Komering Ulu Selatan",
      "Ogan Komering Ulu Timur", "Penukal Abab Lematang Ilir",
    ],
    aliases: {
      "Lubuk Linggau": "Lubuklinggau", Muaraenim: "Muara Enim", Kayuagung: "Ogan Komering Ilir",
      "Kayu Agung": "Ogan Komering Ilir", OKI: "Ogan Komering Ilir", OKU: "Ogan Komering Ulu",
      "OKU Selatan": "Ogan Komering Ulu Selatan", "OKU Timur": "Ogan Komering Ulu Timur",
      Baturaja: "Ogan Komering Ulu", Martapura: "Ogan Komering Ulu Timur", Muaradua: "Ogan Komering Ulu Selatan",
      Sekayu: "Musi Banyuasin", Muba: "Musi Banyuasin", "Pangkalan Balai": "Banyuasin",
      Indralaya: "Ogan Ilir", Inderalaya: "Ogan Ilir", PALI: "Penukal Abab Lematang Ilir",
      "Talang Ubi": "Penukal Abab Lematang Ilir", Muratara: "Musi Rawas Utara", "Muara Rupit": "Musi Rawas Utara",
      "Muara Beliti": "Musi Rawas", Mura: "Musi Rawas",
    },
  },
  {
    province: "Kepulauan Bangka Belitung",
    region: SK,
    provinceAliases: ["Bangka Belitung", "Babel"],
    kota: ["Pangkalpinang"],
    kabupaten: ["Bangka", "Bangka Barat", "Bangka Selatan", "Bangka Tengah", "Belitung", "Belitung Timur"],
    aliases: {
      Sungailiat: "Bangka", "Sungai Liat": "Bangka", Muntok: "Bangka Barat", Mentok: "Bangka Barat",
      Toboali: "Bangka Selatan", Koba: "Bangka Tengah", "Tanjung Pandan": "Belitung", Tanjungpandan: "Belitung",
      Manggar: "Belitung Timur",
    },
  },
  {
    province: "Bengkulu",
    region: SK,
    kota: ["Bengkulu"],
    kabupaten: [
      "Bengkulu Selatan", "Bengkulu Tengah", "Bengkulu Utara", "Kaur", "Kepahiang", "Lebong", "Mukomuko",
      "Rejang Lebong", "Seluma",
    ],
    aliases: {
      Manna: "Bengkulu Selatan", "Arga Makmur": "Bengkulu Utara", Argamakmur: "Bengkulu Utara",
      Curup: "Rejang Lebong", Bintuhan: "Kaur", Tais: "Seluma", Tubei: "Lebong",
      "Karang Tinggi": "Bengkulu Tengah", "Muko Muko": "Mukomuko",
    },
  },
  {
    province: "Lampung",
    region: SK,
    kota: ["Bandar Lampung", "Metro"],
    kabupaten: [
      "Lampung Barat", "Lampung Selatan", "Lampung Tengah", "Lampung Timur", "Lampung Utara", "Mesuji",
      "Pesawaran", "Pesisir Barat", "Pringsewu", "Tanggamus", "Tulang Bawang", "Tulang Bawang Barat",
      "Way Kanan",
    ],
    aliases: {
      Kalianda: "Lampung Selatan", "Gunung Sugih": "Lampung Tengah", "Bandar Jaya": "Lampung Tengah",
      Sukadana: "Lampung Timur", Kotabumi: "Lampung Utara", Liwa: "Lampung Barat", Krui: "Pesisir Barat",
      "Kota Agung": "Tanggamus", Menggala: "Tulang Bawang", Panaragan: "Tulang Bawang Barat",
      "Blambangan Umpu": "Way Kanan", "Gedong Tataan": "Pesawaran", Natar: "Lampung Selatan",
    },
  },
  // ----- Kalimantan --------------------------------------------------------
  {
    province: "Kalimantan Barat",
    region: SK,
    provinceAliases: ["Kalbar"],
    kota: ["Pontianak", "Singkawang"],
    kabupaten: [
      "Bengkayang", "Kapuas Hulu", "Kayong Utara", "Ketapang", "Kubu Raya", "Landak", "Melawi", "Mempawah",
      "Sambas", "Sanggau", "Sekadau", "Sintang",
    ],
    aliases: {
      Putussibau: "Kapuas Hulu", "Sungai Raya": "Kubu Raya", Ngabang: "Landak", "Nanga Pinoh": "Melawi",
      Sukadana: "Kayong Utara",
    },
  },
  {
    province: "Kalimantan Tengah",
    region: SK,
    provinceAliases: ["Kalteng"],
    kota: ["Palangka Raya"],
    kabupaten: [
      "Barito Selatan", "Barito Timur", "Barito Utara", "Gunung Mas", "Kapuas", "Katingan",
      "Kotawaringin Barat", "Kotawaringin Timur", "Lamandau", "Murung Raya", "Pulang Pisau", "Seruyan",
      "Sukamara",
    ],
    aliases: {
      Buntok: "Barito Selatan", "Tamiang Layang": "Barito Timur", "Muara Teweh": "Barito Utara",
      "Kuala Kurun": "Gunung Mas", "Kuala Kapuas": "Kapuas", Kasongan: "Katingan",
      "Pangkalan Bun": "Kotawaringin Barat", Kobar: "Kotawaringin Barat", Sampit: "Kotawaringin Timur",
      Kotim: "Kotawaringin Timur", "Nanga Bulik": "Lamandau", "Puruk Cahu": "Murung Raya",
      "Kuala Pembuang": "Seruyan",
    },
  },
  {
    province: "Kalimantan Selatan",
    region: SK,
    provinceAliases: ["Kalsel"],
    kota: ["Banjarmasin", "Banjarbaru"],
    kabupaten: [
      "Balangan", "Banjar", "Barito Kuala", "Hulu Sungai Selatan", "Hulu Sungai Tengah", "Hulu Sungai Utara",
      "Kotabaru", "Tabalong", "Tanah Bumbu", "Tanah Laut", "Tapin",
    ],
    aliases: {
      Martapura: "Banjar", Paringin: "Balangan", Marabahan: "Barito Kuala", Batola: "Barito Kuala",
      Kandangan: "Hulu Sungai Selatan", Barabai: "Hulu Sungai Tengah", Amuntai: "Hulu Sungai Utara",
      "Kota Baru": "Kotabaru", Batulicin: "Tanah Bumbu", Pelaihari: "Tanah Laut", Pleihari: "Tanah Laut",
    },
  },
  {
    province: "Kalimantan Timur",
    region: SK,
    provinceAliases: ["Kaltim"],
    kota: ["Balikpapan", "Bontang", "Samarinda"],
    kabupaten: [
      "Berau", "Kutai Barat", "Kutai Kartanegara", "Kutai Timur", "Mahakam Ulu", "Paser", "Penajam Paser Utara",
    ],
    aliases: {
      "Tanjung Redeb": "Berau", Sendawar: "Kutai Barat", Kubar: "Kutai Barat", Tenggarong: "Kutai Kartanegara",
      Kukar: "Kutai Kartanegara", Sangatta: "Kutai Timur", Sangata: "Kutai Timur", Kutim: "Kutai Timur",
      "Long Bagun": "Mahakam Ulu", "Tanah Grogot": "Paser", Penajam: "Penajam Paser Utara", PPU: "Penajam Paser Utara",
    },
  },
  {
    province: "Kalimantan Utara",
    region: SK,
    provinceAliases: ["Kaltara"],
    kota: ["Tarakan"],
    kabupaten: ["Bulungan", "Malinau", "Nunukan", "Tana Tidung"],
    aliases: { "Tanjung Selor": "Bulungan", "Tideng Pale": "Tana Tidung" },
  },
  // ----- Java ---------------------------------------------------------------
  {
    province: "DKI Jakarta",
    region: "JABODETABEK",
    provinceAliases: ["DKI", "Jakarta Raya"],
    kota: ["Jakarta Barat", "Jakarta Pusat", "Jakarta Selatan", "Jakarta Timur", "Jakarta Utara"],
    kabupaten: ["Kepulauan Seribu"],
    aliases: {
      Jakarta: "Jakarta", Jakbar: "Jakarta Barat", Jakpus: "Jakarta Pusat", Jaksel: "Jakarta Selatan",
      Jaktim: "Jakarta Timur", Jakut: "Jakarta Utara",
      Cengkareng: "Jakarta Barat", "Kebon Jeruk": "Jakarta Barat", Kalideres: "Jakarta Barat",
      Grogol: "Jakarta Barat", Tambora: "Jakarta Barat", Palmerah: "Jakarta Barat", Kembangan: "Jakarta Barat",
      Menteng: "Jakarta Pusat", "Tanah Abang": "Jakarta Pusat", Gambir: "Jakarta Pusat", Senen: "Jakarta Pusat",
      "Cempaka Putih": "Jakarta Pusat", Kemayoran: "Jakarta Pusat", "Sawah Besar": "Jakarta Pusat",
      "Johar Baru": "Jakarta Pusat",
      "Kebayoran Baru": "Jakarta Selatan", "Kebayoran Lama": "Jakarta Selatan", Cilandak: "Jakarta Selatan",
      "Pasar Minggu": "Jakarta Selatan", Jagakarsa: "Jakarta Selatan", Pesanggrahan: "Jakarta Selatan",
      "Mampang Prapatan": "Jakarta Selatan", Pancoran: "Jakarta Selatan", Tebet: "Jakarta Selatan",
      Setiabudi: "Jakarta Selatan",
      Cakung: "Jakarta Timur", "Duren Sawit": "Jakarta Timur", Jatinegara: "Jakarta Timur",
      "Kramat Jati": "Jakarta Timur", "Pasar Rebo": "Jakarta Timur", Ciracas: "Jakarta Timur",
      Matraman: "Jakarta Timur", "Pulo Gadung": "Jakarta Timur", Pulogadung: "Jakarta Timur",
      Cibubur: "Jakarta Timur", Rawamangun: "Jakarta Timur",
      Penjaringan: "Jakarta Utara", Pademangan: "Jakarta Utara", "Tanjung Priok": "Jakarta Utara",
      Koja: "Jakarta Utara", Cilincing: "Jakarta Utara", "Kelapa Gading": "Jakarta Utara", Pluit: "Jakarta Utara",
      Sunter: "Jakarta Utara",
    },
  },
  {
    province: "Jawa Barat",
    region: "JAWA BARAT",
    regionNeedsCity: true,
    cityRegions: { Bogor: "JABODETABEK", Depok: "JABODETABEK", Bekasi: "JABODETABEK" },
    provinceAliases: ["Jabar"],
    kota: ["Bandung", "Banjar", "Bekasi", "Bogor", "Cimahi", "Cirebon", "Depok", "Sukabumi", "Tasikmalaya"],
    kabupaten: [
      "Bandung", "Bandung Barat", "Bekasi", "Bogor", "Ciamis", "Cianjur", "Cirebon", "Garut", "Indramayu",
      "Karawang", "Kuningan", "Majalengka", "Pangandaran", "Purwakarta", "Subang", "Sukabumi", "Sumedang",
      "Tasikmalaya",
    ],
    aliases: {
      // Bekasi / Bogor / Depok (JABODETABEK)
      Cikarang: "kab:Bekasi", Tambun: "kab:Bekasi", Cibitung: "kab:Bekasi", Babelan: "kab:Bekasi",
      "Lippo Cikarang": "kab:Bekasi", "Pondok Gede": "kota:Bekasi", Jatiasih: "kota:Bekasi",
      "Bantar Gebang": "kota:Bekasi", Rawalumbu: "kota:Bekasi", "Medan Satria": "kota:Bekasi",
      "Harapan Indah": "kota:Bekasi", "Jati Asih": "kota:Bekasi",
      Cibinong: "kab:Bogor", Citeureup: "kab:Bogor", Cileungsi: "kab:Bogor", "Gunung Putri": "kab:Bogor",
      Sentul: "kab:Bogor", Ciawi: "kab:Bogor", Parung: "kab:Bogor", Leuwiliang: "kab:Bogor",
      Jonggol: "kab:Bogor", Dramaga: "kab:Bogor", Darmaga: "kab:Bogor", "Bojong Gede": "kab:Bogor",
      Bojonggede: "kab:Bogor", "Puncak Bogor": "kab:Bogor",
      Cimanggis: "Depok", Sawangan: "Depok", Cinere: "Depok", Margonda: "Depok",
      // Rest of Jawa Barat
      Soreang: "kab:Bandung", Baleendah: "kab:Bandung", Majalaya: "kab:Bandung", Dayeuhkolot: "kab:Bandung",
      Cileunyi: "kab:Bandung", Rancaekek: "kab:Bandung", Banjaran: "kab:Bandung",
      Lembang: "Bandung Barat", Padalarang: "Bandung Barat", Ngamprah: "Bandung Barat", KBB: "Bandung Barat",
      "Kota Baru Parahyangan": "Bandung Barat", Jatinangor: "Sumedang",
      "Pelabuhan Ratu": "kab:Sukabumi", Palabuhanratu: "kab:Sukabumi", Cikampek: "Karawang",
      Singaparna: "kab:Tasikmalaya", Jatiwangi: "Majalengka", Tasik: "Tasikmalaya",
    },
  },
  {
    province: "Banten",
    region: "BANTEN",
    kota: ["Cilegon", "Serang", "Tangerang", "Tangerang Selatan"],
    kabupaten: ["Lebak", "Pandeglang", "Serang", "Tangerang"],
    aliases: {
      Tangsel: "Tangerang Selatan", BSD: "Tangerang Selatan", Serpong: "Tangerang Selatan",
      Pamulang: "Tangerang Selatan", Ciputat: "Tangerang Selatan", "Pondok Aren": "Tangerang Selatan",
      "Alam Sutera": "Tangerang Selatan",
      Karawaci: "kota:Tangerang", Ciledug: "kota:Tangerang", Cipondoh: "kota:Tangerang", Cikokol: "kota:Tangerang",
      Cikupa: "kab:Tangerang", Balaraja: "kab:Tangerang", Tigaraksa: "kab:Tangerang", "Pasar Kemis": "kab:Tangerang",
      Teluknaga: "kab:Tangerang", "Gading Serpong": "kab:Tangerang", "Citra Raya": "kab:Tangerang",
      Rangkasbitung: "Lebak", Anyer: "kab:Serang",
    },
  },
  {
    province: "Jawa Timur",
    region: "JAWA TIMUR",
    provinceAliases: ["Jatim"],
    kota: ["Batu", "Blitar", "Kediri", "Madiun", "Malang", "Mojokerto", "Pasuruan", "Probolinggo", "Surabaya"],
    kabupaten: [
      "Bangkalan", "Banyuwangi", "Blitar", "Bojonegoro", "Bondowoso", "Gresik", "Jember", "Jombang", "Kediri",
      "Lamongan", "Lumajang", "Madiun", "Magetan", "Malang", "Mojokerto", "Nganjuk", "Ngawi", "Pacitan",
      "Pamekasan", "Pasuruan", "Ponorogo", "Probolinggo", "Sampang", "Sidoarjo", "Situbondo", "Sumenep",
      "Trenggalek", "Tuban", "Tulungagung",
    ],
    aliases: {
      Kepanjen: "kab:Malang", Bangil: "kab:Pasuruan", Kraksaan: "kab:Probolinggo", Caruban: "kab:Madiun",
      Madura: "Madura", Suroboyo: "Surabaya",
    },
  },
  {
    province: "Jawa Tengah",
    region: null,
    provinceAliases: ["Jateng"],
    kota: ["Magelang", "Pekalongan", "Salatiga", "Semarang", "Surakarta", "Tegal"],
    kabupaten: [
      "Banjarnegara", "Banyumas", "Batang", "Blora", "Boyolali", "Brebes", "Cilacap", "Demak", "Grobogan",
      "Jepara", "Karanganyar", "Kebumen", "Kendal", "Klaten", "Kudus", "Magelang", "Pati", "Pekalongan",
      "Pemalang", "Purbalingga", "Purworejo", "Rembang", "Semarang", "Sragen", "Sukoharjo", "Tegal",
      "Temanggung", "Wonogiri", "Wonosobo",
    ],
    aliases: { Solo: "Surakarta", Purwokerto: "Banyumas", Ungaran: "kab:Semarang" },
  },
  {
    province: "DI Yogyakarta",
    region: null,
    provinceAliases: ["DIY", "Daerah Istimewa Yogyakarta"],
    kota: ["Yogyakarta"],
    kabupaten: ["Bantul", "Gunungkidul", "Kulon Progo", "Sleman"],
    aliases: {
      Jogja: "Yogyakarta", Yogya: "Yogyakarta", Jogjakarta: "Yogyakarta", Jogya: "Yogyakarta",
      "Gunung Kidul": "Gunungkidul", Wonosari: "Gunungkidul", Wates: "Kulon Progo",
    },
  },
  // ----- Outside the reporting regions -------------------------------------
  {
    province: "Bali",
    region: null,
    kota: ["Denpasar"],
    kabupaten: ["Badung", "Bangli", "Buleleng", "Gianyar", "Jembrana", "Karangasem", "Klungkung", "Tabanan"],
    aliases: { Singaraja: "Buleleng" },
  },
  {
    province: "Nusa Tenggara Barat",
    region: null,
    provinceAliases: ["NTB"],
    kota: ["Bima", "Mataram"],
    kabupaten: [
      "Bima", "Dompu", "Lombok Barat", "Lombok Tengah", "Lombok Timur", "Lombok Utara", "Sumbawa", "Sumbawa Barat",
    ],
    aliases: { Lombok: "Lombok", Praya: "Lombok Tengah", Selong: "Lombok Timur" },
  },
  {
    province: "Nusa Tenggara Timur",
    region: null,
    provinceAliases: ["NTT"],
    kota: ["Kupang"],
    kabupaten: [
      "Alor", "Belu", "Ende", "Flores Timur", "Kupang", "Lembata", "Malaka", "Manggarai", "Manggarai Barat",
      "Manggarai Timur", "Nagekeo", "Ngada", "Rote Ndao", "Sabu Raijua", "Sikka", "Sumba Barat",
      "Sumba Barat Daya", "Sumba Tengah", "Sumba Timur", "Timor Tengah Selatan", "Timor Tengah Utara",
    ],
    aliases: { "Labuan Bajo": "Manggarai Barat", Maumere: "Sikka", Atambua: "Belu", Waingapu: "Sumba Timur" },
  },
  {
    province: "Sulawesi Utara",
    region: null,
    provinceAliases: ["Sulut"],
    kota: ["Bitung", "Kotamobagu", "Manado", "Tomohon"],
    kabupaten: [
      "Bolaang Mongondow", "Bolaang Mongondow Selatan", "Bolaang Mongondow Timur", "Bolaang Mongondow Utara",
      "Kepulauan Sangihe", "Kepulauan Siau Tagulandang Biaro", "Kepulauan Talaud", "Minahasa",
      "Minahasa Selatan", "Minahasa Tenggara", "Minahasa Utara",
    ],
  },
  {
    province: "Gorontalo",
    region: null,
    kota: ["Gorontalo"],
    kabupaten: ["Boalemo", "Bone Bolango", "Gorontalo", "Gorontalo Utara", "Pohuwato"],
  },
  {
    province: "Sulawesi Tengah",
    region: null,
    provinceAliases: ["Sulteng"],
    kota: ["Palu"],
    kabupaten: [
      "Banggai", "Banggai Kepulauan", "Banggai Laut", "Buol", "Donggala", "Morowali", "Morowali Utara",
      "Parigi Moutong", "Poso", "Sigi", "Tojo Una-Una", "Tolitoli",
    ],
    aliases: { Luwuk: "Banggai" },
  },
  {
    province: "Sulawesi Barat",
    region: null,
    provinceAliases: ["Sulbar"],
    kota: [],
    kabupaten: ["Majene", "Mamasa", "Mamuju", "Mamuju Tengah", "Pasangkayu", "Polewali Mandar"],
  },
  {
    province: "Sulawesi Selatan",
    region: null,
    provinceAliases: ["Sulsel"],
    kota: ["Makassar", "Palopo", "Parepare"],
    kabupaten: [
      "Bantaeng", "Barru", "Bone", "Bulukumba", "Enrekang", "Gowa", "Jeneponto", "Kepulauan Selayar", "Luwu",
      "Luwu Timur", "Luwu Utara", "Maros", "Pangkajene dan Kepulauan", "Pinrang", "Sidenreng Rappang", "Sinjai",
      "Soppeng", "Takalar", "Tana Toraja", "Toraja Utara", "Wajo",
    ],
    aliases: { Sungguminasa: "Gowa", Watampone: "Bone", Pangkep: "Pangkajene dan Kepulauan", Sidrap: "Sidenreng Rappang" },
  },
  {
    province: "Sulawesi Tenggara",
    region: null,
    provinceAliases: ["Sultra"],
    kota: ["Baubau", "Kendari"],
    kabupaten: [
      "Bombana", "Buton", "Buton Selatan", "Buton Tengah", "Buton Utara", "Kolaka", "Kolaka Timur",
      "Kolaka Utara", "Konawe", "Konawe Kepulauan", "Konawe Selatan", "Konawe Utara", "Muna", "Muna Barat",
      "Wakatobi",
    ],
    aliases: { "Bau Bau": "Baubau" },
  },
  {
    province: "Maluku",
    region: null,
    kota: ["Ambon", "Tual"],
    kabupaten: [
      "Buru", "Buru Selatan", "Kepulauan Aru", "Kepulauan Tanimbar", "Maluku Barat Daya", "Maluku Tengah",
      "Maluku Tenggara", "Seram Bagian Barat", "Seram Bagian Timur",
    ],
  },
  {
    province: "Maluku Utara",
    region: null,
    provinceAliases: ["Malut"],
    kota: ["Ternate", "Tidore Kepulauan"],
    kabupaten: [
      "Halmahera Barat", "Halmahera Tengah", "Halmahera Timur", "Halmahera Selatan", "Halmahera Utara",
      "Kepulauan Sula", "Pulau Morotai", "Pulau Taliabu",
    ],
    aliases: { Tidore: "Tidore Kepulauan", Sofifi: "Tidore Kepulauan" },
  },
  {
    province: "Papua",
    region: null,
    kota: ["Jayapura"],
    kabupaten: ["Biak Numfor", "Jayapura", "Keerom", "Kepulauan Yapen", "Mamberamo Raya", "Sarmi", "Supiori", "Waropen"],
    aliases: { Biak: "Biak Numfor", Sentani: "kab:Jayapura" },
  },
  {
    province: "Papua Barat",
    region: null,
    kota: [],
    kabupaten: [
      "Fakfak", "Kaimana", "Manokwari", "Manokwari Selatan", "Pegunungan Arfak", "Teluk Bintuni", "Teluk Wondama",
    ],
  },
  {
    province: "Papua Barat Daya",
    region: null,
    kota: ["Sorong"],
    kabupaten: ["Maybrat", "Raja Ampat", "Sorong", "Sorong Selatan", "Tambrauw"],
  },
  {
    province: "Papua Tengah",
    region: null,
    kota: [],
    kabupaten: ["Deiyai", "Dogiyai", "Intan Jaya", "Mimika", "Nabire", "Paniai", "Puncak", "Puncak Jaya"],
    aliases: { Timika: "Mimika" },
  },
  {
    province: "Papua Pegunungan",
    region: null,
    kota: [],
    kabupaten: [
      "Jayawijaya", "Lanny Jaya", "Mamberamo Tengah", "Nduga", "Pegunungan Bintang", "Tolikara", "Yahukimo", "Yalimo",
    ],
    aliases: { Wamena: "Jayawijaya" },
  },
  {
    province: "Papua Selatan",
    region: null,
    kota: [],
    kabupaten: ["Asmat", "Boven Digoel", "Mappi", "Merauke"],
  },
];
