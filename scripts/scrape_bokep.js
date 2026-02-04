#!/usr/bin/env node
/*
Lightweight Node scraper for the 'bokep-indo' category on mcdowellforcongress.com
- Uses global fetch and simple HTML parsing to find posts and external links
- For each external link, scans HTML for .mp4 and .m3u8 occurrences (no downloading)
- Writes results to data/videos.json

Run:
  node scripts/scrape_bokep.js
*/

const fs = require('fs');
const { JSDOM } = require('jsdom');

const START_URL = 'https://mcdowellforcongress.com/category/bokep-indo/';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
};

async function fetchText(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, timeout: 15000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    console.warn('[fetch] failed', url, e.message);
    return null;
  }
}

// Only find actual bokep post links (not category pages)
function findBokepPostLinks(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const anchors = Array.from(doc.querySelectorAll('a[href]'));
  const links = new Set();
  anchors.forEach(a => {
    let href = a.href;
    if (!href) return;
    // Must be a bokep-indo post (contains 'bokep-indo' in URL path, NOT a category page)
    if (href.includes('/bokep-indo-') && !href.includes('/category/')) {
      links.add(href.split('#')[0].split('?')[0]);
    }
  });
  return Array.from(links);
}

function extractPostData(html, pageUrl) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const titleEl = doc.querySelector('h1');
  const title = titleEl ? titleEl.textContent.trim() : '';
  
  // Try multiple methods to get the REAL poster, not the logo
  let poster = null;
  
  // Method 1: Try JSON-LD schema data (most reliable for unique posters)
  const jsonLdScript = doc.querySelector('script.rank-math-schema, script[type="application/ld+json"]');
  if (jsonLdScript) {
    try {
      const jsonLd = JSON.parse(jsonLdScript.textContent);
      // Look for primaryImageOfPage in the graph
      if (jsonLd['@graph']) {
        for (const item of jsonLd['@graph']) {
          if (item['@type'] === 'ImageObject' && item.url && item.url.includes('dbsync') && item.url.includes('Poster')) {
            poster = item.url;
            break;
          }
        }
      }
    } catch (e) {
      // JSON parse error, continue with other methods
    }
  }
  
  // Method 2: Look for post-specific poster images in content
  if (!poster) {
    const imgs = Array.from(doc.querySelectorAll('img'));
    for (const img of imgs) {
      const src = img.src || img.getAttribute('data-src') || '';
      // Look for dbsync poster images (unique per post)
      if (src.includes('dbsync') && src.includes('Poster')) {
        poster = src;
        break;
      }
    }
  }
  
  // Method 3: Try og:image but ONLY if it's a unique poster (not the logo)
  if (!poster) {
    const og = doc.querySelector('meta[property="og:image"]');
    if (og && og.content && !og.content.includes('L-K-2-1')) {
      poster = og.content;
    }
  }
  
  // Method 4: Look for any image in the content that's not a logo
  if (!poster) {
    const contentImgs = doc.querySelectorAll('.entry-content img, .gmr-movie-data img, article img');
    for (const img of contentImgs) {
      const src = img.src || '';
      if (src && !src.includes('L-K-2-1') && !src.includes('88cdn') && !src.includes('histats')) {
        poster = src;
        break;
      }
    }
  }
  
  const descEl = doc.querySelector('.entry-content');
  const description = descEl ? descEl.textContent.trim() : '';
  const cats = Array.from(doc.querySelectorAll('a[rel="category tag"]')).map(a=>a.textContent.trim());
  const links = Array.from(doc.querySelectorAll('a[href]')).map(a => a.href).filter(h=>h && h.startsWith('http'));
  return { title, pageUrl, poster, description, categories: cats, links };
}

async function scanExternalForMedia(url) {
  const found = [];
  // Skip youtube links - they won't have direct mp4/m3u8
  if (url.includes('youtube.com') || url.includes('youtu.be')) return found;
  
  const html = await fetchText(url);
  if (!html) return found;
  // quick find .mp4 and .m3u8
  const regex = /(https?:\/\/[^"'\s>]+\.(?:mp4|m3u8)(?:\?[^"'\s>]*)?)/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    found.push(m[1]);
  }
  // also check for direct download links like 'download' or '/download/' links returning mp4
  const dom = new JSDOM(html);
  const anchors = Array.from(dom.window.document.querySelectorAll('a[href]'));
  for (const a of anchors) {
    const href = a.href;
    if (!href) continue;
    // Only follow imaxstreams download links (they often have direct mp4)
    if (href.includes('imaxstreams') && (href.includes('download') || /_n$/.test(href))) {
      try {
        const h2 = await fetchText(href.startsWith('http')?href:new URL(href, url).href);
        if (h2) {
          let mm;
          while ((mm = regex.exec(h2)) !== null) {
            found.push(mm[1]);
          }
        }
      } catch (e) {
        // ignore
      }
    }
  }
  // dedupe
  return Array.from(new Set(found));
}

(async ()=>{
  console.log('[INFO] Starting bokep-indo only scrape');
  const shtml = await fetchText(START_URL);
  if (!shtml) {
    console.error('Failed to fetch category page');
    process.exit(1);
  }
  let posts = findBokepPostLinks(shtml);
  console.log('[INFO] Found bokep-indo posts:', posts.length);

  // Scrape ALL pages until no more posts found
  let pg = 2;
  while (true) {
    const pgHtml = await fetchText(START_URL + 'page/' + pg + '/');
    if (!pgHtml) {
      console.log(`[INFO] Page ${pg}: no content, stopping`);
      break;
    }
    const morePosts = findBokepPostLinks(pgHtml);
    if (morePosts.length === 0) {
      console.log(`[INFO] Page ${pg}: no posts found, stopping`);
      break;
    }
    const newPosts = morePosts.filter(p => !posts.includes(p));
    posts = posts.concat(newPosts);
    console.log(`[INFO] Page ${pg}: found ${morePosts.length} posts (${newPosts.length} new), total now ${posts.length}`);
    pg++;
    // Small delay to be nice to server
    await new Promise(r => setTimeout(r, 200));
  }

  // Dedupe
  posts = [...new Set(posts)];
  console.log('[INFO] Total unique bokep-indo posts:', posts.length);

  const results = [];
  for (const p of posts) {
    try {
      console.log('[INFO] Processing', p);
      const ph = await fetchText(p);
      if (!ph) continue;
      const pdata = extractPostData(ph, p);
      
      // Just collect external download links directly (no slow scanning)
      const sources = pdata.links
        .filter(l => l.includes('kagefiles') || l.includes('imaxstreams'))
        .map(l => ({ type: 'external', url: l }));
      
      const entry = {
        id: p.replace(/https?:\/\//,'').replace(/[\/\?#].*/,'').replace(/[^a-z0-9\-]/gi,'-').toLowerCase(),
        title: pdata.title,
        slug: pdata.title?pdata.title.replace(/[^a-z0-9]+/gi,'-').toLowerCase():p.split('/').filter(Boolean).pop(),
        page_url: p,
        categories: pdata.categories.length?pdata.categories:['Bokep Indo'],
        poster: pdata.poster,
        description: pdata.description.slice(0, 500),
        sources: sources,
        extracted_at: Math.floor(Date.now()/1000)
      };
      results.push(entry);
      console.log('  -> saved', sources.length, 'sources');
    } catch (e) {
      console.error('[ERROR] processing post failed', p, e.message);
    }
  }

  const outPath = './data/videos.json';
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log('[DONE] Wrote', results.length, 'entries to', outPath);
})();
