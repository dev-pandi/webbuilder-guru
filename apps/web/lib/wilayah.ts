// Data wilayah Indonesia — provinsi + kabupaten/kota.
// Sumber: BPS + Kemendagri 2024 (38 provinsi setelah pemekaran Papua).
//
// Format: nama ASCII murni (tanpa em-dash / aksen) supaya cocok langsung
// dengan EPP contact PostalInfo type="int" (RFC 5733 §2.6).
//
// Scope: semua kota (98) + mayoritas kabupaten (ibukota kabupaten + yang
// umum dipakai). Kalau user daftar dari kabupaten yang tidak ter-list,
// mereka bisa pilih ibukota provinsi sebagai fallback atau request admin
// untuk tambah di sini.

export const WILAYAH_INDONESIA: Record<string, readonly string[]> = {
  "Aceh": [
    "Banda Aceh", "Langsa", "Lhokseumawe", "Sabang", "Subulussalam",
    "Aceh Barat", "Aceh Barat Daya", "Aceh Besar", "Aceh Jaya", "Aceh Selatan",
    "Aceh Singkil", "Aceh Tamiang", "Aceh Tengah", "Aceh Tenggara", "Aceh Timur",
    "Aceh Utara", "Bener Meriah", "Bireuen", "Gayo Lues", "Nagan Raya",
    "Pidie", "Pidie Jaya", "Simeulue",
  ],
  "Sumatera Utara": [
    "Medan", "Binjai", "Pematang Siantar", "Tanjung Balai", "Tebing Tinggi",
    "Sibolga", "Padang Sidempuan", "Gunung Sitoli",
    "Asahan", "Batu Bara", "Dairi", "Deli Serdang", "Humbang Hasundutan",
    "Karo", "Labuhanbatu", "Labuhanbatu Selatan", "Labuhanbatu Utara",
    "Langkat", "Mandailing Natal", "Nias", "Nias Barat", "Nias Selatan",
    "Nias Utara", "Padang Lawas", "Padang Lawas Utara", "Pakpak Bharat",
    "Samosir", "Serdang Bedagai", "Simalungun", "Tapanuli Selatan",
    "Tapanuli Tengah", "Tapanuli Utara", "Toba",
  ],
  "Sumatera Barat": [
    "Padang", "Bukittinggi", "Padang Panjang", "Pariaman", "Payakumbuh",
    "Sawahlunto", "Solok",
    "Agam", "Dharmasraya", "Kepulauan Mentawai", "Lima Puluh Kota",
    "Padang Pariaman", "Pasaman", "Pasaman Barat", "Pesisir Selatan",
    "Sijunjung", "Solok Selatan", "Tanah Datar",
  ],
  "Riau": [
    "Pekanbaru", "Dumai",
    "Bengkalis", "Indragiri Hilir", "Indragiri Hulu", "Kampar",
    "Kepulauan Meranti", "Kuantan Singingi", "Pelalawan", "Rokan Hilir",
    "Rokan Hulu", "Siak",
  ],
  "Kepulauan Riau": [
    "Batam", "Tanjungpinang",
    "Bintan", "Karimun", "Kepulauan Anambas", "Lingga", "Natuna",
  ],
  "Jambi": [
    "Jambi", "Sungai Penuh",
    "Batanghari", "Bungo", "Kerinci", "Merangin", "Muaro Jambi",
    "Sarolangun", "Tanjung Jabung Barat", "Tanjung Jabung Timur", "Tebo",
  ],
  "Bengkulu": [
    "Bengkulu",
    "Bengkulu Selatan", "Bengkulu Tengah", "Bengkulu Utara", "Kaur",
    "Kepahiang", "Lebong", "Mukomuko", "Rejang Lebong", "Seluma",
  ],
  "Sumatera Selatan": [
    "Palembang", "Lubuklinggau", "Pagar Alam", "Prabumulih",
    "Banyuasin", "Empat Lawang", "Lahat", "Muara Enim", "Musi Banyuasin",
    "Musi Rawas", "Musi Rawas Utara", "Ogan Ilir", "Ogan Komering Ilir",
    "Ogan Komering Ulu", "Ogan Komering Ulu Selatan", "Ogan Komering Ulu Timur",
    "Penukal Abab Lematang Ilir",
  ],
  "Bangka Belitung": [
    "Pangkal Pinang",
    "Bangka", "Bangka Barat", "Bangka Selatan", "Bangka Tengah",
    "Belitung", "Belitung Timur",
  ],
  "Lampung": [
    "Bandar Lampung", "Metro",
    "Lampung Barat", "Lampung Selatan", "Lampung Tengah", "Lampung Timur",
    "Lampung Utara", "Mesuji", "Pesawaran", "Pesisir Barat", "Pringsewu",
    "Tanggamus", "Tulang Bawang", "Tulang Bawang Barat", "Way Kanan",
  ],
  "DKI Jakarta": [
    "Jakarta Barat", "Jakarta Pusat", "Jakarta Selatan", "Jakarta Timur",
    "Jakarta Utara", "Kepulauan Seribu",
  ],
  "Banten": [
    "Cilegon", "Serang", "Tangerang", "Tangerang Selatan",
    "Lebak", "Pandeglang",
  ],
  "Jawa Barat": [
    "Bandung", "Bekasi", "Bogor", "Cimahi", "Cirebon", "Depok", "Sukabumi",
    "Tasikmalaya", "Banjar",
    "Bandung Barat", "Ciamis", "Garut", "Indramayu", "Karawang", "Kuningan",
    "Majalengka", "Pangandaran", "Purwakarta", "Subang", "Sumedang",
  ],
  "Jawa Tengah": [
    "Semarang", "Magelang", "Pekalongan", "Salatiga", "Surakarta", "Tegal",
    "Banjarnegara", "Banyumas", "Batang", "Blora", "Boyolali", "Brebes",
    "Cilacap", "Demak", "Grobogan", "Jepara", "Karanganyar", "Kebumen",
    "Kendal", "Klaten", "Kudus", "Pati", "Pemalang", "Purbalingga",
    "Purworejo", "Rembang", "Sragen", "Sukoharjo", "Temanggung", "Wonogiri",
    "Wonosobo",
  ],
  "DI Yogyakarta": [
    "Yogyakarta",
    "Bantul", "Gunungkidul", "Kulon Progo", "Sleman",
  ],
  "Jawa Timur": [
    "Surabaya", "Batu", "Blitar", "Kediri", "Madiun", "Malang", "Mojokerto",
    "Pasuruan", "Probolinggo",
    "Bangkalan", "Banyuwangi", "Bojonegoro", "Bondowoso", "Gresik", "Jember",
    "Jombang", "Lamongan", "Lumajang", "Magetan", "Nganjuk", "Ngawi",
    "Pacitan", "Pamekasan", "Ponorogo", "Sampang", "Sidoarjo", "Situbondo",
    "Sumenep", "Trenggalek", "Tuban", "Tulungagung",
  ],
  "Bali": [
    "Denpasar",
    "Badung", "Bangli", "Buleleng", "Gianyar", "Jembrana", "Karangasem",
    "Klungkung", "Tabanan",
  ],
  "Nusa Tenggara Barat": [
    "Mataram", "Bima",
    "Dompu", "Lombok Barat", "Lombok Tengah", "Lombok Timur", "Lombok Utara",
    "Sumbawa", "Sumbawa Barat",
  ],
  "Nusa Tenggara Timur": [
    "Kupang",
    "Alor", "Belu", "Ende", "Flores Timur", "Lembata", "Malaka", "Manggarai",
    "Manggarai Barat", "Manggarai Timur", "Nagekeo", "Ngada", "Rote Ndao",
    "Sabu Raijua", "Sikka", "Sumba Barat", "Sumba Barat Daya", "Sumba Tengah",
    "Sumba Timur", "Timor Tengah Selatan", "Timor Tengah Utara",
  ],
  "Kalimantan Barat": [
    "Pontianak", "Singkawang",
    "Bengkayang", "Kapuas Hulu", "Kayong Utara", "Ketapang", "Kubu Raya",
    "Landak", "Melawi", "Mempawah", "Sambas", "Sanggau", "Sekadau", "Sintang",
  ],
  "Kalimantan Tengah": [
    "Palangka Raya",
    "Barito Selatan", "Barito Timur", "Barito Utara", "Gunung Mas", "Kapuas",
    "Katingan", "Kotawaringin Barat", "Kotawaringin Timur", "Lamandau",
    "Murung Raya", "Pulang Pisau", "Sukamara", "Seruyan",
  ],
  "Kalimantan Selatan": [
    "Banjarbaru", "Banjarmasin",
    "Balangan", "Banjar", "Barito Kuala", "Hulu Sungai Selatan",
    "Hulu Sungai Tengah", "Hulu Sungai Utara", "Kotabaru", "Tabalong",
    "Tanah Bumbu", "Tanah Laut", "Tapin",
  ],
  "Kalimantan Timur": [
    "Balikpapan", "Bontang", "Samarinda",
    "Berau", "Kutai Barat", "Kutai Kartanegara", "Kutai Timur", "Mahakam Ulu",
    "Paser", "Penajam Paser Utara",
  ],
  "Kalimantan Utara": [
    "Tarakan",
    "Bulungan", "Malinau", "Nunukan", "Tana Tidung",
  ],
  "Sulawesi Utara": [
    "Bitung", "Kotamobagu", "Manado", "Tomohon",
    "Bolaang Mongondow", "Bolaang Mongondow Selatan", "Bolaang Mongondow Timur",
    "Bolaang Mongondow Utara", "Kepulauan Sangihe", "Kepulauan Siau Tagulandang Biaro",
    "Kepulauan Talaud", "Minahasa", "Minahasa Selatan", "Minahasa Tenggara",
    "Minahasa Utara",
  ],
  "Gorontalo": [
    "Gorontalo",
    "Boalemo", "Bone Bolango", "Gorontalo Utara", "Pohuwato",
  ],
  "Sulawesi Tengah": [
    "Palu",
    "Banggai", "Banggai Kepulauan", "Banggai Laut", "Buol", "Donggala",
    "Morowali", "Morowali Utara", "Parigi Moutong", "Poso", "Sigi", "Tojo Una-Una",
    "Toli-Toli",
  ],
  "Sulawesi Barat": [
    "Mamuju", "Majene",
    "Mamasa", "Mamuju Tengah", "Pasangkayu", "Polewali Mandar",
  ],
  "Sulawesi Selatan": [
    "Makassar", "Palopo", "Parepare",
    "Bantaeng", "Barru", "Bone", "Bulukumba", "Enrekang", "Gowa", "Jeneponto",
    "Kepulauan Selayar", "Luwu", "Luwu Timur", "Luwu Utara", "Maros",
    "Pangkajene dan Kepulauan", "Pinrang", "Sidenreng Rappang", "Sinjai",
    "Soppeng", "Takalar", "Tana Toraja", "Toraja Utara", "Wajo",
  ],
  "Sulawesi Tenggara": [
    "Baubau", "Kendari",
    "Bombana", "Buton", "Buton Selatan", "Buton Tengah", "Buton Utara",
    "Kolaka", "Kolaka Timur", "Kolaka Utara", "Konawe", "Konawe Kepulauan",
    "Konawe Selatan", "Konawe Utara", "Muna", "Muna Barat", "Wakatobi",
  ],
  "Maluku": [
    "Ambon", "Tual",
    "Buru", "Buru Selatan", "Kepulauan Aru", "Maluku Barat Daya",
    "Maluku Tengah", "Maluku Tenggara", "Seram Bagian Barat", "Seram Bagian Timur",
  ],
  "Maluku Utara": [
    "Ternate", "Tidore Kepulauan",
    "Halmahera Barat", "Halmahera Selatan", "Halmahera Tengah", "Halmahera Timur",
    "Halmahera Utara", "Kepulauan Sula", "Pulau Morotai", "Pulau Taliabu",
  ],
  "Papua": [
    "Jayapura",
    "Biak Numfor", "Jayapura", "Keerom", "Kepulauan Yapen", "Mamberamo Raya",
    "Sarmi", "Supiori", "Waropen",
  ],
  "Papua Barat": [
    "Manokwari",
    "Fakfak", "Kaimana", "Manokwari Selatan", "Pegunungan Arfak",
    "Teluk Bintuni", "Teluk Wondama",
  ],
  "Papua Barat Daya": [
    "Sorong",
    "Maybrat", "Raja Ampat", "Sorong", "Sorong Selatan", "Tambrauw",
  ],
  "Papua Tengah": [
    "Nabire",
    "Deiyai", "Dogiyai", "Intan Jaya", "Mimika", "Paniai", "Puncak",
    "Puncak Jaya",
  ],
  "Papua Pegunungan": [
    "Wamena",
    "Jayawijaya", "Lanny Jaya", "Mamberamo Tengah", "Nduga", "Pegunungan Bintang",
    "Tolikara", "Yahukimo", "Yalimo",
  ],
  "Papua Selatan": [
    "Merauke",
    "Asmat", "Boven Digoel", "Mappi", "Merauke",
  ],
};

// PROVINCES — list urut sesuai urutan di map. Dipakai untuk render dropdown.
export const PROVINCES: readonly string[] = Object.keys(WILAYAH_INDONESIA);

// citiesOf — ambil list kota untuk provinsi. Return [] kalau provinsi tidak
// ada (user baru set provinsi atau legacy data invalid).
export function citiesOf(province: string): readonly string[] {
  return WILAYAH_INDONESIA[province] ?? [];
}

// isKnownProvince / isKnownCity — validator untuk cek apakah value user
// cocok dengan list resmi. Dipakai di form untuk warning legacy data.
export function isKnownProvince(name: string): boolean {
  return name in WILAYAH_INDONESIA;
}

export function isKnownCity(province: string, city: string): boolean {
  const cities = WILAYAH_INDONESIA[province];
  if (!cities) return false;
  return cities.includes(city);
}
