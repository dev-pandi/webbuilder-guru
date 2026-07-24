// Shape shared antara list page dan print dialog. Selaras dengan payload
// backend proxy di apps/api/internal/registrar/types.go → Invoice + InvoiceJob.

export type InvoiceJob = {
  job_id: string;
  domain: string;
  kind: string; // "register" | "renew"
  years: number;
  status: string;
  external_user_id?: string;
};

export type Invoice = {
  id: number;
  uuid: string;
  invoice_number: string;
  total_price: number;
  status: string; // "Unpaid" | "On Check" | "Paid" | "Canceled" | "Expired" | "Refund" | "Rejected"
  due_date: string;
  transaction_date?: string;
  created_at: string;
  jobs: InvoiceJob[];
};

export type Pagination = {
  current: number;
  totalPages: number;
  perPage: number;
  totalRecords: number;
  recordsOnPage: number;
};

export type InvoicesResponse = {
  items: Invoice[];
  pagination?: Pagination;
};

// Me — subset dari /api/v1/auth/me yang dipakai print header (bill-to).
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
