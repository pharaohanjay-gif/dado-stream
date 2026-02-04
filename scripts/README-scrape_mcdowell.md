**Scraper for mcdowellforcongress.com** 🔧

Summary:
- This repository includes `scripts/scrape_mcdowell.py` which crawls the provided start URL, finds post pages, follows download/watch links to external hosts and tries to extract final video sources (mp4, m3u8)
- It prefers `yt-dlp` extraction and falls back to Playwright network-capture for JS-heavy hosts.

Quick setup (Windows):
1. Install Python 3.8+ and add to PATH
2. Install dependencies:
   - pip install -U requests beautifulsoup4 yt-dlp playwright
   - python -m playwright install
3. Install ffmpeg and add to PATH (if you plan to assemble HLS -> MP4)

Basic usage:
- Find up to N posts and save JSON: 
  python scripts/scrape_mcdowell.py --start-url https://mcdowellforcongress.com/ --out videos.json --limit 10

- Also download found best sources to `downloads/`:
  python scripts/scrape_mcdowell.py --start-url https://mcdowellforcongress.com/ --out videos.json --limit 10 --download --output-dir downloads

What the output JSON contains (per item):
- title: page title
- page_url: post page
- external_link: first external candidate used
- extracted_sources: list of discovered sources (method, url, ext)
- best_source: chosen source (if any)
- download_command: suggested command to produce an MP4 (ffmpeg or yt-dlp)

Notes & legality 🔒:
- You said you have permission — the script assumes explicit permission to access and download the content. Do NOT use this to infringe third-party copyrights.
- If a host uses DRM or encrypted streams, the script will detect a lack of direct sources and report it; I will not assist with DRM circumvention.

If you want, I can:
- Add Windows PowerShell wrapper to make running and downloading easier ✅
- Make the script multi-threaded and resumable for large collections ✅
- Run it here for a sample of N=3 and upload the resulting `videos.json` (you must confirm) ✅

Automation & Deployment:
- A GitHub Action (`.github/workflows/scrape-and-commit.yml`) is included that runs the scraper daily and commits `data/videos.json` when changes are detected.
- To deploy to Vercel: push this repo to GitHub and connect it to Vercel (Vercel will auto-deploy on push). The API endpoints are in `api/index.ts` and include:
  - `/api?path=videos` (list/search)
  - `/api?path=videos/<id>` (detail)
  - `/api?path=proxy&url=<encoded>` (direct proxy/passthrough for player CORS)

Security & limits:
- The proxy has a max upstream fetch size and respects Range headers, but serverless platforms may limit streaming performance. If you plan heavy streaming, consider a dedicated proxy/edge worker.

