package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Claims struct {
	UserID uuid.UUID `json:"uid"`
	Email  string    `json:"email"`
	Role   string    `json:"role"`
	jwt.RegisteredClaims
}

type TokenIssuer struct {
	secret     []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
}

func NewTokenIssuer(secret string, accessTTL, refreshTTL time.Duration) *TokenIssuer {
	return &TokenIssuer{secret: []byte(secret), accessTTL: accessTTL, refreshTTL: refreshTTL}
}

func (t *TokenIssuer) IssueAccess(userID uuid.UUID, email, role string) (string, time.Time, error) {
	exp := time.Now().Add(t.accessTTL)
	claims := Claims{
		UserID: userID,
		Email:  email,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   userID.String(),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, err := tok.SignedString(t.secret)
	return s, exp, err
}

func (t *TokenIssuer) Parse(token string) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(token, &Claims{}, func(tok *jwt.Token) (interface{}, error) {
		if _, ok := tok.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return t.secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

func (t *TokenIssuer) RefreshTTL() time.Duration { return t.refreshTTL }

// PreviewClaims represents a short-lived, scope-limited token that grants
// read-only access to ONE page's draft tree. Used by the editor's "share
// pratinjau" feature so a non-logged-in reviewer can see unpublished content.
type PreviewClaims struct {
	PageID uuid.UUID `json:"page_id"`
	jwt.RegisteredClaims
}

// IssuePreview signs a JWT good for `ttl` (typically 1h) that bears the
// audience "preview". Storing nothing server-side — the token itself is the
// capability; validation is just HMAC.
func (t *TokenIssuer) IssuePreview(pageID uuid.UUID, ttl time.Duration) (string, time.Time, error) {
	exp := time.Now().Add(ttl)
	claims := PreviewClaims{
		PageID: pageID,
		RegisteredClaims: jwt.RegisteredClaims{
			Audience:  jwt.ClaimStrings{"preview"},
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   pageID.String(),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, err := tok.SignedString(t.secret)
	return s, exp, err
}

// ParsePreview verifies a preview token + audience.
func (t *TokenIssuer) ParsePreview(token string) (*PreviewClaims, error) {
	parsed, err := jwt.ParseWithClaims(token, &PreviewClaims{}, func(tok *jwt.Token) (interface{}, error) {
		if _, ok := tok.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return t.secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := parsed.Claims.(*PreviewClaims)
	if !ok || !parsed.Valid {
		return nil, errors.New("invalid token")
	}
	// Defence-in-depth — refuse if audience isn't "preview" (e.g. someone
	// tried to use an access token here).
	auds, _ := claims.GetAudience()
	matched := false
	for _, a := range auds {
		if a == "preview" {
			matched = true
			break
		}
	}
	if !matched {
		return nil, errors.New("wrong audience")
	}
	return claims, nil
}
