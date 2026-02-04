API: Videos

Endpoints:

- GET /api?path=videos
  - Query params: q (search), category, page, limit
  - Example: /api?path=videos&q=bokep&page=1&limit=30
  - Returns: { total, page, limit, results: [ { id, title, slug, page_url, poster, categories, sources } ] }

- GET /api?path=videos/<id>
  - Example: /api?path=videos/bokep-indo-agtca-makin-cakep-susu-pulen-kencang-omek
  - Returns detail for a video entry (including sources array)

- GET /api?path=proxy&url=<encoded_url>
  - Convenience proxy to fetch and stream remote video/image resources (for CORS and Range support)
  - Example: /api?path=proxy&url=https%3A%2F%2Fexample.com%2Fvideo.mp4

Notes:
- The project includes a scheduled GitHub Action that runs `scripts/scrape_all.py` daily and updates `data/videos.json`.
- The scraper collects metadata and attempts to discover direct source URLs (.mp4/.m3u8) but does NOT download media.
- For streaming through the API, prefer returning direct source URLs in the `sources` array; the proxy endpoint is available if CORS or referer issues require server-side passthrough.
