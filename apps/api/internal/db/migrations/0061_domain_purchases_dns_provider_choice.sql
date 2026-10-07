-- +goose Up
-- Step 4 of DNS multi-provider: let the user record their explicit DNS
-- provider choice on a purchase. Null = "use admin priority default".
--
-- Lives on domain_purchases (not registered_domains) because the choice is
-- captured BEFORE registration completes — the purchase row exists at
-- /domains/purchase time, registered_domains row only after EPP CREATE.
--
-- Flow (Step 15 wizard UI):
--   1. User buka /sites/new-with-domain, pilih provider di dropdown
--      ("Default", "Cloudflare", "DNSCloud") → body.dns_provider_choice.
--   2. Handler POST /domains/purchase simpan nilai di kolom ini.
--   3. ExecuteAfterPayment → tryAttachToDNS baca kolom ini → factory
--      resolve provider sesuai pilihan user (atau priority admin kalau null).
--
-- Choice tidak diteruskan ke registered_domains karena setelah attach
-- berhasil, "sticky" adalah dns_provider_config_id di tabel itu — bukan
-- choice (yang bisa null untuk "default", tapi dns_provider_config_id harus
-- deterministik untuk lifecycle ops).
ALTER TABLE domain_purchases
    ADD COLUMN IF NOT EXISTS dns_provider_choice TEXT
        CHECK (dns_provider_choice IN ('cloudflare','dnscloud'));

-- +goose Down
ALTER TABLE domain_purchases DROP COLUMN IF EXISTS dns_provider_choice;
