# VPS Deployment Guide for `aikidoima.duckdns.org`

This folder contains all configuration and automation scripts needed to deploy the **Aikido-IMA** Next.js web application and the Python API on your VPS.

---

## 🚀 Quick Automated Deployment (Python)

On your VPS terminal, simply run:

```bash
cd /srv/ima/safwano
git pull origin main

# Run the automated deployment script
python deployment/setup_vps.py
```

This automated Python script will:
1. Verify Node.js, npm, and Nginx.
2. Install Python deployment tools (`supervisor`, `certbot`, `certbot-nginx`).
3. Build the Next.js production app (`npm install && npm run build`).
4. Set up `/etc/nginx/sites-available/aikidoima.duckdns.org` and reload Nginx.
5. Launch the services (Next.js on port 3000, Python API on port 8000) under PM2 or Python Supervisor.

---

## 🔒 Free HTTPS / SSL (Let's Encrypt)

Once `aikidoima.duckdns.org` points to your VPS IP address in DuckDNS:

```bash
python deployment/setup_vps.py --ssl
```

Or manually:
```bash
sudo certbot --nginx -d aikidoima.duckdns.org
```

---

## 🛠️ Manual Step-by-Step Instructions

### 1. Nginx Configuration
Copy the Nginx configuration and enable it:
```bash
sudo cp deployment/nginx/aikidoima.duckdns.org.conf /etc/nginx/sites-available/aikidoima.duckdns.org
sudo ln -s /etc/nginx/sites-available/aikidoima.duckdns.org /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default   # (removes default welcome page)
sudo nginx -t
sudo systemctl restart nginx
```

### 2. Process Management (Choose PM2 or Python Supervisor)

#### Choice A: PM2 (Node Process Manager)
```bash
sudo npm install -g pm2
pm2 start deployment/ecosystem.config.cjs
pm2 save
pm2 startup
```

#### Choice B: Python Supervisor (Pure Python Package)
If you prefer managing processes via Python packages (`pip install supervisor`):
```bash
pip install supervisor
mkdir -p /srv/ima/safwano/logs
supervisord -c deployment/supervisord.conf

# Check status
supervisorctl -c deployment/supervisord.conf status
# Restart services
supervisorctl -c deployment/supervisord.conf restart all
```

---

## 📊 Useful Commands on VPS

| Action | Command |
| :--- | :--- |
| **Check service status** | `python deployment/setup_vps.py --status` or `pm2 list` |
| **View web app logs** | `pm2 logs aikido-web` (or `tail -f logs/web-out.log`) |
| **View API server logs** | `pm2 logs fylint-api` (or `tail -f logs/api-out.log`) |
| **Restart website after git pull** | `cd main-tool/website/aikido-ima && git pull && npm run build && pm2 restart aikido-web` |
| **Test Nginx syntax** | `sudo nginx -t` |
| **Reload Nginx** | `sudo systemctl reload nginx` |
