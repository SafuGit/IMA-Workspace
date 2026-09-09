#!/usr/bin/env python3
"""
deployment/setup_vps.py
------------------------
Automated VPS Deployment Script for Aikido-IMA on aikidoima.duckdns.org.
Supports both Sudo and Non-Sudo (user-space) environments.

Usage:
    python deployment/setup_vps.py            # Standard auto-detection (with or without sudo)
    python deployment/setup_vps.py --no-sudo  # Force user-space mode
    python deployment/setup_vps.py --tunnel   # Run Cloudflare Tunnel for instant free HTTPS
    python deployment/setup_vps.py --ssl      # Obtain Let's Encrypt SSL (requires sudo)
    python deployment/setup_vps.py --status   # Check status of running services
"""

import os
import sys
import shutil
import argparse
import subprocess
from pathlib import Path

# Paths
ROOT_DIR = Path(__file__).resolve().parent.parent
DEPLOYMENT_DIR = ROOT_DIR / "deployment"
WEBSITE_DIR = ROOT_DIR / "main-tool" / "website" / "aikido-ima"
NGINX_CONF_SRC = DEPLOYMENT_DIR / "nginx" / "aikidoima.duckdns.org.conf"
NGINX_AVAILABLE = Path("/etc/nginx/sites-available/aikidoima.duckdns.org")
NGINX_ENABLED = Path("/etc/nginx/sites-enabled/aikidoima.duckdns.org")
LOGS_DIR = ROOT_DIR / "logs"

DOMAIN = "aikidoima.duckdns.org"


def can_sudo() -> bool:
    """Check if the current user can execute sudo commands."""
    try:
        res = subprocess.run(["sudo", "-n", "true"], capture_output=True)
        return res.returncode == 0
    except Exception:
        return False


def run_cmd(cmd: str, check: bool = True, cwd: Path | None = None) -> subprocess.CompletedProcess:
    """Run shell command with streaming output."""
    print(f"\n[EXEC] {cmd}")
    res = subprocess.run(cmd, shell=True, check=check, cwd=str(cwd) if cwd else None)
    return res


def ensure_logs_dir():
    """Create logs directory if it doesn't exist."""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[OK] Logs directory ready at: {LOGS_DIR}")


def check_prerequisites(has_sudo: bool):
    """Verify Node.js, npm, and Python exist."""
    print("\n--- [1/5] Checking Prerequisites ---")

    node = shutil.which("node")
    npm = shutil.which("npm")
    if not node or not npm:
        print("[!] Node.js or npm not found in PATH!")
        print("    If Node is installed in your home directory, ensure it is in PATH.")
        print("    Otherwise, install Node.js 20+:")
        if has_sudo:
            print("    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -")
            print("    sudo apt install -y nodejs")
        else:
            print("    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash")
            print("    source ~/.bashrc && nvm install 20")
        sys.exit(1)

    print(f"[OK] Node: {node}")
    print(f"[OK] NPM: {npm}")
    print(f"[OK] Python: {sys.executable}")
    print(f"[OK] Privileges: {'Sudo Available' if has_sudo else 'User-Space (No Sudo)'}")


def install_python_packages(has_sudo: bool):
    """Install Python packages for deployment (supervisor)."""
    print("\n--- [2/5] Installing Python Deployment Packages ---")
    pip_cmd = f"{sys.executable} -m pip install --upgrade supervisor"
    if has_sudo:
        pip_cmd += " certbot certbot-nginx"

    try:
        run_cmd(pip_cmd)
        print("[OK] Python deployment packages installed.")
    except subprocess.CalledProcessError:
        print("[!] Trying pip install with --user...")
        run_cmd(f"{sys.executable} -m pip install --user --upgrade supervisor")


def build_nextjs():
    """Install npm dependencies and compile Next.js production build."""
    print("\n--- [3/5] Building Next.js Web App ---")
    if not WEBSITE_DIR.exists():
        print(f"[ERROR] Website directory not found at: {WEBSITE_DIR}")
        sys.exit(1)

    run_cmd("npm install", cwd=WEBSITE_DIR)
    run_cmd("npm run build", cwd=WEBSITE_DIR)
    print("[OK] Next.js production build succeeded.")


def configure_nginx(has_sudo: bool):
    """Copy and enable Nginx site configuration if sudo is available."""
    print("\n--- [4/5] Configuring Nginx Reverse Proxy ---")
    if not has_sudo:
        print("[INFO] No sudo permissions detected. Skipping system Nginx setup.")
        print(f"[INFO] Your app runs directly on port 3000: http://{DOMAIN}:3000")
        print(f"[TIP]  To route through port 80/443, give your VPS administrator this file:")
        print(f"       {NGINX_CONF_SRC}")
        return

    if not NGINX_CONF_SRC.exists():
        print(f"[ERROR] Nginx config template not found at {NGINX_CONF_SRC}")
        return

    print(f"Copying config to {NGINX_AVAILABLE}...")
    run_cmd(f"sudo cp {NGINX_CONF_SRC} {NGINX_AVAILABLE}")

    if not NGINX_ENABLED.exists():
        print(f"Creating symlink in /etc/nginx/sites-enabled/...")
        run_cmd(f"sudo ln -s {NGINX_AVAILABLE} {NGINX_ENABLED}")

    default_site = Path("/etc/nginx/sites-enabled/default")
    if default_site.exists():
        print("Disabling default Nginx site...")
        run_cmd("sudo rm /etc/nginx/sites-enabled/default")

    run_cmd("sudo nginx -t")
    run_cmd("sudo systemctl restart nginx")
    print(f"[OK] Nginx reloaded with domain: {DOMAIN}")


def start_services(use_pm2: bool = True):
    """Start web app and python API using PM2 or Python Supervisor (works without sudo)."""
    print("\n--- [5/5] Starting Background Services ---")
    ensure_logs_dir()

    # Try PM2 (or npx pm2 which works without sudo)
    pm2_cmd = shutil.which("pm2") or (shutil.which("npx") and "npx pm2")
    if use_pm2 and pm2_cmd:
        print(f"[MODE] Using {pm2_cmd} Process Manager (runs in user-space)")
        ecosystem_file = DEPLOYMENT_DIR / "ecosystem.config.cjs"
        run_cmd(f"{pm2_cmd} start {ecosystem_file}")
        run_cmd(f"{pm2_cmd} save")
        print("\n[OK] Services running:")
        run_cmd(f"{pm2_cmd} list")
    else:
        print("[MODE] Using Python Supervisor (pip install supervisor)")
        supervisor_conf = DEPLOYMENT_DIR / "supervisord.conf"
        try:
            run_cmd(f"supervisorctl -c {supervisor_conf} reread", check=False)
            run_cmd(f"supervisorctl -c {supervisor_conf} update", check=False)
            run_cmd(f"supervisorctl -c {supervisor_conf} restart all", check=False)
        except Exception:
            run_cmd(f"supervisord -c {supervisor_conf}")

        run_cmd(f"supervisorctl -c {supervisor_conf} status")


def run_cloudflare_tunnel():
    """Run Cloudflare Tunnel (cloudflared) for instant free HTTPS without sudo."""
    print("\n--- Starting Cloudflare Tunnel for Instant HTTPS ---")
    cloudflared = shutil.which("cloudflared")
    user_bin = Path.home() / "bin" / "cloudflared"

    if not cloudflared and user_bin.exists():
        cloudflared = str(user_bin)

    if not cloudflared:
        print("[*] Downloading cloudflared binary into ~/bin/ (no sudo needed)...")
        user_bin.parent.mkdir(parents=True, exist_ok=True)
        download_cmd = f"curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o {user_bin} && chmod +x {user_bin}"
        run_cmd(download_cmd)
        cloudflared = str(user_bin)

    print(f"\n[OK] Launching Cloudflare HTTPS tunnel to port 3000...")
    print("     You will receive a free public HTTPS URL below:")
    print("=" * 65)
    run_cmd(f"{cloudflared} tunnel --url http://localhost:3000")


def setup_ssl():
    """Request Let's Encrypt certificate using certbot (requires sudo)."""
    if not can_sudo():
        print("[!] Let's Encrypt / Certbot requires sudo to write to /etc/letsencrypt and port 80/443.")
        print("    Alternative: Run Cloudflare Tunnel for instant free HTTPS without sudo:")
        print("        python deployment/setup_vps.py --tunnel")
        return

    print(f"\n--- Setting up SSL Certificate for {DOMAIN} ---")
    certbot_bin = shutil.which("certbot") or "certbot"
    cmd = f"sudo {certbot_bin} --nginx -d {DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email --redirect"
    try:
        run_cmd(cmd)
        print(f"\n[SUCCESS] SSL enabled! Access your site at: https://{DOMAIN}")
    except subprocess.CalledProcessError as e:
        print(f"[!] Certbot failed: {e}")


def show_status():
    """Show status of running processes."""
    print("\n=== PROCESS STATUS ===")
    pm2_cmd = shutil.which("pm2") or (shutil.which("npx") and "npx pm2")
    if pm2_cmd:
        run_cmd(f"{pm2_cmd} list", check=False)
    supervisor_conf = DEPLOYMENT_DIR / "supervisord.conf"
    if supervisor_conf.exists() and shutil.which("supervisorctl"):
        run_cmd(f"supervisorctl -c {supervisor_conf} status", check=False)


def main():
    parser = argparse.ArgumentParser(description="Aikido-IMA VPS Deployment Tool")
    parser.add_argument("--ssl", action="store_true", help="Obtain Let's Encrypt SSL certificate (requires sudo)")
    parser.add_argument("--tunnel", action="store_true", help="Launch Cloudflare Tunnel for free HTTPS without sudo")
    parser.add_argument("--status", action="store_true", help="Display service status")
    parser.add_argument("--no-sudo", action="store_true", help="Force user-space mode without sudo")
    parser.add_argument("--supervisor", action="store_true", help="Use Python Supervisor instead of PM2")
    args = parser.parse_args()

    if args.status:
        show_status()
        return

    if args.tunnel:
        run_cloudflare_tunnel()
        return

    if args.ssl:
        setup_ssl()
        return

    has_sudo = can_sudo() and not args.no_sudo

    print("=" * 65)
    print(f"  Deploying Aikido-IMA ({DOMAIN})")
    print(f"  Mode: {'Sudo (Full Nginx)' if has_sudo else 'User-Space (No Sudo)'}")
    print("=" * 65)

    check_prerequisites(has_sudo)
    install_python_packages(has_sudo)
    build_nextjs()
    configure_nginx(has_sudo)
    start_services(use_pm2=not args.supervisor)

    print("\n" + "=" * 65)
    print("  Deployment Complete!")
    if has_sudo:
        print(f"  URL: http://{DOMAIN}")
        print(f"  To enable HTTPS, run: python deployment/setup_vps.py --ssl")
    else:
        print(f"  Direct URL : http://{DOMAIN}:3000")
        print(f"  Local URL  : http://localhost:3000")
        print(f"  Instant Free HTTPS:")
        print(f"      python deployment/setup_vps.py --tunnel")
    print("=" * 65 + "\n")


if __name__ == "__main__":
    main()
