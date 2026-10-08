-- +goose Up
-- Allow 'external' as a third dns_provider value — represents a domain
-- whose zone is managed outside the platform (user runs their own DNS at
-- another provider, mis. Route53, Google DNS, atau self-hosted BIND).
--
-- Flow: admin klik "Switch Provider → External" di dashboard →
-- registered_domains.dns_provider='external', dns_provider_config_id=NULL,
-- dns_zone_id=''. tryAttachToDNS retry di-skip untuk domain external
-- (external = intentional, bukan failure).
--
-- Nameserver tetap bisa diubah user via /settings/domains/:name (level
-- registrar, bukan provider-managed) — "external" cuma menandai bahwa
-- platform tidak lagi punya zone yang di-manage.
ALTER TABLE registered_domains
    DROP CONSTRAINT IF EXISTS registered_domains_dns_provider_check;

ALTER TABLE registered_domains
    ADD CONSTRAINT registered_domains_dns_provider_check
    CHECK (dns_provider IN ('cloudflare','dnscloud','external'));

-- +goose Down
ALTER TABLE registered_domains
    DROP CONSTRAINT IF EXISTS registered_domains_dns_provider_check;

-- Guard: any 'external' row would violate the restored check — convert ke
-- 'cloudflare' sebagai default (least surprise). Operator run migration
-- down intentionally — accept data lossy conversion.
UPDATE registered_domains SET dns_provider = 'cloudflare' WHERE dns_provider = 'external';

ALTER TABLE registered_domains
    ADD CONSTRAINT registered_domains_dns_provider_check
    CHECK (dns_provider IN ('cloudflare','dnscloud'));
