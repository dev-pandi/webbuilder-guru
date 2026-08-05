// PM2 ecosystem — 4 process untuk stack web-builder:
//   1. api          Go backend (JWT, sites, invoices, wallet, dsb.)
//   2. api-registry Go EPP internal service (HMAC-authed dari api)
//   3. web          Next.js dashboard (admin + reseller + agent + client)
//   4. renderer     Next.js public site renderer (multi-tenant by Host)
//
// Prerequisites (jalanin sekali sebelum `pm2 start`):
//
//   # Build Go binaries
//   cd apps/api          && go build -o tmp/api ./cmd/server
//   cd apps/api-registry && go build -o tmp/api-registry ./cmd/server
//
//   # Build Next.js
//   cd apps/web       && npm ci && npm run build
//   cd apps/renderer  && npm ci && npm run build
//
//   # Env — copy + edit sesuai environment
//   cp apps/api/.env.example          apps/api/.env
//   cp apps/api-registry/.env.example apps/api-registry/.env
//   cp apps/web/.env.example          apps/web/.env.local
//   cp apps/renderer/.env.example     apps/renderer/.env.local
//
// Commands:
//   pm2 start ecosystem.config.js               # start semua
//   pm2 start ecosystem.config.js --only api    # start satu
//   pm2 restart ecosystem.config.js             # rolling restart
//   pm2 reload ecosystem.config.js              # zero-downtime reload (cluster mode)
//   pm2 logs                                    # tail semua log
//   pm2 logs api --lines 200                    # tail 1 service
//   pm2 monit                                   # dashboard interactive
//   pm2 delete ecosystem.config.js              # stop + remove
//   pm2 save                                    # persist ke ~/.pm2 supaya auto-start on reboot
//   pm2 startup                                 # generate systemd unit (jalankan sekali)

module.exports = {
  apps: [
    // ---------------- Go: web-builder API ----------------
    {
      name: "api",
      cwd: "./apps/api",
      script: "./tmp/api",
      interpreter: "none", // binary langsung, bukan node

      env: {
        HTTP_ADDR: ":8080",
        APP_ENV: "production",
      },
      env_development: {
        HTTP_ADDR: ":8080",
        APP_ENV: "dev",
      },

      // Go binary single-threaded per process; scale via horizontal replicas
      // di reverse proxy kalau butuh (jarang perlu untuk web-builder).
      instances: 1,
      exec_mode: "fork",

      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      min_uptime: "10s",
      max_restarts: 10,

      // Graceful shutdown — Fiber listen for SIGTERM, drain 30s.
      kill_timeout: 30000,
      wait_ready: false,

      out_file: "./logs/api-out.log",
      error_file: "./logs/api-err.log",
      time: true, // prefix log dengan timestamp
      merge_logs: true,
    },

    // ---------------- Go: api-registry (internal EPP service) ----------------
    {
      name: "api-registry",
      cwd: "./apps/api-registry",
      script: "./tmp/api-registry",
      interpreter: "none",

      env: {
        PORT: "5000",
        APP_ENV: "production",
      },
      env_development: {
        PORT: "5000",
        APP_ENV: "dev",
      },

      // Single instance — EPP session ke PANDI serial (kecuali kita naikkan
      // session pool). Multi-instance = konsisten kalau upstream session cap
      // memungkinkan.
      instances: 1,
      exec_mode: "fork",

      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      min_uptime: "10s",
      max_restarts: 10,

      kill_timeout: 30000,

      out_file: "./logs/api-registry-out.log",
      error_file: "./logs/api-registry-err.log",
      time: true,
      merge_logs: true,
    },

    // ---------------- Next.js: dashboard ----------------
    {
      name: "web",
      cwd: "./apps/web",
      script: "node_modules/next/dist/bin/next",
      args: "start --port 4000",
      // Next.js prod server = 1 event loop; scale via cluster (fan-out ke
      // N worker sharing port). Bagus untuk CPU-bound render RSC.
      instances: process.env.WEB_INSTANCES || 2,
      exec_mode: "cluster",

      env: {
        NODE_ENV: "production",
        PORT: "4000",
      },
      env_development: {
        NODE_ENV: "development",
        PORT: "4000",
      },

      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      min_uptime: "10s",
      max_restarts: 10,

      kill_timeout: 10000,
      // Next.js signal handler cukup cepat — 10s biasanya lebih dari cukup.
      listen_timeout: 10000,

      out_file: "./logs/web-out.log",
      error_file: "./logs/web-err.log",
      time: true,
      merge_logs: true,
    },

    // ---------------- Next.js: renderer (public multi-tenant SSR) ----------------
    {
      name: "renderer",
      cwd: "./apps/renderer",
      script: "node_modules/next/dist/bin/next",
      args: "start --port 4001",

      // Public-facing renderer paling banyak traffic. Cluster 2-4 instance
      // untuk parallel request. Set via env WEB_INSTANCES=4 kalau perlu.
      instances: process.env.RENDERER_INSTANCES || 2,
      exec_mode: "cluster",

      env: {
        NODE_ENV: "production",
        PORT: "4001",
      },
      env_development: {
        NODE_ENV: "development",
        PORT: "4001",
      },

      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      min_uptime: "10s",
      max_restarts: 10,

      kill_timeout: 10000,
      listen_timeout: 10000,

      out_file: "./logs/renderer-out.log",
      error_file: "./logs/renderer-err.log",
      time: true,
      merge_logs: true,
    },
  ],

  // Optional deploy config — remote deploy via `pm2 deploy production`.
  // Uncomment + isi host/user/repo kalau butuh.
  //
  // deploy: {
  //   production: {
  //     user: "deploy",
  //     host: "prod.example.com",
  //     ref: "origin/main",
  //     repo: "git@github.com:you/web-builder.git",
  //     path: "/var/www/web-builder",
  //     "post-deploy":
  //       "cd apps/api && go build -o tmp/api ./cmd/server && " +
  //       "cd ../api-registry && go build -o tmp/api-registry ./cmd/server && " +
  //       "cd ../web && npm ci && npm run build && " +
  //       "cd ../renderer && npm ci && npm run build && " +
  //       "cd ../.. && pm2 startOrReload ecosystem.config.js --env production",
  //   },
  // },
};
