package auth

// Role constants — plan-reseller-roles.md section 3 (permission matrix).
//
// Hierarchy:
//   Admin (platform superuser)
//     ├── Reseller (B2B partner, mis. agency)
//     │     └── Agent (freelancer/sales di bawah reseller)
//     └── Client (end-user; default role setelah signup)
//
// Migration 0024 rename legacy 'user' → 'client' (semantic konsisten).
const (
	RoleAdmin    = "admin"
	RoleReseller = "reseller"
	RoleAgent    = "agent"
	RoleClient   = "client"
)

// Reseller status enum — hanya berlaku untuk Role='reseller'.
// Reseller signup dengan status 'pending_approval', admin approve jadi 'active'.
// Bisa di-'suspended' kalau ada pelanggaran (misuse, tunggakan billing).
const (
	ResellerStatusPending   = "pending_approval"
	ResellerStatusActive    = "active"
	ResellerStatusSuspended = "suspended"
)

// IsResellerLike return true kalau role reseller atau agent (dua-duanya boleh
// register-for-client). Dipakai middleware `RequireResellerOrAgent`.
func IsResellerLike(role string) bool {
	return role == RoleReseller || role == RoleAgent
}

// IsPlatformStaff return true untuk role admin — helper untuk permission check
// yang lebih readable dari `role == "admin"`.
func IsPlatformStaff(role string) bool {
	return role == RoleAdmin
}

// IsActiveReseller — reseller boleh transact hanya kalau status='active'.
// Pending atau suspended → 403.
func IsActiveReseller(u *User) bool {
	return u != nil && u.Role == RoleReseller && u.ResellerStatus == ResellerStatusActive
}

// CanRegisterForClient — reseller aktif ATAU agent (di bawah reseller aktif;
// parent status check di endpoint handler karena butuh DB lookup).
func CanRegisterForClient(u *User) bool {
	if u == nil {
		return false
	}
	if u.Role == RoleAgent && u.ParentResellerID != nil {
		return true // parent status di-verify di caller (butuh repo lookup)
	}
	return IsActiveReseller(u)
}
