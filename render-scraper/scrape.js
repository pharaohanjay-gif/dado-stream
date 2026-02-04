/**
 * Bokep Auto Scraper for Render.com Cron Job
 * Scrapes videos from mcdowellforcongress.com and updates GitHub repo
 */

const axios = require('axios');
const cheerio = require('cheerio');

// Configuration
const CONFIG = {
    baseUrl: 'https://mcdowellforcongress.com',
    categories: ['bokep-indo'],
    maxPages: 50,
    githubRepo: 'pharaohanjay-gif/dado-stream',
    githubBranch: 'master',
    outputPath: 'data/videos.json'
};

// GitHub API token from environment
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            timeout: 30000
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching ${url}:`, error.message);
        return null;
    }
}

async function scrapeCategory(category) {
    const videos = [];
    let page = 1;
    let hasMore = true;

    console.log(`\n📂 Scraping category: ${category}`);

    while (hasMore && page <= CONFIG.maxPages) {
        const url = page === 1 
            ? `${CONFIG.baseUrl}/category/${category}/`
            : `${CONFIG.baseUrl}/category/${category}/page/${page}/`;
        
        console.log(`  Page ${page}: ${url}`);
        
        const html = await fetchPage(url);
        if (!html) {
            hasMore = false;
            break;
        }

        const $ = cheerio.load(html);
        const items = $('.videos-list article, .video-item, article.post, .entry');
        
        if (items.length === 0) {
            // Try alternate selectors
            const altItems = $('a[href*="/video/"], a[href*="/watch/"]');
            if (altItems.length === 0) {
                hasMore = false;
                break;
            }
        }

        let foundOnPage = 0;

        // Parse video items
        items.each((i, el) => {
            const $el = $(el);
            const link = $el.find('a').first().attr('href') || $el.attr('href');
            const title = $el.find('.title, h2, h3, .entry-title').first().text().trim() || 
                         $el.find('a').first().attr('title') || 
                         $el.find('img').attr('alt') || '';
            const poster = $el.find('img').first().attr('src') || 
                          $el.find('img').first().attr('data-src') || '';
            const duration = $el.find('.duration, .time').first().text().trim() || '';

            if (link && title) {
                const slug = link.split('/').filter(Boolean).pop() || `video-${Date.now()}-${i}`;
                videos.push({
                    id: `${Date.now()}-${videos.length}`,
                    slug: slug,
                    title: title,
                    poster: poster,
                    duration: duration,
                    url: link.startsWith('http') ? link : `${CONFIG.baseUrl}${link}`,
                    categories: [category],
                    sources: [{
                        name: 'Server 1',
                        url: link.startsWith('http') ? link : `${CONFIG.baseUrl}${link}`
                    }],
                    createdAt: new Date().toISOString()
                });
                foundOnPage++;
            }
        });

        console.log(`    Found ${foundOnPage} videos`);

        if (foundOnPage === 0) {
            hasMore = false;
        } else {
            page++;
            await sleep(1500); // Rate limiting
        }
    }

    return videos;
}

async function scrapeVideoDetail(video) {
    try {
        const html = await fetchPage(video.url);
        if (!html) return video;

        const $ = cheerio.load(html);

        // Try to find video sources
        const sources = [];
        
        // Look for iframe sources
        $('iframe').each((i, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src');
            if (src && (src.includes('embed') || src.includes('player') || src.includes('video'))) {
                sources.push({
                    name: `Server ${sources.length + 1}`,
                    url: src.startsWith('http') ? src : `https:${src}`
                });
            }
        });

        // Look for video tags
        $('video source, video').each((i, el) => {
            const src = $(el).attr('src');
            if (src) {
                sources.push({
                    name: `Direct ${sources.length + 1}`,
                    url: src.startsWith('http') ? src : `${CONFIG.baseUrl}${src}`
                });
            }
        });

        // Look for player scripts with video URLs
        const scriptContent = $('script').text();
        const urlMatches = scriptContent.match(/https?:\/\/[^\s"']+\.(mp4|m3u8|webm)/gi);
        if (urlMatches) {
            urlMatches.forEach((url, i) => {
                if (!sources.find(s => s.url === url)) {
                    sources.push({
                        name: `Stream ${sources.length + 1}`,
                        url: url
                    });
                }
            });
        }

        // Update description
        const description = $('.description, .entry-content, .video-description').first().text().trim().slice(0, 500);

        if (sources.length > 0) {
            video.sources = sources;
        }
        if (description) {
            video.description = description;
        }

        return video;
    } catch (error) {
        console.error(`Error scraping detail for ${video.slug}:`, error.message);
        return video;
    }
}

async function updateGitHub(videos) {
    if (!GITHUB_TOKEN) {
        console.error('❌ GITHUB_TOKEN not set! Cannot update GitHub.');
        console.log('📝 Saving locally instead...');
        console.log(JSON.stringify(videos.slice(0, 5), null, 2));
        return false;
    }

    try {
        const apiBase = `https://api.github.com/repos/${CONFIG.githubRepo}/contents/${CONFIG.outputPath}`;
        
        // Get current file (to get SHA for update)
        let sha = null;
        try {
            const getResponse = await axios.get(apiBase, {
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            sha = getResponse.data.sha;
            console.log('📄 Found existing file, will update');
        } catch (e) {
            console.log('📄 File does not exist, will create');
        }

        // Prepare content
        const content = Buffer.from(JSON.stringify(videos, null, 2)).toString('base64');
        
        // Update or create file
        const response = await axios.put(apiBase, {
            message: `chore(scrape): auto-update videos.json - ${videos.length} videos`,
            content: content,
            sha: sha,
            branch: CONFIG.githubBranch
        }, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        console.log(`✅ GitHub updated successfully!`);
        console.log(`   Commit: ${response.data.commit.sha.slice(0, 7)}`);
        return true;
    } catch (error) {
        console.error('❌ GitHub update failed:', error.response?.data?.message || error.message);
        return false;
    }
}

async function main() {
    console.log('🚀 Bokep Auto Scraper Started');
    console.log(`📅 ${new Date().toISOString()}`);
    console.log('='.repeat(50));

    let allVideos = [];

    // Scrape all categories
    for (const category of CONFIG.categories) {
        const videos = await scrapeCategory(category);
        allVideos = allVideos.concat(videos);
    }

    console.log(`\n📊 Total videos found: ${allVideos.length}`);

    if (allVideos.length === 0) {
        console.log('⚠️ No videos found, skipping update');
        return;
    }

    // Scrape details for first 20 videos (to get sources)
    console.log('\n🔍 Scraping video details...');
    for (let i = 0; i < Math.min(20, allVideos.length); i++) {
        process.stdout.write(`\r  Progress: ${i + 1}/${Math.min(20, allVideos.length)}`);
        allVideos[i] = await scrapeVideoDetail(allVideos[i]);
        await sleep(1000);
    }
    console.log('\n');

    // Remove duplicates by slug
    const uniqueVideos = [];
    const seenSlugs = new Set();
    for (const video of allVideos) {
        if (!seenSlugs.has(video.slug)) {
            seenSlugs.add(video.slug);
            uniqueVideos.push(video);
        }
    }

    console.log(`📊 Unique videos: ${uniqueVideos.length}`);

    // Update GitHub
    await updateGitHub(uniqueVideos);

    console.log('\n✨ Scraper completed!');
}

// Run
main().catch(console.error);
