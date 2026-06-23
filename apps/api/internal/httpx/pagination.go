package httpx

import (
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// Pagination holds parsed list query params.
type Pagination struct {
	Page     int
	PageSize int
	Q        string // free-text search
	Sort     string // sort preset key (validated by repo)
}

// Offset is computed for SQL.
func (p Pagination) Offset() int { return (p.Page - 1) * p.PageSize }

// LikePattern returns the wildcard pattern usable directly in `LOWER(col) LIKE $n`.
// Empty input produces "%" which matches everything, so the same query handles
// both "no filter" and "with filter".
func (p Pagination) LikePattern() string {
	if p.Q == "" {
		return "%"
	}
	return "%" + strings.ToLower(p.Q) + "%"
}

// ParsePagination reads `?page=&page_size=&q=&sort=` from the request.
// Defaults: page=1, page_size=20, clamped to [1, 100].
func ParsePagination(c *fiber.Ctx) Pagination {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	if page < 1 {
		page = 1
	}
	size, _ := strconv.Atoi(c.Query("page_size", "20"))
	if size < 1 {
		size = 20
	}
	if size > 100 {
		size = 100
	}
	return Pagination{
		Page:     page,
		PageSize: size,
		Q:        strings.TrimSpace(c.Query("q")),
		Sort:     strings.TrimSpace(c.Query("sort")),
	}
}

// Paginated[T] is the standard list response envelope.
type Paginated[T any] struct {
	Items      []T `json:"items"`
	Page       int `json:"page"`
	PageSize   int `json:"page_size"`
	Total      int `json:"total"`
	TotalPages int `json:"total_pages"`
}

// MakePaginated computes total_pages and bundles.
func MakePaginated[T any](items []T, p Pagination, total int) Paginated[T] {
	if items == nil {
		items = []T{}
	}
	totalPages := 1
	if p.PageSize > 0 {
		totalPages = (total + p.PageSize - 1) / p.PageSize
	}
	if totalPages < 1 {
		totalPages = 1
	}
	return Paginated[T]{
		Items:      items,
		Page:       p.Page,
		PageSize:   p.PageSize,
		Total:      total,
		TotalPages: totalPages,
	}
}
