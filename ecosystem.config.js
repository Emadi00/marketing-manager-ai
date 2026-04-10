// PM2 Ecosystem — Videocraft Studio
// Avvio: pm2 start ecosystem.config.js
// Stop:  pm2 stop all
// Logs:  pm2 logs
// Monitor: pm2 monit

const BASE = "C:\\Users\\super\\Desktop\\MARKETING MANAGER";

module.exports = {
  apps: [
    // ── 1. Bot Telegram ────────────────────────────────────────────────────
    {
      name: "bot",
      script: "bot_telegram.py",
      interpreter: "python",
      cwd: BASE,
      env_file: `${BASE}\\.env`,
      // Riavvio automatico se crasha; max 10 restart in 30s
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
      log_file: `${BASE}\\bot.log`,
      error_file: `${BASE}\\bot.error.log`,
      out_file: `${BASE}\\bot.out.log`,
      time: true,
    },

    // ── 2. Dashboard Next.js ───────────────────────────────────────────────
    {
      name: "dashboard",
      script: "npm",
      args: "run dev",          // cambio in "start" dopo build per produzione
      cwd: `${BASE}\\dashboard`,
      env: {
        PORT: 3000,
        NODE_ENV: "development",  // cambio in "production" su Hetzner
      },
      autorestart: true,
      max_restarts: 5,
      restart_delay: 5000,
      watch: false,
    },

    // ── 3. SMM Webhook listener (Upload-Post callbacks) ────────────────────
    {
      name: "smm-webhook",
      script: "smm_publisher.py",
      interpreter: "python",
      args: "--webhook",
      cwd: BASE,
      env_file: `${BASE}\\.env`,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
      log_file: `${BASE}\\smm_webhook.log`,
      error_file: `${BASE}\\smm_webhook.error.log`,
      out_file: `${BASE}\\smm_webhook.out.log`,
      time: true,
    },
  ],
};
