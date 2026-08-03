// categories.go — katalog dokumen kepatuhan yang di-hardcode.
//
// Category ID = SMALLINT, matches DB kolom documents.category_id. Enum ini
// tidak di-DB-side supaya tambah kategori baru = 1-line code change (bukan
// migration). Trade-off: DB validation lebih longgar; tapi handler enforce
// via IsValid() sebelum insert.

package documents_local

// Category ID constants — nilai stable, jangan renumber (referenced dari
// existing rows). Tambah kategori baru = ID incremental berikutnya.
const (
	CategoryKTP      = 1 // Kartu Tanda Penduduk
	CategoryNPWP     = 2 // Nomor Pokok Wajib Pajak
	CategorySITU     = 3 // Surat Izin Tempat Usaha
	CategoryPassport = 4 // Paspor (WNA / WNI di luar negeri)
	CategoryKK       = 5 // Kartu Keluarga
	CategorySIUP     = 6 // Surat Izin Usaha Perdagangan
	CategoryNIB      = 7 // Nomor Induk Berusaha (OSS)
	CategoryAKTA     = 8 // Akta pendirian perusahaan
)

type Category struct {
	ID       int16   `json:"id"`
	Name     string  `json:"name"`
	ParentID *int16  `json:"parent_id,omitempty"`
}

// Categories — static list, tetap urutan konsisten untuk UI.
func Categories() []Category {
	return []Category{
		{ID: CategoryKTP, Name: "KTP"},
		{ID: CategoryNPWP, Name: "NPWP"},
		{ID: CategoryKK, Name: "Kartu Keluarga"},
		{ID: CategoryPassport, Name: "Paspor"},
		{ID: CategorySITU, Name: "SITU"},
		{ID: CategorySIUP, Name: "SIUP"},
		{ID: CategoryNIB, Name: "NIB"},
		{ID: CategoryAKTA, Name: "Akta Pendirian"},
	}
}

// IsValid — cek apakah id ada di katalog.
func IsValidCategory(id int16) bool {
	for _, c := range Categories() {
		if c.ID == id {
			return true
		}
	}
	return false
}
