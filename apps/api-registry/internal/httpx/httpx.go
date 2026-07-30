// Package httpx envelope response helpers. Mirror pattern web builder API
// supaya konsumer (web builder) tidak perlu deal dengan 2 shape berbeda.
package httpx

import "github.com/gofiber/fiber/v2"

// OK — success 200 dengan { data: ... }
func OK(c *fiber.Ctx, data any) error {
	return c.Status(fiber.StatusOK).JSON(fiber.Map{"data": data})
}

// Created — success 201.
func Created(c *fiber.Ctx, data any) error {
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": data})
}

// Accepted — 202 untuk async job (mis. register domain).
func Accepted(c *fiber.Ctx, data any) error {
	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"data": data})
}

// Err — response error dengan code + message ID friendly. Konsisten dengan
// web builder API supaya frontend bisa pattern-match by code.
func Err(c *fiber.Ctx, status int, code, message string) error {
	return c.Status(status).JSON(fiber.Map{
		"error": fiber.Map{
			"code":    code,
			"message": message,
		},
	})
}

func BadRequest(c *fiber.Ctx, msg string) error {
	return Err(c, fiber.StatusBadRequest, "bad_request", msg)
}

func Unauthorized(c *fiber.Ctx, msg string) error {
	return Err(c, fiber.StatusUnauthorized, "unauthorized", msg)
}

func Forbidden(c *fiber.Ctx, msg string) error {
	return Err(c, fiber.StatusForbidden, "forbidden", msg)
}

func NotFound(c *fiber.Ctx, msg string) error {
	return Err(c, fiber.StatusNotFound, "not_found", msg)
}

func Conflict(c *fiber.Ctx, msg string) error {
	return Err(c, fiber.StatusConflict, "conflict", msg)
}

func Internal(c *fiber.Ctx, msg string) error {
	return Err(c, fiber.StatusInternalServerError, "internal_error", msg)
}

func BadGateway(c *fiber.Ctx, msg string) error {
	return Err(c, fiber.StatusBadGateway, "upstream_error", msg)
}

func ServiceUnavailable(c *fiber.Ctx, code, msg string) error {
	return Err(c, fiber.StatusServiceUnavailable, code, msg)
}
