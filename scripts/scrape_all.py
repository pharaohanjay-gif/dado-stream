#!/usr/bin/env python3
"""
Comprehensive scraper for mcdowellforcongress.com that crawls video categories, extracts metadata and streaming sources, and writes `data/videos.json`.

- Uses requests + BeautifulSoup to crawl category pages and post pages.
- Uses yt-dlp (if available) and Playwright fallback to detect direct sources (.mp4, .m3u8) without downloading content.
- Outputs structured JSON with fields: id, title, slug, page_url, categories, poster, description, sources, extracted_at

Run locally:
  pip install -U requests beautifulsoup4 yt-dlp playwright
  python -m playwright install
  python scripts/scrape_all.py --start-url https://mcdowellforcongress.com/ --out data/videos.json

"""

import argparse
import json
import os
import re
import time
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

try:
    import yt_dlp as ytdlp
except Exception:
    ytdlp = None

try:
    from playwright.sync_api import sync_playwright
except Exception:
    sync_playwright = None

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
}

CATEGORY_SELECTOR = 'a[href*="/category/"]'
POST_LINK_RE = re.compile(r"https?://[\w\.-]*?/[-\w]+/")


def fetch(url, timeout=15):
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        return r.text
    except Exception as e:
        print(f"[WARN] Failed to fetch {url}: {e}")
        return None


def find_categories(start_html, base_url):
    soup = BeautifulSoup(start_html, 'html.parser')
    cats = {}
    for a in soup.select(CATEGORY_SELECTOR):
        href = a.get('href')
        if href:
            full = href if href.startswith('http') else urljoin(base_url, href)
            text = a.get_text(strip=True)
            if full not in cats:
                cats[full] = text
    return cats


def find_post_links_from_category(html, base_url, limit_per_cat=500):
    soup = BeautifulSoup(html, 'html.parser')
    links = set()
    for a in soup.find_all('a', href=True):
        href = a['href']
        if href.startswith('/'):
            href = urljoin(base_url, href)
        if POST_LINK_RE.match(href):
            links.add(href.split('#')[0])
    return list(links)[:limit_per_cat]


def extract_post_data(html, page_url):
    soup = BeautifulSoup(html, 'html.parser')
    title_el = soup.find('h1')
    title = title_el.get_text(strip=True) if title_el else ''
    # poster
    poster = None
    og_img = soup.find('meta', property='og:image')
    if og_img and og_img.get('content'):
        poster = og_img['content']
    else:
        img = soup.find('img')
        if img and img.get('src'):
            poster = img['src']
    # description
    desc_el = soup.find('div', class_='entry-content')
    description = desc_el.get_text(separator=' ', strip=True) if desc_el else ''
    # categories
    cats = [a.get_text(strip=True) for a in soup.select('a[rel="category tag"]')]
    # external links
    links = []
    for a in soup.find_all('a', href=True):
        href = a['href']
        if href.startswith('/'):
            href = urljoin(page_url, href)
        if href.startswith('http'):
            links.append(href)
    return {
        'title': title,
        'page_url': page_url,
        'poster': poster,
        'description': description,
        'categories': cats,
        'links': links
    }


def ytdlp_info(url):
    if not ytdlp:
        return None
    try:
        with ytdlp.YoutubeDL({'quiet': True}) as ydl:
            return ydl.extract_info(url, download=False)
    except Exception:
        return None


def playwright_capture(url, timeout=12):
    if not sync_playwright:
        return []
    found = set()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(user_agent=HEADERS['User-Agent'])
            page = context.new_page()

            def on_request(req):
                u = req.url
                if '.m3u8' in u or u.endswith('.mp4') or re.search(r'\.ts(\?|$)', u):
                    found.add(u)

            page.on('request', on_request)
            page.goto(url, timeout=timeout * 1000)
            time.sleep(1.5)
            # also scan HTML
            content = page.content()
            for m in re.findall(r"(https?://[^"]+\.(?:m3u8|mp4)(?:\?[^"]*)?)", content):
                found.add(m)
            context.close()
            browser.close()
    except Exception as e:
        print(f"[WARN] Playwright capture failed for {url}: {e}")
    return list(found)


def choose_sources_from_candidates(candidates):
    results = []
    seen = set()
    for c in candidates:
        if c in seen:
            continue
        seen.add(c)
        info = ytdlp_info(c) if ytdlp else None
        if info:
            # prefer formats
            formats = info.get('formats') or []
            for f in formats:
                url = f.get('url')
                if url and (url.endswith('.mp4') or '.m3u8' in url):
                    results.append({'method': 'yt-dlp', 'url': url, 'ext': f.get('ext')})
                    break
            if results:
                continue
            if info.get('url'):
                results.append({'method': 'yt-dlp', 'url': info.get('url'), 'ext': info.get('ext')})
                continue
        # fallback to playwright
        nets = playwright_capture(c)
        for n in nets:
            ext = 'm3u8' if '.m3u8' in n else ('mp4' if n.endswith('.mp4') else 'ts')
            results.append({'method': 'playwright', 'url': n, 'ext': ext})
    return results


def slug_from_url(url):
    p = urlparse(url)
    return p.path.strip('/').replace('/', '-')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--start-url', required=True)
    parser.add_argument('--out', default='data/videos.json')
    parser.add_argument('--limit-per-cat', type=int, default=500)
    parser.add_argument('--categories', nargs='*', help='Optional list of category slugs to limit')
    args = parser.parse_args()

    base = re.match(r'(https?://[^/]+)', args.start_url)
    base_url = base.group(1) if base else args.start_url

    html = fetch(args.start_url)
    if not html:
        print('Failed to fetch start url')
        return

    categories = find_categories(html, base_url)
    print(f'[INFO] Found {len(categories)} categories')

    # filter categories if provided
    if args.categories:
        categories = {k: v for k, v in categories.items() if any(s in k for s in args.categories)}

    all_videos = []
    seen_pages = set()

    for cat_url, cat_name in categories.items():
        print(f'[INFO] Scanning category: {cat_name} -> {cat_url}')
        cat_html = fetch(cat_url)
        if not cat_html:
            continue
        post_links = find_post_links_from_category(cat_html, base_url, limit_per_cat=args.limit_per_cat)
        print(f'  -> Found {len(post_links)} posts in category')
        for p in post_links:
            if p in seen_pages:
                continue
            seen_pages.add(p)
            post_html = fetch(p)
            if not post_html:
                continue
            pdata = extract_post_data(post_html, p)
            # candidates: links that look like 'download, watch, server' or external
            candidates = [l for l in pdata['links'] if any(x in l.lower() for x in ['download', 'watch', 'stream', 'server']) or re.search(r'\.m3u8|\.mp4', l, re.I)]
            # if none, use external hosts
            if not candidates:
                candidates = [l for l in pdata['links'] if l.startswith('http') and not l.startswith(args.start_url)]

            sources = choose_sources_from_candidates(candidates)

            video_entry = {
                'id': slug_from_url(p),
                'title': pdata['title'],
                'slug': slug_from_url(p),
                'page_url': p,
                'categories': pdata['categories'] or [cat_name],
                'poster': pdata['poster'],
                'description': pdata['description'],
                'extracted_at': int(time.time()),
                'candidates': candidates,
                'sources': sources
            }
            all_videos.append(video_entry)

    # write to file
    out_dir = os.path.dirname(args.out)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(all_videos, f, ensure_ascii=False, indent=2)

    print(f'[DONE] Wrote {len(all_videos)} entries to {args.out}')


if __name__ == '__main__':
    main()
