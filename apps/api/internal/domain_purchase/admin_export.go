package domain_purchase

import (
	"bytes"
	"encoding/base64"
	"encoding/csv"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/audit"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

// exportChunkSize — baris per request export. Kecil supaya tiap request
// selesai jauh di bawah WriteTimeout server (60s) berapa pun total datanya;
// browser yang menyambung potongan-potongannya.
const exportChunkSize = 2000

// Tanggal di filter dan CSV memakai WIB — admin memilih "1 Nov" dalam
// kalender lokal, bukan UTC. FixedZone supaya tidak bergantung tzdata image.
var wib = time.FixedZone("WIB", 7*3600)

// parseAdminDomainFilter — query string bersama untuk list dan export.
// Return pesan error user-facing kalau input tidak valid.
func parseAdminDomainFilter(c *fiber.Ctx) (AdminDomainFilter, string) {
	expiringDays, _ := strconv.Atoi(c.Query("expiring_days", "0"))
	f := AdminDomainFilter{
		Q:            strings.TrimSpace(c.Query("q")),
		Status:       strings.TrimSpace(c.Query("status")),
		ExpiringDays: expiringDays,
		WithoutSite:  c.Query("without_site") == "true",
	}
	if v := strings.TrimSpace(c.Query("registered_from")); v != "" {
		d, err := time.ParseInLocation("2006-01-02", v, wib)
		if err != nil {
			return f, "registered_from harus berformat YYYY-MM-DD"
		}
		f.RegisteredFrom = &d
	}
	if v := strings.TrimSpace(c.Query("registered_to")); v != "" {
		d, err := time.ParseInLocation("2006-01-02", v, wib)
		if err != nil {
			return f, "registered_to harus berformat YYYY-MM-DD"
		}
		end := d.AddDate(0, 0, 1)
		f.RegisteredTo = &end
	}
	if f.RegisteredFrom != nil && f.RegisteredTo != nil && !f.RegisteredFrom.Before(*f.RegisteredTo) {
		return f, "tanggal awal tidak boleh setelah tanggal akhir"
	}
	return f, ""
}

// AdminExportDomains — GET /api/v1/admin/domains/export. Mengembalikan SATU
// potongan CSV (maks exportChunkSize baris) dengan filter yang sama seperti
// list. Klien mengulang dengan ?cursor= dari header X-Next-Cursor sampai
// header itu kosong. Potongan pertama membawa BOM + baris judul + X-Total-Count.
func (h *Handler) AdminExportDomains(c *fiber.Ctx) error {
	f, msg := parseAdminDomainFilter(c)
	if msg != "" {
		return httpx.BadRequest(c, msg)
	}
	var after *ExportCursor
	if raw := c.Query("cursor"); raw != "" {
		cur, err := decodeExportCursor(raw)
		if err != nil {
			return httpx.BadRequest(c, "cursor tidak valid")
		}
		after = &cur
	}

	first := after == nil
	if first {
		total, err := h.repo.AdminCountDomains(c.Context(), f)
		if err != nil {
			slog.Error("admin export domains: count failed", "error", err)
			return httpx.Internal(c, "export gagal")
		}
		c.Set("X-Total-Count", strconv.Itoa(total))
		var actor uuid.UUID
		if cl := auth.ClaimsFrom(c); cl != nil {
			actor = cl.UserID
		}
		h.logAudit(c.Context(), actor, audit.EventAdminDomainsExported, "domain", "", map[string]any{
			"total": total, "q": f.Q, "status": f.Status,
			"registered_from": c.Query("registered_from"), "registered_to": c.Query("registered_to"),
		})
	}

	rows, err := h.repo.AdminExportDomains(c.Context(), f, after, exportChunkSize)
	if err != nil {
		slog.Error("admin export domains: query failed", "error", err)
		return httpx.Internal(c, "export gagal")
	}

	var buf bytes.Buffer
	if first {
		// BOM supaya Excel membaca UTF-8 (nama pemilik ber-aksen) dengan benar.
		buf.WriteString("\xEF\xBB\xBF")
	}
	w := csv.NewWriter(&buf)
	if first {
		_ = w.Write([]string{
			"Domain", "Status", "Nama Pemilik", "Email Pemilik", "ID Pemilik",
			"Email Pembeli (atas nama)", "Punya Situs", "ID Situs", "Contact ID",
			"Terdaftar (WIB)", "Kedaluwarsa (WIB)", "Perpanjangan Terakhir (WIB)",
			"Registrar Job ID",
		})
	}
	for i := range rows {
		r := &rows[i]
		hasSite, siteID := "Belum", ""
		if r.SiteID != nil {
			hasSite, siteID = "Ada", r.SiteID.String()
		}
		_ = w.Write([]string{
			csvSafe(r.Name), r.Status, csvSafe(r.OwnerName), csvSafe(r.OwnerEmail), r.UserID.String(),
			csvSafe(r.PurchaserEmail), hasSite, siteID, csvSafe(r.ContactID),
			fmtWIB(&r.RegisteredAt), fmtWIB(r.ExpiresAt), fmtWIB(r.LastRenewedAt),
			csvSafe(r.RegistrarJobID),
		})
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return httpx.Internal(c, "export gagal")
	}

	next := ""
	if len(rows) == exportChunkSize {
		last := rows[len(rows)-1]
		next = encodeExportCursor(ExportCursor{RegisteredAt: last.RegisteredAt, ID: last.ID})
	}
	c.Set("X-Next-Cursor", next)
	c.Set("X-Row-Count", strconv.Itoa(len(rows)))
	// Header custom tidak terbaca fetch() lintas origin tanpa ini.
	c.Set("Access-Control-Expose-Headers", "X-Next-Cursor, X-Total-Count, X-Row-Count")
	c.Set("Cache-Control", "no-store")
	c.Set("Content-Type", "text/csv; charset=utf-8")
	return c.Send(buf.Bytes())
}

func encodeExportCursor(cur ExportCursor) string {
	raw := fmt.Sprintf("%d_%s", cur.RegisteredAt.UnixMicro(), cur.ID)
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeExportCursor(s string) (ExportCursor, error) {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return ExportCursor{}, err
	}
	ts, id, ok := strings.Cut(string(b), "_")
	if !ok {
		return ExportCursor{}, fmt.Errorf("cursor malformed")
	}
	micros, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return ExportCursor{}, err
	}
	uid, err := uuid.Parse(id)
	if err != nil {
		return ExportCursor{}, err
	}
	// Mikrodetik = presisi timestamptz Postgres, jadi perbandingan keyset eksak.
	return ExportCursor{RegisteredAt: time.UnixMicro(micros).UTC(), ID: uid}, nil
}

func fmtWIB(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.In(wib).Format("2006-01-02 15:04")
}

// csvSafe — cegah formula injection: nama pemilik diisi user, dan sel yang
// diawali = + - @ dieksekusi Excel/Sheets sebagai rumus.
func csvSafe(s string) string {
	if s != "" && strings.ContainsRune("=+-@\t\r", rune(s[0])) {
		return "'" + s
	}
	return s
}
