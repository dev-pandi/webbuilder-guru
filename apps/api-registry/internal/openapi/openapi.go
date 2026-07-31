// Package openapi — serve OpenAPI 3.1 spec. Hand-written untuk MVP (deps
// generator masih heavy). Nanti bisa auto-gen dari route table.
package openapi

import _ "embed"

//go:embed spec.json
var Spec []byte
