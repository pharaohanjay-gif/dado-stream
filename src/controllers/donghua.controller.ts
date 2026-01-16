import type { Request, Response } from 'express';

const AnichinScraper = require('@zhadev/anichin').default;
const scraper = new AnichinScraper({
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000
});

/**
 * Get ongoing donghua list
 */
export async function getOngoingDonghua(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const result = await scraper.ongoing(page);
    
    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to fetch ongoing donghua',
        message: result.message
      });
    }
    
    return res.json({
      success: true,
      data: result.data.lists || [],
      page,
      creator: result.creator
    });
  } catch (error: any) {
    console.error('[Donghua] Error fetching ongoing:', error);
    return res.status(500).json({ error: 'Server error', message: error.message });
  }
}

/**
 * Get completed donghua list
 */
export async function getCompletedDonghua(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const result = await scraper.completed(page);
    
    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to fetch completed donghua',
        message: result.message
      });
    }
    
    return res.json({
      success: true,
      data: result.data.lists || [],
      page,
      creator: result.creator
    });
  } catch (error: any) {
    console.error('[Donghua] Error fetching completed:', error);
    return res.status(500).json({ error: 'Server error', message: error.message });
  }
}

/**
 * Search donghua
 */
export async function searchDonghua(req: Request, res: Response) {
  try {
    const query = req.query.q as string;
    const page = parseInt(req.query.page as string) || 1;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    
    const result = await scraper.search(query, page);
    
    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to search donghua',
        message: result.message
      });
    }
    
    return res.json({
      success: true,
      query,
      data: result.data.search.items || [],
      page,
      creator: result.creator
    });
  } catch (error: any) {
    console.error('[Donghua] Error searching:', error);
    return res.status(500).json({ error: 'Server error', message: error.message });
  }
}

/**
 * Get donghua series detail
 */
export async function getDonghuaDetail(req: Request, res: Response) {
  try {
    const { slug } = req.params;
    
    if (!slug) {
      return res.status(400).json({ error: 'Slug parameter is required' });
    }
    
    const result = await scraper.series(slug);
    
    if (!result.success) {
      return res.status(404).json({
        error: 'Donghua not found',
        message: result.message
      });
    }
    
    return res.json({
      success: true,
      data: result.data.detail,
      creator: result.creator
    });
  } catch (error: any) {
    console.error('[Donghua] Error fetching detail:', error);
    return res.status(500).json({ error: 'Server error', message: error.message });
  }
}

/**
 * Get donghua episode watch data (video servers)
 */
export async function watchDonghuaEpisode(req: Request, res: Response) {
  try {
    const { slug, episode } = req.params;
    
    if (!slug || !episode) {
      return res.status(400).json({ error: 'Slug and episode parameters are required' });
    }
    
    const result = await scraper.watch(slug, episode);
    
    if (!result.success) {
      return res.status(404).json({
        error: 'Episode not found',
        message: result.message
      });
    }
    
    // Decode base64 server URLs to actual iframe URLs
    const watch = result.data.watch;
    if (watch.servers && watch.servers.length > 0) {
      watch.servers = watch.servers.map((server: any) => {
        try {
          // Decode base64 URL
          const decodedUrl = Buffer.from(server.server_url, 'base64').toString('utf-8');
          return {
            ...server,
            server_url: decodedUrl,
            server_url_encoded: server.server_url
          };
        } catch {
          return server;
        }
      });
    }
    
    return res.json({
      success: true,
      data: watch,
      creator: result.creator
    });
  } catch (error: any) {
    console.error('[Donghua] Error fetching episode:', error);
    return res.status(500).json({ error: 'Server error', message: error.message });
  }
}

/**
 * Get donghua home/trending
 */
export async function getDonghuaHome(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const result = await scraper.home(page);
    
    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to fetch donghua home',
        message: result.message
      });
    }
    
    return res.json({
      success: true,
      data: result.data.home,
      page,
      creator: result.creator
    });
  } catch (error: any) {
    console.error('[Donghua] Error fetching home:', error);
    return res.status(500).json({ error: 'Server error', message: error.message });
  }
}

/**
 * Get donghua schedule
 */
export async function getDonghuaSchedule(req: Request, res: Response) {
  try {
    const day = req.query.day as string;
    const result = await scraper.schedule(day);
    
    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to fetch schedule',
        message: result.message
      });
    }
    
    return res.json({
      success: true,
      data: result.data.schedule,
      creator: result.creator
    });
  } catch (error: any) {
    console.error('[Donghua] Error fetching schedule:', error);
    return res.status(500).json({ error: 'Server error', message: error.message });
  }
}
