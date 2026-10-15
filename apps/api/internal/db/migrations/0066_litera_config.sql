-- +goose Up

-- litera_config: singleton row (CHECK id=1) berisi credentials + smart contract
-- defaults untuk integrasi Literaa NFT publishing. Simpan di DB (bukan env)
-- supaya admin bisa ganti via UI tanpa restart API.
--
-- Semua numeric reward pakai BIGINT karena token LITE amounts bisa > INT max
-- (wei-style scaling). default_max_minted pakai INT (jumlah NFT, aman di INT).
-- enabled=false default supaya aman kalau belum isi API key.

CREATE TABLE IF NOT EXISTS litera_config (
    id                              INT         PRIMARY KEY DEFAULT 1,
    api_key                         TEXT        NOT NULL DEFAULT '',
    base_url                        TEXT        NOT NULL DEFAULT 'https://literaa.xyz/api/v1',
    collection_name                 TEXT        NOT NULL DEFAULT 'BikinWeb Educational Collection',
    default_price                   BIGINT      NOT NULL DEFAULT 0,
    default_fee_enabled             BOOLEAN     NOT NULL DEFAULT false,
    default_max_minted              INT         NOT NULL DEFAULT 100,
    default_user_reward             BIGINT      NOT NULL DEFAULT 0,
    default_creator_mint_reward     BIGINT      NOT NULL DEFAULT 0,
    default_creator_approve_reward  BIGINT      NOT NULL DEFAULT 0,
    enabled                         BOOLEAN     NOT NULL DEFAULT false,
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT litera_config_singleton CHECK (id = 1)
);

-- Seed row id=1 kalau belum ada. Semua kolom pakai DEFAULT jadi row kosong valid.
INSERT INTO litera_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- +goose Down

DROP TABLE IF EXISTS litera_config;
