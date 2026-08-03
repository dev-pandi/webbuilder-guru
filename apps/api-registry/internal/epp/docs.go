package epp

import (
	"context"
	"fmt"

	"github.com/webbuilder/api-registry/internal/provider"
)

// Document flow bukan EPP concern per arsitektur SaaS platform. Document
// upload (KTP/NPWP untuk .id) di web builder side:
//   - Storage: S3/MinIO
//   - Metadata: web builder DB
//   - Verification: admin panel workflow
//
// EPP direct mode return ErrCapabilityMissing supaya handler return 503
// dan consumer (web builder) tau harus handle upload di layer sendiri
// (bukan proxy ke api-registry).
//
// PANDI wrapper mode DOES support ini karena registrar-api PANDI expose
// endpoint /documents multipart — dipakai flow legacy.

func (p *EPPDirectProvider) UploadDocument(ctx context.Context, req provider.UploadDocumentRequest) (*provider.UploadDocumentResponse, error) {
	return nil, fmt.Errorf("%w: document upload di web builder side (bukan EPP concern per arsitektur SaaS)", provider.ErrCapabilityMissing)
}

func (p *EPPDirectProvider) ListDocuments(ctx context.Context, externalUserID string) (*provider.DocumentsListResponse, error) {
	return nil, fmt.Errorf("%w: document listing di web builder side", provider.ErrCapabilityMissing)
}
