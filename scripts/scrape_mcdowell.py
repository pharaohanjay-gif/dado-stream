#!/usr/bin/env python3
"""
Scrape video sources from mcdowellforcongress.com posts and output JSON that can produce MP4s.

Requirements:
- Python 3.8+
- pip install requests beautifulsoup4 yt-dlp playwright
- python -m playwright install
- ffmpeg (for assembling HLS if needed)

Notes:
- The script tries yt-dlp first for each external link; if that fails to find a direct video source it falls back to Playwright and captures network requests for .m3u8/.mp4.
- If content is DRM-protected or encrypted, the script will report it and will not attempt circumvention.

Usage examples:
  python scripts/scrape_mcdowell.py --start-url https://mcdowellforcongress.com/ --out videos.json --limit 10
  python scripts/scrape_mcdowell.py --start-url https://mcdowellforcongress.com/ --out videos.json --download --output-dir downloads
"""

import argparse
import json
import os
import re
import sys
import time
from typing import List, Dict, Optional

import requests
from bs4 import BeautifulSoup

# yt-dlp API
try:
    import yt_dlp as ytdlp
except Exception:
    ytdlp = None

# Playwright fallback to capture network requests
try:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
except Exception:
    sync_playwright = None


HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
}


def fetch_html(url: str) -> Optional[str]:
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        r.raise_for_status()
        return r.text
    except Exception as e:
        print(f"[WARN] Failed to fetch {url}: {e}")
        return None


def find_post_urls(start_html: str, base_url: str) -> List[str]:
    soup = BeautifulSoup(start_html, "html.parser")
    urls = set()
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        # Keep internal post links (same domain) and likely contains year or hyphens
        if href.startswith(base_url) and re.search(r"/[-a-z0-9]+/", href):
            urls.add(href.split('#')[0])
        # some links may be relative
        if href.startswith('/'):
            full = base_url.rstrip('/') + href
            if re.search(r"/[-a-z0-9]+/", full):
                urls.add(full.split('#')[0])
    return list(urls)


def extract_links_from_post(html: str) -> Dict[str, List[str]]:
    soup = BeautifulSoup(html, "html.parser")
    title_el = soup.find("h1")
    title = title_el.get_text(strip=True) if title_el else "(no title)"
    links = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        links.append(href)
    return {"title": title, "links": links}


def ytdlp_extract(url: str) -> Optional[Dict]:
    if not ytdlp:
        return None
    try:
        ydl_opts = {"quiet": True}
        with ytdlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return info
    except Exception as e:
        # print(f"[DEBUG] yt-dlp failed for {url}: {e}")
        return None


def playwright_capture(url: str, timeout_s: int = 12) -> List[str]:
    if not sync_playwright:
        return []
    found = set()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(user_agent=HEADERS["User-Agent"])
            page = context.new_page()

            def on_request(req):
                u = req.url
                if ".m3u8" in u or u.endswith('.mp4') or re.search(r"\.ts(\?|$)", u):
                    found.add(u)

            page.on("request", on_request)
            try:
                page.goto(url, timeout=timeout_s * 1000)
                # wait a bit for network to settle
                time.sleep(2)
            except PWTimeout:
                pass
            except Exception:
                pass

            # also scan HTML for obvious URLs
            content = page.content()
            for m in re.findall(r"(https?://[^"]+\.(?:m3u8|mp4)(?:\?[^"]*)?)", content):
                found.add(m)

            context.close()
            browser.close()
    except Exception as e:
        print(f"[WARN] Playwright capture failed for {url}: {e}")
    return list(found)


def choose_best_format_from_ytdlp_info(info: Dict) -> Optional[Dict]:
    # Prefer mp4 or hls
    if not info:
        return None
    # If info has url directly (single file)
    if info.get('url') and info.get('ext'):
        return {"url": info['url'], "ext": info.get('ext')}
    formats = info.get('formats') or []
    # sort by quality descending
    for ext in ('mp4', 'm4a', 'webm', 'ts'):
        cand = [f for f in formats if f.get('ext') == ext and f.get('url')]
        if cand:
            # pick highest resolution/bitrate
            cand_sorted = sorted(cand, key=lambda f: (f.get('height') or 0, f.get('tbr') or 0), reverse=True)
            best = cand_sorted[0]
            return {"url": best.get('url'), "ext": best.get('ext'), "format_id": best.get('format_id')}
    # fallback to first format with url
    for f in formats:
        if f.get('url'):
            return {"url": f.get('url'), "ext": f.get('ext', 'bin'), "format_id": f.get('format_id')}
    return None


def assemble_entry(title: str, page_url: str, external_link: str, extracted: List[Dict]) -> Dict:
    best = None
    for e in extracted:
        if e.get('ext') in ('mp4', 'm4a'):
            best = e
            break
        if e.get('url') and '.m3u8' in e.get('url'):
            best = best or e
    entry = {
        "title": title,
        "page_url": page_url,
        "external_link": external_link,
        "extracted_sources": extracted,
    }
    if best:
        entry["best_source"] = best
        # Provide recommended download commands
        if '.m3u8' in best.get('url'):
            entry["download_command"] = f"ffmpeg -y -i \"{best['url']}\" -c copy \"{sanitize_filename(title)}.mp4\""
            entry["alt_download"] = f"yt-dlp -o \"{sanitize_filename(title)}.%(ext)s\" \"{best['url']}\""
        else:
            entry["download_command"] = f"yt-dlp -o \"{sanitize_filename(title)}.%(ext)s\" \"{best['url']}\""
    else:
        entry["note"] = "No direct source found; Playwright capture suggested for JS-based hosts or the content may be protected."
    return entry


def sanitize_filename(s: str) -> str:
    return re.sub(r"[^0-9A-Za-z._ -]", "_", s).strip(" _-")[:200]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-url", required=True, help="Start page (homepage or category)")
    parser.add_argument("--out", required=True, help="Output JSON file")
    parser.add_argument("--limit", type=int, default=20, help="Max number of posts to process")
    parser.add_argument("--download", action="store_true", help="Also download the found best sources")
    parser.add_argument("--output-dir", default="downloads", help="Directory to save downloads")
    args = parser.parse_args()

    base = re.match(r"(https?://[^/]+)", args.start_url)
    base_url = base.group(1) if base else args.start_url

    start_html = fetch_html(args.start_url)
    if not start_html:
        print("Failed to fetch start page.")
        sys.exit(1)

    posts = find_post_urls(start_html, base_url)
    print(f"Found {len(posts)} candidate posts; processing up to {args.limit}.")
    results = []

    if not os.path.exists(args.output_dir) and args.download:
        os.makedirs(args.output_dir, exist_ok=True)

    processed = 0
    for p in posts:
        if processed >= args.limit:
            break
        print(f"[INFO] Processing post: {p}")
        post_html = fetch_html(p)
        if not post_html:
            continue
        data = extract_links_from_post(post_html)
        title = data['title']
        links = data['links']

        # Candidate external links: look for "download" or typical host domains
        candidates = []
        for l in links:
            l_lower = l.lower()
            if any(d in l_lower for d in ['download', 'watch', 'stream', 'server']) or re.search(r'\.mp4$|\.m3u8', l_lower):
                candidates.append(l)

        # expand if none found: use all external links
        if not candidates:
            candidates = [l for l in links if l.startswith('http') and not l.startswith(base_url)]

        # Deduplicate
        seen = set()
        final_candidates = []
        for c in candidates:
            if c not in seen:
                final_candidates.append(c)
                seen.add(c)

        # For each candidate, try yt-dlp then Playwright
        extracted_sources = []
        for c in final_candidates:
            print(f"  -> trying candidate: {c}")
            info = ytdlp_extract(c) if ytdlp else None
            if info:
                best = choose_best_format_from_ytdlp_info(info)
                if best:
                    extracted_sources.append({"method": "yt-dlp", **best})
                else:
                    # maybe info has url
                    if info.get('url'):
                        extracted_sources.append({"method": "yt-dlp", "url": info.get('url'), "ext": info.get('ext', 'bin')})
            else:
                # fallback to Playwright capture
                if sync_playwright:
                    nets = playwright_capture(c)
                    for n in nets:
                        ext = 'm3u8' if '.m3u8' in n else ('mp4' if n.endswith('.mp4') else 'ts')
                        extracted_sources.append({"method": "playwright-capture", "url": n, "ext": ext})
                else:
                    print("    [WARN] yt-dlp unavailable and Playwright not installed; skipping JS capture.")

        entry = assemble_entry(title, p, final_candidates[0] if final_candidates else '', extracted_sources)
        results.append(entry)

        # optionally download
        if args.download and entry.get('best_source'):
            best = entry['best_source']
            out_path = os.path.join(args.output_dir, sanitize_filename(title))
            if '.m3u8' in best['url']:
                cmd = f"ffmpeg -y -i \"{best['url']}\" -c copy \"{out_path}.mp4\""
                print(f"    [DOWNLOAD] Running: {cmd}")
                os.system(cmd)
            else:
                # use yt-dlp to download
                cmd = f"yt-dlp -o \"{out_path}.%(ext)s\" \"{best['url']}\""
                print(f"    [DOWNLOAD] Running: {cmd}")
                os.system(cmd)

        processed += 1

    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"Finished. Results saved to {args.out}.")


if __name__ == '__main__':
    main()
