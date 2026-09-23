"""
email_generation/api_server.py
--------------------------------
Standalone HTTP REST API Server for Fylint Email Generation.
Implements Method 1 (API calling) with a fixed request and response schema.

Can be run locally or on a remote VPS:
    python main-tool/email_generation/api_server.py
    python main-tool/email_generation/api_server.py --port 8000 --host 0.0.0.0

Endpoints:
    POST /api/generate-email   Generate hooks and email drafts for a YouTube video
    POST /generate-email       Alias for /api/generate-email
    GET  /health               Healthcheck endpoint
    GET  /                     Service status and API documentation
"""

import os
import sys
import json
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from typing import Any

# Ensure main-tool root is on sys.path
_MAIN_TOOL = Path(__file__).resolve().parent.parent
if str(_MAIN_TOOL) not in sys.path:
    sys.path.insert(0, str(_MAIN_TOOL))

from email_generation.generate_email import generate_email_pipeline


class EmailGenerationApiHandler(BaseHTTPRequestHandler):
    """HTTP Request Handler implementing the fixed Email Generation API contract."""

    def _set_headers(self, status_code: int = 200, content_type: str = "application/json"):
        self.send_response(status_code)
        self.send_header("Content-Type", content_type)
        # Enable CORS for browser access
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")
        self.end_headers()

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self._set_headers(200)

    def do_GET(self):
        """Healthcheck and status information."""
        if self.path in ("/health", "/api/health"):
            payload = {
                "status": "healthy",
                "service": "fylint-email-generation-api",
                "version": "1.0.0",
                "ready": True,
            }
            self._set_headers(200)
            self.wfile.write(json.dumps(payload).encode("utf-8"))
            return

        if self.path in ("/api/followups/check", "/followups/check"):
            try:
                from email_generation.followup_cron import check_and_generate_followups
                results = check_and_generate_followups()
                self._set_headers(200)
                self.wfile.write(json.dumps({"success": True, "results": results}).encode("utf-8"))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        if self.path in ("/api/emails/cron", "/api/cron/generate", "/api/cron/outreach"):
            try:
                from email_generation.cron_worker import run_cron_batch
                batch_res = run_cron_batch(batch_size=20)
                self._set_headers(200)
                self.wfile.write(json.dumps(batch_res).encode("utf-8"))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        # Default info page
        payload = {
            "service": "Fylint Email Generation API",
            "version": "1.0.0",
            "endpoints": {
                "POST /api/generate-email": {
                    "description": "Generate personalized hooks and 3 outreach email drafts",
                    "input": {
                        "video_url": "https://www.youtube.com/watch?v=...",
                        "channel_id": "optional string",
                        "channel_name": "optional string",
                        "model": "gemini-3.1-pro-high (default)",
                    },
                    "output": {
                        "success": True,
                        "video_id": "string",
                        "title": "string",
                        "hooks": "list of hook objects with timestamps & links",
                        "subject_lines": "primary and alternative subject lines",
                        "drafts": "option_a, option_b, option_c email drafts",
                        "raw_output": "full markdown output",
                    }
                },
                "GET /health": "Healthcheck endpoint"
            }
        }
        self._set_headers(200)
        self.wfile.write(json.dumps(payload, indent=2).encode("utf-8"))

    def do_POST(self):
        """Generate email for a target video."""
        if self.path in ("/api/followups/check", "/followups/check"):
            try:
                from email_generation.followup_cron import check_and_generate_followups
                results = check_and_generate_followups()
                self._set_headers(200)
                self.wfile.write(json.dumps({"success": True, "results": results}).encode("utf-8"))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        if self.path in ("/api/emails/cron", "/api/cron/generate", "/api/cron/outreach"):
            try:
                from email_generation.cron_worker import run_cron_batch
                batch_res = run_cron_batch(batch_size=20)
                self._set_headers(200)
                self.wfile.write(json.dumps(batch_res).encode("utf-8"))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        if self.path not in ("/api/generate-email", "/generate-email"):
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": f"Endpoint not found: {self.path}"}).encode("utf-8"))
            return

        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Empty request body. JSON payload required."}).encode("utf-8"))
                return

            body_bytes = self.rfile.read(content_length)
            data = json.loads(body_bytes.decode("utf-8"))

            video_url = data.get("video_url") or data.get("url") or data.get("videoId") or data.get("video_id")
            if not video_url:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Missing required field: 'video_url'"}).encode("utf-8"))
                return

            model = data.get("model", "gemini-3.1-pro-high")
            mode = data.get("mode", "full")
            channel_id = data.get("channel_id")
            channel_name = data.get("channel_name")

            print(f"\n[API Server] Received generation request for: {video_url} (model: {model}, mode: {mode})")

            # Run unified email pipeline
            result = generate_email_pipeline(video_url, model=model, mode=mode)
            result["mode"] = mode

            # Supplement channel details if provided in request
            if channel_id and not result.get("channel_id"):
                result["channel_id"] = channel_id
            if channel_name and not result.get("channel_name"):
                result["channel_name"] = channel_name

            self._set_headers(200)
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))

        except Exception as e:
            print(f"[API Server] Error processing request: {e}")
            self._set_headers(500)
            self.wfile.write(json.dumps({
                "success": False,
                "error": str(e),
            }).encode("utf-8"))

    def log_message(self, format: str, *args: Any):
        """Clean log format for server requests."""
        sys.stderr.write(f"[HTTP] {self.address_string()} - {format % args}\n")


class ReusableHTTPServer(HTTPServer):
    allow_reuse_address = True


import threading
import time
from datetime import datetime, timezone, timedelta


def _start_background_cron_scheduler():
    """Start background daemon thread that triggers the daily batch dynamically based on DB settings."""
    bst_zone = timezone(timedelta(hours=6))

    def scheduler_thread():
        last_run_date = None
        last_reported_time = None
        print("[Cron Scheduler] Background scheduler initialized with dynamic DB config.", flush=True)
        while True:
            try:
                from email_generation.cron_worker import get_cron_schedule_config, run_cron_batch
                target_time_str, batch_size = get_cron_schedule_config()
                parts = target_time_str.split(":")
                target_hour = int(parts[0])
                target_minute = int(parts[1]) if len(parts) > 1 else 0

                if last_reported_time != target_time_str:
                    print(f"[Cron Scheduler] Schedule updated from DB: {target_hour:02d}:{target_minute:02d} BST (UTC+6) | Batch: {batch_size} creators", flush=True)
                    last_reported_time = target_time_str

                now_bst = datetime.now(bst_zone)
                today_str = now_bst.strftime("%Y-%m-%d")
                if now_bst.hour == target_hour and now_bst.minute == target_minute and last_run_date != today_str:
                    print(f"\n[Cron Scheduler] >>> TRIGGERED at {now_bst.strftime('%Y-%m-%d %H:%M:%S')} BST (Target: {target_time_str})! Running daily batch of {batch_size} approved creators... <<<", flush=True)
                    run_cron_batch(batch_size=batch_size)
                    last_run_date = today_str
            except Exception as e:
                print(f"[Cron Scheduler Error] {e}", file=sys.stderr, flush=True)
            time.sleep(15)

    t = threading.Thread(target=scheduler_thread, daemon=True)
    t.start()


def run_server(host: str = "0.0.0.0", port: int = 8000):
    """Run the standalone HTTP server."""
    server_address = (host, port)
    httpd = ReusableHTTPServer(server_address, EmailGenerationApiHandler)
    print("=" * 60, flush=True)
    print("  Fylint Email Generation API Server", flush=True)
    print(f"  Listening on: http://{host}:{port}", flush=True)
    print(f"  Endpoint    : http://{host}:{port}/api/generate-email", flush=True)
    print(f"  Cron API    : http://{host}:{port}/api/emails/cron", flush=True)
    print(f"  Healthcheck : http://{host}:{port}/health", flush=True)
    print("=" * 60, flush=True)

    # Launch daily dynamic cron scheduler
    _start_background_cron_scheduler()

    try:
        httpd.serve_forever()
    except (KeyboardInterrupt, SystemExit):
        print("\n[INFO] Shutdown signal received. Closing server...", flush=True)
    except Exception as e:
        print(f"\n[ERROR] Server encountered error: {e}", file=sys.stderr, flush=True)
    finally:
        httpd.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fylint Email Generation REST API Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host address to bind (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    args = parser.parse_args()

    run_server(host=args.host, port=args.port)
