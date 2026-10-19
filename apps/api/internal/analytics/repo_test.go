package analytics

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL kosong — skip integration test")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// GetSummary pernah balas 500 untuk SEMUA request karena `($2 || ' days')`
// bikin Postgres infer $2 sebagai text, dan pgx tidak punya encode plan dari
// Go int ke OID text. Site kosong sudah cukup untuk menangkapnya: errornya
// terjadi saat encode argumen, sebelum query menyentuh baris apa pun.
func TestGetSummary_EncodesDaysParam(t *testing.T) {
	pool := testPool(t)
	repo := NewRepo(pool)

	for _, days := range []int{7, 30, 90} {
		sum, err := repo.GetSummary(context.Background(), uuid.New(), days)
		if err != nil {
			t.Fatalf("days=%d: %v", days, err)
		}
		if sum.TotalDays != days {
			t.Errorf("days=%d: TotalDays = %d", days, sum.TotalDays)
		}
	}
}

// Window harus pas N hari termasuk hari ini. Versi lama pakai `>=` terhadap
// `CURRENT_DATE - N` sehingga menghitung N+1 hari, bikin total headline tidak
// pernah cocok dengan jumlah batang di chart (frontend render N hari).
func TestDaysWindowIsInclusiveOfToday(t *testing.T) {
	pool := testPool(t)

	for _, days := range []int{7, 30, 90} {
		var got int
		err := pool.QueryRow(context.Background(), `
			SELECT count(*) FROM generate_series(
				`+today+` - 400, `+today+`, interval '1 day'
			) AS d
			 WHERE d::date > `+today+` - $1::int
		`, days).Scan(&got)
		if err != nil {
			t.Fatalf("days=%d: %v", days, err)
		}
		if got != days {
			t.Errorf("days=%d: window mencakup %d hari", days, got)
		}
	}
}

// Bucket harian harus mengikuti WIB, bukan timezone server. Kalau `today`
// kembali memakai CURRENT_DATE di server UTC, kunjungan 00:00–07:00 WIB masuk
// bucket kemarin dan "Views hari ini" terlihat kosong sampai siang.
func TestTodayFollowsJakarta(t *testing.T) {
	pool := testPool(t)

	var got, want string
	err := pool.QueryRow(context.Background(),
		`SELECT (`+today+`)::text, (now() AT TIME ZONE 'Asia/Jakarta')::date::text`,
	).Scan(&got, &want)
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Errorf("today = %s, mau %s (WIB)", got, want)
	}
}
