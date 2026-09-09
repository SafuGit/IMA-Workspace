// PM2 Configuration for Aikido-IMA on VPS
// Run: pm2 start deployment/ecosystem.config.cjs

module.exports = {
  apps: [
    {
      name: "aikido-web",
      cwd: "/srv/ima/safwano/main-tool/website/aikido-ima",
      script: "npm",
      args: "start -- -p 3000",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      error_file: "/srv/ima/safwano/logs/web-error.log",
      out_file: "/srv/ima/safwano/logs/web-out.log",
      time: true,
    },
    {
      name: "fylint-api",
      cwd: "/srv/ima/safwano",
      script: "/srv/ima/safwano/.venv/bin/python",
      args: "main-tool/email_generation/api_server.py --port 8000 --host 127.0.0.1",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      error_file: "/srv/ima/safwano/logs/api-error.log",
      out_file: "/srv/ima/safwano/logs/api-out.log",
      time: true,
    },
  ],
};
