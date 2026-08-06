// Shared TS types untuk wizard beli-domain. File `_types.ts` sengaja underscore
// supaya Next.js tidak treat sebagai route.

export type Me = {
  id: string;
  email: string;
  name: string;
  phone_number: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  nik: string;
};

export type PriceBlock = {
  currency: string;
  register: number;
  renew: number;
  transfer: number;
};

export type ZoneBlock = {
  name: string;
  require_document: boolean;
  auto_approved: boolean;
  nik_auto_approved: boolean;
};

// CheckEntry = 1 baris hasil dari registrar check (per domain+TLD).
export type CheckEntry = {
  domain: string;
  tld: string;
  available: boolean;
  reason?: string;
  price?: PriceBlock;
  zone?: ZoneBlock;
};

// CheckResp — envelope response dari /api/v1/domains/check.
// Length dari results tergantung mode input:
//   input SLD ("myshop")     → N entry (1 per allowed_zone)
//   input full ("myshop.id") → 1 entry
export type CheckResp = {
  query: string;
  allowed_zones: string[];
  results: CheckEntry[];
};

// PurchaseResp — shape response dari POST /api/v1/domains/purchase
// (2-phase self-sufficient checkout).
export type PurchaseResp = {
  job_id: string;      // = invoice_id string
  invoice_id: string;
  domain: string;
  status: string;      // "pending_payment" | "pending_provisioning" | "active" | "failed"
  payment_url?: string;
  instructions?: string; // untuk manual_bank
  total: number;       // IDR minor unit
  currency: string;
  due_at: string;      // RFC3339
};

// Document = 1 baris di library dokumen user (self-sufficient, disimpan
// di storage internal). ID dipakai pre-attach di purchase.
export type Document = {
  id: string;
  name: string;
  category_id: number;
  category_name?: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

// DocumentCategory = shape dari GET /api/v1/documents/categories.
export type DocumentCategory = {
  id: number;
  name: string;
  parent_id?: number;
};

// PaymentMethod = code dari `payment_methods` table (dinamis, tidak lagi
// hardcoded). Wizard fetch enabled methods dari GET /payment-methods lalu
// render pilihan sesuai admin config.
export type PaymentMethod = string;

// PaymentMethodInfo — 1 baris dari GET /api/v1/payment-methods (public
// endpoint, credentials sudah di-mask). Wizard pakai `code` + `label` +
// `type` untuk render pilihan.
export type PaymentMethodInfo = {
  id: string;
  code: string;
  label: string;
  type: "gateway" | "manual" | "wallet" | string;
  enabled: boolean;
  sort_order: number;
};
