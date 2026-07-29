package auth

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/mail"
)

// resellerApplyReq — body untuk POST /auth/reseller/apply.
// Anonymous endpoint — siapapun bisa apply, admin review + approve.
type resellerApplyReq struct {
	Email               string `json:"email"`
	Password            string `json:"password"`
	Name                string `json:"name"`                  // nama PIC contact
	ResellerDisplayName string `json:"reseller_display_name"` // nama bisnis
	PhoneNumber         string `json:"phone_number"`
	Address             string `json:"address"`
	City                string `json:"city"`
	State               string `json:"state"`
	PostalCode          string `json:"postal_code"`
	Nik                 string `json:"nik,omitempty"` // opsional
}

func (r *resellerApplyReq) validate() error {
	r.Email = strings.ToLower(strings.TrimSpace(r.Email))
	r.Name = strings.TrimSpace(r.Name)
	r.ResellerDisplayName = strings.TrimSpace(r.ResellerDisplayName)
	if !strings.Contains(r.Email, "@") {
		return errors.New("email tidak valid")
	}
	if len(r.Password) < 8 {
		return errors.New("password minimal 8 karakter")
	}
	if r.Name == "" {
		return errors.New("nama PIC wajib diisi")
	}
	if r.ResellerDisplayName == "" {
		return errors.New("nama bisnis wajib diisi")
	}
	// Contact/postal wajib untuk EPP contact + WHOIS (nanti dipakai saat
	// register domain first-time). Cegah reseller yang belum lengkap
	// profil trigger flow beli domain lalu gagal di tengah.
	if strings.TrimSpace(r.PhoneNumber) == "" {
		return errors.New("nomor HP wajib diisi")
	}
	if strings.TrimSpace(r.Address) == "" {
		return errors.New("alamat wajib diisi")
	}
	if strings.TrimSpace(r.City) == "" {
		return errors.New("kota wajib diisi")
	}
	if strings.TrimSpace(r.PostalCode) == "" {
		return errors.New("kode pos wajib diisi")
	}
	return nil
}

// ResellerApply — POST /api/v1/auth/reseller/apply (anonymous).
//
// Bikin user baru dengan role='reseller' + reseller_status='pending_approval'.
// User TIDAK bisa login sampai admin approve (login handler cek status).
// Sengaja tidak issue JWT di response — supaya semantic jelas "menunggu approval".
//
// Rate limit: dilakukan di router layer (RateLimitIP loginPerWindow).
func (h *Handler) ResellerApply(c *fiber.Ctx) error {
	var req resellerApplyReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if err := req.validate(); err != nil {
		return httpx.BadRequest(c, err.Error())
	}

	hash, err := HashPassword(req.Password)
	if err != nil {
		return httpx.Internal(c, "hash error")
	}

	u, err := h.repo.CreateResellerApplication(c.Context(), ResellerApplication{
		Email:               req.Email,
		PasswordHash:        hash,
		Name:                req.Name,
		ResellerDisplayName: req.ResellerDisplayName,
		PhoneNumber:         req.PhoneNumber,
		Address:             req.Address,
		City:                req.City,
		State:               req.State,
		PostalCode:          req.PostalCode,
		Nik:                 req.Nik,
	})
	if errors.Is(err, ErrEmailTaken) {
		return httpx.Conflict(c, "email sudah terdaftar")
	}
	if err != nil {
		return httpx.Internal(c, "create failed")
	}

	// Fire-and-forget notif ke admin platform + acknowledgment email ke applicant.
	go h.notifyResellerApplication(u)

	return httpx.Created(c, fiber.Map{
		"message":         "Aplikasi diterima. Admin akan review + email notifikasi begitu disetujui.",
		"reseller_id":     u.ID.String(),
		"reseller_status": u.ResellerStatus,
	})
}

// notifyResellerApplication — kirim email ke applicant (acknowledge) + admin
// notif (kalau ADMIN_EMAIL config). Fail-silent — mail server issue tidak
// boleh block signup.
func (h *Handler) notifyResellerApplication(u *User) {
	if h.mailer == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Ack ke applicant
	ackBody := "Halo " + u.Name + ",\n\n" +
		"Terima kasih sudah daftar sebagai reseller Web Builder.\n" +
		"Nama bisnis: " + u.ResellerDisplayName + "\n\n" +
		"Aplikasi Anda sedang di-review admin. Kami akan email begitu approve.\n" +
		"SLA review: 1-2 hari kerja.\n\n" +
		"Best regards,\nTim Web Builder"
	if err := h.mailer.Send(ctx, mail.Message{
		To:      u.Email,
		Subject: "Aplikasi Reseller Web Builder Diterima",
		Body:    ackBody,
	}); err != nil {
		slog.Warn("reseller apply: ack email failed", "email", u.Email, "err", err)
	}
}

// AllowLoginForRole — helper untuk block login kalau reseller status != active.
// Return non-nil error message (fiber-friendly) kalau tidak boleh login.
// Pisahkan dari Login handler supaya gampang test.
func AllowLoginForRole(u *User) error {
	if u == nil {
		return nil // handler lain akan handle nil case
	}
	if u.Role == RoleReseller {
		switch u.ResellerStatus {
		case ResellerStatusActive:
			return nil
		case ResellerStatusPending:
			return errors.New("Akun reseller Anda masih menunggu approval admin. Kami akan email begitu approved.")
		case ResellerStatusSuspended:
			return errors.New("Akun reseller Anda di-suspend. Contact admin platform untuk info lebih lanjut.")
		default:
			return errors.New("Status akun reseller tidak valid. Contact admin.")
		}
	}
	return nil
}
