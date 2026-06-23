package httpx

import "github.com/gofiber/fiber/v2"

func OK(c *fiber.Ctx, data any) error {
	return c.Status(fiber.StatusOK).JSON(fiber.Map{"data": data})
}

func Created(c *fiber.Ctx, data any) error {
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": data})
}

func Err(c *fiber.Ctx, status int, code, msg string) error {
	return c.Status(status).JSON(fiber.Map{"error": fiber.Map{
		"code":    code,
		"message": msg,
	}})
}

func BadRequest(c *fiber.Ctx, msg string) error    { return Err(c, fiber.StatusBadRequest, "bad_request", msg) }
func Unauthorized(c *fiber.Ctx, msg string) error  { return Err(c, fiber.StatusUnauthorized, "unauthorized", msg) }
func Forbidden(c *fiber.Ctx, msg string) error     { return Err(c, fiber.StatusForbidden, "forbidden", msg) }
func NotFound(c *fiber.Ctx, msg string) error      { return Err(c, fiber.StatusNotFound, "not_found", msg) }
func Conflict(c *fiber.Ctx, msg string) error      { return Err(c, fiber.StatusConflict, "conflict", msg) }
func Internal(c *fiber.Ctx, msg string) error      { return Err(c, fiber.StatusInternalServerError, "internal", msg) }
