// PM2 Configuration for Aikido-IMA on VPS
// Run: pm2 start deployment/ecosystem.config.cjs

module.exports = {
  apps: [
    {
      name: "aikido-web",
      cwd: "/srv/ima/safwano/main-tool/website/aikido-ima",
      script: "npm",
      args: "run start -- -p 3000 -H 0.0.0.0",
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "0.0.0.0",
      },
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
      script: "main-tool/email_generation/api_server.py",
      interpreter: "/srv/ima/safwano/.venv/bin/python",
      args: "--port 8000 --host 0.0.0.0",
      exec_mode: "fork",
      env: {
        PYTHONUNBUFFERED: "1",
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      error_file: "/srv/ima/safwano/logs/api-error.log",
      out_file: "/srv/ima/safwano/logs/api-out.log",
      time: true,
    },
  ],
};
