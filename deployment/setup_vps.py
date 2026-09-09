#!/usr/bin/env python3
"""
deployment/setup_vps.py
------------------------
Automated VPS Deployment Script for Aikido-IMA on aikidoima.duckdns.org.
Uses Python packages (supervisor, certbot) and standard tools.

Usage:
    python deployment/setup_vps.py
    python deployment/setup_vps.py --ssl
    python deployment/setup_vps.py --status
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


def run_cmd(cmd: str, check: bool = True, cwd: Path | None = None) -> subprocess.CompletedProcess:
    """Run shell command with streaming output."""
    print(f"\n[EXEC] {cmd}")
    res = subprocess.run(cmd, shell=True, check=check, cwd=str(cwd) if cwd else None)
    return res


def ensure_logs_dir():
    """Create logs directory if it doesn't exist."""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[OK] Logs directory ready at: {LOGS_DIR}")


def check_prerequisites():
    """Verify Node.js, npm, Python, and Nginx exist."""
    print("\n--- [1/5] Checking Prerequisites ---")
    
    # Node & NPM
    node = shutil.which("node")
    npm = shutil.which("npm")
    if not node or not npm:
        print("[!] Node.js or npm not found!")
        print("    Install Node.js 20+:")
        print("    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -")
        print("    sudo apt install -y nodejs")
        sys.exit(1)
    
    # Nginx
    nginx = shutil.which("nginx")
    if not nginx:
        print("[!] Nginx not found. Installing Nginx via apt...")
        run_cmd("sudo apt update && sudo apt install -y nginx")

    print(f"[OK] Node: {node}")
    print(f"[OK] NPM: {npm}")
    print(f"[OK] Python: {sys.executable}")


def install_python_packages():
    """Install Python packages for deployment (supervisor, certbot)."""
    print("\n--- [2/5] Installing Python Deployment Packages ---")
    pip_cmd = f"{sys.executable} -m pip install --upgrade supervisor certbot certbot-nginx"
    try:
        run_cmd(pip_cmd)
        print("[OK] Python supervisor & certbot installed successfully.")
    except subprocess.CalledProcessError:
        print("[!] Could not install into active python. Trying with --user or apt...")
        run_cmd("sudo apt update && sudo apt install -y certbot python3-certbot-nginx supervisor")


def build_nextjs():
    """Install npm dependencies and compile Next.js production build."""
    print("\n--- [3/5] Building Next.js Web App ---")
    if not WEBSITE_DIR.exists():
        print(f"[ERROR] Website directory not found at: {WEBSITE_DIR}")
        sys.exit(1)

    run_cmd("npm install", cwd=WEBSITE_DIR)
    run_cmd("npm run build", cwd=WEBSITE_DIR)
    print("[OK] Next.js production build succeeded.")


def configure_nginx():
    """Copy and enable Nginx site configuration."""
    print("\n--- [4/5] Configuring Nginx Reverse Proxy ---")
    if not NGINX_CONF_SRC.exists():
        print(f"[ERROR] Nginx config template not found at {NGINX_CONF_SRC}")
        sys.exit(1)

    print(f"Copying config to {NGINX_AVAILABLE}...")
    run_cmd(f"sudo cp {NGINX_CONF_SRC} {NGINX_AVAILABLE}")

    if not NGINX_ENABLED.exists():
        print(f"Creating symlink in /etc/nginx/sites-enabled/...")
        run_cmd(f"sudo ln -s {NGINX_AVAILABLE} {NGINX_ENABLED}")

    # Remove default site if present
    default_site = Path("/etc/nginx/sites-enabled/default")
    if default_site.exists():
        print("Disabling default Nginx site...")
        run_cmd("sudo rm /etc/nginx/sites-enabled/default")

    # Test configuration
    run_cmd("sudo nginx -t")
    run_cmd("sudo systemctl restart nginx")
    print(f"[OK] Nginx reloaded with domain: {DOMAIN}")


def start_services(use_pm2: bool = True):
    """Start web app and python API using PM2 or Python Supervisor."""
    print("\n--- [5/5] Starting Background Services ---")
    ensure_logs_dir()

    if use_pm2 and shutil.which("pm2"):
        print("[MODE] Using PM2 Process Manager")
        ecosystem_file = DEPLOYMENT_DIR / "ecosystem.config.cjs"
        run_cmd(f"pm2 start {ecosystem_file}")
        run_cmd("pm2 save")
        print("\n[OK] Services running under PM2:")
        run_cmd("pm2 list")
    else:
        print("[MODE] Using Python Supervisor (pip install supervisor)")
        supervisor_conf = DEPLOYMENT_DIR / "supervisord.conf"
        # Check if supervisord is already running
        try:
            run_cmd(f"supervisorctl -c {supervisor_conf} reread", check=False)
            run_cmd(f"supervisorctl -c {supervisor_conf} update", check=False)
            run_cmd(f"supervisorctl -c {supervisor_conf} restart all", check=False)
        except Exception:
            run_cmd(f"supervisord -c {supervisor_conf}")

        run_cmd(f"supervisorctl -c {supervisor_conf} status")


def setup_ssl():
    """Request Let's Encrypt certificate using certbot."""
    print(f"\n--- Setting up SSL Certificate for {DOMAIN} ---")
    certbot_bin = shutil.which("certbot") or "certbot"
    cmd = f"sudo {certbot_bin} --nginx -d {DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email --redirect"
    try:
        run_cmd(cmd)
        print(f"\n[SUCCESS] SSL enabled! Access your site at: https://{DOMAIN}")
    except subprocess.CalledProcessError as e:
        print(f"[!] Certbot failed: {e}")
        print(f"    Make sure aikidoima.duckdns.org points to this VPS IP before running certbot.")


def show_status():
    """Show status of Nginx and background processes."""
    print("\n=== SYSTEM STATUS ===")
    if shutil.which("pm2"):
        run_cmd("pm2 list", check=False)
    supervisor_conf = DEPLOYMENT_DIR / "supervisord.conf"
    if supervisor_conf.exists() and shutil.which("supervisorctl"):
        run_cmd(f"supervisorctl -c {supervisor_conf} status", check=False)
    run_cmd("sudo systemctl status nginx --no-pager", check=False)


def main():
    parser = argparse.ArgumentParser(description="Aikido-IMA VPS Deployment Tool")
    parser.add_argument("--ssl", action="store_true", help="Obtain Let's Encrypt SSL certificate with Certbot")
    parser.add_argument("--status", action="store_true", help="Display service and Nginx status")
    parser.add_argument("--supervisor", action="store_true", help="Force using Python Supervisor instead of PM2")
    args = parser.parse_args()

    if args.status:
        show_status()
        return

    if args.ssl:
        setup_ssl()
        return

    print("=" * 65)
    print(f"  Deploying Aikido-IMA to VPS ({DOMAIN})")
    print("=" * 65)

    check_prerequisites()
    install_python_packages()
    build_nextjs()
    configure_nginx()
    start_services(use_pm2=not args.supervisor)

    print("\n" + "=" * 65)
    print(f"  Deployment Complete!")
    print(f"  HTTP URL  : http://{DOMAIN}")
    print(f"  To enable HTTPS / SSL, run:")
    print(f"      python deployment/setup_vps.py --ssl")
    print("=" * 65 + "\n")


if __name__ == "__main__":
    main()
