import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Configuration
const CONFIG = {
    baseUrl: 'https://mcdowellforcongress.com',
    category: 'bokep-indo',
    maxPages: 30,
    githubRepo: 'pharaohanjay-gif/dado-stream',
    githubBranch: 'master',
    outputPath: 'bokep-api/videos.json'  // Update ke folder bokep-api agar API bisa baca
};

interface Video {
    id: string;
    slug: string;
    title: string;
    poster: string;
    duration: string;
    url: string;
    categories: string[];
    sources: { name: string; url: string }[];
    createdAt: string;
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(url: string): Promise<string | null> {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            timeout: 15000
        });
        return response.data;
    } catch (error: any) {
        console.error(`Error fetching ${url}:`, error.message);
        return null;
    }
}

async function scrapeVideos(): Promise<Video[]> {
    const videos: Video[] = [];
    let page = 1;

    console.log(`Scraping category: ${CONFIG.category}`);

    while (page <= CONFIG.maxPages) {
        const url = page === 1 
            ? `${CONFIG.baseUrl}/category/${CONFIG.category}/`
            : `${CONFIG.baseUrl}/category/${CONFIG.category}/page/${page}/`;
        
        console.log(`Page ${page}: ${url}`);
        
        const html = await fetchPage(url);
        if (!html) break;

        const $ = cheerio.load(html);
        let foundOnPage = 0;

        // Parse video items - try multiple selectors
        $('article, .video-item, .post, .entry').each((i, el) => {
            const $el = $(el);
            const link = $el.find('a').first().attr('href');
            const title = $el.find('.title, h2, h3, .entry-title').first().text().trim() || 
                         $el.find('a').first().attr('title') || 
                         $el.find('img').attr('alt') || '';
            const poster = $el.find('img').first().attr('src') || 
                          $el.find('img').first().attr('data-src') || '';
            const duration = $el.find('.duration, .time').first().text().trim() || '';

            if (link && title && title.length > 3) {
                const slug = link.split('/').filter(Boolean).pop() || `video-${Date.now()}-${i}`;
                videos.push({
                    id: `${Date.now()}-${videos.length}`,
                    slug,
                    title: title.slice(0, 200),
                    poster,
                    duration,
                    url: link.startsWith('http') ? link : `${CONFIG.baseUrl}${link}`,
                    categories: [CONFIG.category],
                    sources: [{
                        name: 'Server 1',
                        url: link.startsWith('http') ? link : `${CONFIG.baseUrl}${link}`
                    }],
                    createdAt: new Date().toISOString()
                });
                foundOnPage++;
            }
        });

        console.log(`Found ${foundOnPage} videos on page ${page}`);

        if (foundOnPage === 0) break;
        
        page++;
        await sleep(500);
    }

    return videos;
}

async function updateGitHub(newVideos: Video[]): Promise<{ success: boolean; totalVideos: number; newCount: number }> {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    
    if (!GITHUB_TOKEN) {
        console.error('GITHUB_TOKEN not set!');
        return { success: false, totalVideos: 0, newCount: 0 };
    }

    try {
        const apiBase = `https://api.github.com/repos/${CONFIG.githubRepo}/contents/${CONFIG.outputPath}`;
        
        // Get current file and its SHA
        let sha: string | undefined;
        let existingVideos: Video[] = [];
        let fetchError = false;
        
        try {
            const getResponse = await axios.get(apiBase, {
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                },
                timeout: 30000  // 30 second timeout
            });
            sha = getResponse.data.sha;
            
            // Decode existing content
            const existingContent = Buffer.from(getResponse.data.content, 'base64').toString('utf-8');
            existingVideos = JSON.parse(existingContent);
            console.log(`Existing videos: ${existingVideos.length}`);
        } catch (e: any) {
            if (e.response?.status === 404) {
                console.log('No existing file, will create new');
            } else {
                // Other errors (timeout, network, etc) - DO NOT OVERWRITE!
                console.error('Error fetching existing videos:', e.message);
                fetchError = true;
            }
        }

        // SAFETY: If we failed to fetch existing and there should be a file, abort!
        if (fetchError) {
            console.error('ABORT: Cannot fetch existing videos, refusing to overwrite');
            return { success: false, totalVideos: 0, newCount: 0 };
        }

        // SAFETY: If we have new videos but existing is suspiciously empty, abort!
        if (newVideos.length > 0 && existingVideos.length === 0 && sha) {
            console.error('ABORT: Existing file has SHA but parsed as empty - possible error');
            return { success: false, totalVideos: 0, newCount: 0 };
        }

        // Merge: keep unique by slug, new videos at the beginning
        const existingSlugs = new Set(existingVideos.map(v => v.slug));
        let newCount = 0;
        
        // Find truly new videos (not in existing)
        const trulyNewVideos: Video[] = [];
        for (const video of newVideos) {
            if (!existingSlugs.has(video.slug)) {
                trulyNewVideos.push(video);
                newCount++;
            }
        }
        
        // Merge: new videos FIRST, then existing (for chronological order)
        const mergedVideos = [...trulyNewVideos, ...existingVideos];
        console.log(`Merged total: ${mergedVideos.length}, New videos: ${newCount}`);

        // Prepare content
        const content = Buffer.from(JSON.stringify(mergedVideos, null, 2)).toString('base64');
        
        // Update or create file
        await axios.put(apiBase, {
            message: `chore(scrape): +${newCount} new videos (total: ${mergedVideos.length})`,
            content,
            sha,
            branch: CONFIG.githubBranch
        }, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        console.log('GitHub updated successfully!');
        return { success: true, totalVideos: mergedVideos.length, newCount };
    } catch (error: any) {
        console.error('GitHub update failed:', error.response?.data?.message || error.message);
        return { success: false, totalVideos: 0, newCount: 0 };
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Verify cron secret or allow manual trigger
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        // Allow without auth for testing, but log it
        console.log('Warning: No auth header, proceeding anyway...');
    }

    console.log('🚀 Cron scraper started:', new Date().toISOString());

    try {
        // Scrape videos
        const videos = await scrapeVideos();
        console.log(`Total videos scraped: ${videos.length}`);

        if (videos.length === 0) {
            return res.status(200).json({ 
                success: false, 
                message: 'No videos found',
                timestamp: new Date().toISOString()
            });
        }

        // Remove duplicates from scraped
        const uniqueVideos = Array.from(
            new Map(videos.map(v => [v.slug, v])).values()
        );

        // Update GitHub (merge with existing)
        const result = await updateGitHub(uniqueVideos);

        return res.status(200).json({
            success: result.success,
            videosScraped: uniqueVideos.length,
            newVideosAdded: result.newCount,
            totalVideos: result.totalVideos,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('Cron error:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
}
