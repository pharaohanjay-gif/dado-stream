const https = require('https');

// Test kagefiles embed - cari video URL langsung
const testUrls = [
    { name: 'Kagefiles embed', url: 'https://kagefiles.com/embed/qSB8fqNNDLQGHMN' },
];

async function testUrl(name, url) {
    return new Promise((resolve) => {
        const req = https.get(url, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://kagefiles.com/'
            },
            timeout: 15000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`[${name}] Status:`, res.statusCode);
                
                // Find storjshare or other CDN URLs
                const storjMatch = data.match(/https:\/\/link\.storjshare\.io[^"'\s<>]+\.mp4[^"'\s<>]*/gi);
                console.log('Storjshare MP4:', storjMatch ? storjMatch[0] : 'not found');
                
                // Find any mp4 URLs
                const mp4 = data.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/gi);
                if (mp4 && mp4.length > 0) {
                    console.log('\nAll MP4 URLs found:');
                    mp4.forEach((u, i) => console.log(`  ${i+1}. ${u}`));
                }
                
                resolve();
            });
        });
        
        req.on('error', e => {
            console.error(`[${name}] Error:`, e.message);
            resolve();
        });
    });
}

(async () => {
    for (const t of testUrls) {
        await testUrl(t.name, t.url);
    }
})();
