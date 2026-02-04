# Bokep Auto Scraper - Render.com Cron Job

Auto-scraper untuk update video bokep. Berjalan di Render.com secara GRATIS.

## Setup di Render.com

1. **Connect repo ke Render:**
   - Buka https://render.com/dashboard
   - Klik "New" → "Cron Job"
   - Connect GitHub repo `pharaohanjay-gif/dado-stream`
   - Pilih branch `master`

2. **Configure Cron Job:**
   - Name: `bokep-auto-scraper`
   - Root Directory: `render-scraper`
   - Runtime: `Node`
   - Build Command: `npm install`
   - Command: `npm start`
   - Schedule: `0 2 * * *` (setiap hari jam 02:00 UTC / 09:00 WIB)

3. **Add Environment Variable:**
   - Key: `GITHUB_TOKEN`
   - Value: (personal access token dari GitHub)

4. **Create & Deploy!**

## Generate GitHub Token

1. Buka: https://github.com/settings/tokens/new
2. Note: `render-scraper`
3. Expiration: No expiration
4. Scopes: ✅ `repo` (full control)
5. Generate token
6. Copy dan paste ke Render environment variable
