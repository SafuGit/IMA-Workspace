"""
wrappers/scrapling.py
---------------------
Stealth browser fetcher built on Patchright (the hardened Playwright fork that
StealthyFetcher uses under the hood).  Adds human-like behaviour on top:

  - Quadratic Bezier mouse paths with per-step micro-jitter
  - Realistic scroll sessions (variable speed, occasional back-scroll)
  - Random pre-/post-action pauses drawn from a half-normal distribution
  - Randomised viewport size, locale, and timezone
"""

import asyncio
import math
import random

from patchright.async_api import async_playwright, Page


# ---------------------------------------------------------------------------
# Delay helpers
# ---------------------------------------------------------------------------

def _half_normal(lo: float, hi: float) -> float:
    """Return a random float in [lo, hi] biased toward the lower end."""
    span = hi - lo
    raw = abs(random.gauss(0, span / 3))
    return lo + min(raw, span)


async def _pause(min_s: float, max_s: float) -> None:
    await asyncio.sleep(random.uniform(min_s, max_s))


# ---------------------------------------------------------------------------
# Human mouse movement
# ---------------------------------------------------------------------------

async def _move_mouse(page: Page, x1: float, y1: float, x2: float, y2: float) -> None:
    """
    Move the mouse from (x1, y1) to (x2, y2) along a quadratic Bezier curve
    with per-step Gaussian jitter to mimic hand tremor.
    """
    steps = random.randint(18, 35)

    # Control point: midpoint + random offset for natural arc
    cx = (x1 + x2) / 2 + random.uniform(-80, 80)
    cy = (y1 + y2) / 2 + random.uniform(-60, 60)

    for i in range(steps + 1):
        t = i / steps

        # Quadratic Bezier position
        bx = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t ** 2 * x2
        by = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t ** 2 * y2

        # Micro hand-tremor jitter
        jx = random.gauss(0, 1.2)
        jy = random.gauss(0, 1.2)

        await page.mouse.move(bx + jx, by + jy)

        # Ease-in-out: slower at start/end, faster in the middle
        base_speed = _half_normal(0.008, 0.025)
        eased = base_speed * (1 + 0.5 * math.sin(math.pi * t))
        await asyncio.sleep(eased)


async def _random_mouse_wander(page: Page) -> None:
    """Make 2-4 short random mouse drifts around the viewport."""
    vp = page.viewport_size or {"width": 1280, "height": 800}
    w, h = vp["width"], vp["height"]

    # Start from a random position in the middle region of the screen
    start_x = random.uniform(w * 0.2, w * 0.8)
    start_y = random.uniform(h * 0.2, h * 0.8)

    hops = random.randint(2, 4)
    for _ in range(hops):
        end_x = random.uniform(w * 0.15, w * 0.85)
        end_y = random.uniform(h * 0.15, h * 0.85)
        await _move_mouse(page, start_x, start_y, end_x, end_y)
        await _pause(0.2, 0.7)
        start_x, start_y = end_x, end_y


# ---------------------------------------------------------------------------
# Human scrolling
# ---------------------------------------------------------------------------

async def _human_scroll(page: Page) -> None:
    """
    Scroll down the page in realistic bursts.
    Occasionally pauses and scrolls back up slightly to simulate reading.
    """
    total_scroll = random.randint(400, 900)
    bursts = random.randint(3, 7)
    remaining = total_scroll

    for i in range(bursts):
        if remaining <= 0:
            break

        chunk = random.randint(60, min(250, max(60, remaining)))
        remaining -= chunk

        # Slight horizontal drift — humans rarely scroll perfectly vertically
        await page.mouse.wheel(random.uniform(-5, 5), chunk)
        await _pause(0.15, 0.5)

        # 25% chance to scroll back a little (re-reading behaviour)
        if random.random() < 0.25 and i < bursts - 1:
            back = random.randint(20, 80)
            await page.mouse.wheel(0, -back)
            await _pause(0.3, 0.8)
            remaining += back  # account for regression

    # Final reading pause after scroll session
    await _pause(0.6, 1.8)


# ---------------------------------------------------------------------------
# Core async fetch
# ---------------------------------------------------------------------------

async def _fetch_async(url: str, wait_for_idle: bool = True) -> str:
    """
    Launch a stealth Patchright browser, navigate to `url` with human-like
    behaviour, and return the fully rendered HTML.
    """
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
            ],
        )

        # Randomise fingerprint-adjacent properties per session
        viewport_w = random.randint(1280, 1920)
        viewport_h = random.randint(768, 1080)

        locale = random.choice(["en-US", "en-GB", "en-CA"])
        timezone = random.choice([
            "America/New_York", "America/Chicago",
            "America/Los_Angeles", "Europe/London",
        ])
        chrome_version = random.randint(120, 131)

        context = await browser.new_context(
            viewport={"width": viewport_w, "height": viewport_h},
            locale=locale,
            timezone_id=timezone,
            user_agent=(
                f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                f"AppleWebKit/537.36 (KHTML, like Gecko) "
                f"Chrome/{chrome_version}.0.0.0 Safari/537.36"
            ),
        )

        page = await context.new_page()

        # Pre-navigation human pause
        await _pause(0.8, 2.2)

        # Navigate
        wait_until = "networkidle" if wait_for_idle else "domcontentloaded"
        await page.goto(url, wait_until=wait_until, timeout=30_000)

        # Post-load "looking at the page" pause
        await _pause(1.2, 3.0)

        # Human mouse movement across the page
        await _random_mouse_wander(page)

        # Human scroll session
        await _human_scroll(page)

        # Final observation pause before extracting HTML
        await _pause(0.4, 1.2)

        content = await page.content()

        await context.close()
        await browser.close()

        return content


# ---------------------------------------------------------------------------
# Public sync API
# ---------------------------------------------------------------------------

def stealth_fetch(url: str, wait_for_idle: bool = True) -> str:
    """
    Fetch `url` with a stealth Patchright browser and human-like behaviour.

    Args:
        url:           The URL to fetch.
        wait_for_idle: Wait for network idle before extracting HTML.
                       Set False for fast/static pages (e.g. caption XML).

    Returns:
        The fully rendered HTML of the page as a string.
    """
    return asyncio.run(_fetch_async(url, wait_for_idle=wait_for_idle))
