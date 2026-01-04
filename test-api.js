const axios = require('axios');

async function test() {
    try {
        console.log('Testing Anime Detail...');
        const animeRes = await axios.get('http://localhost:3000/api/anime/detail?urlId=seirei-gensouki-2');
        console.log('Anime Detail Success:', JSON.stringify(animeRes.data).substring(0, 100));

        console.log('\nTesting Komik Detail...');
        const komikRes = await axios.get('http://localhost:3000/api/komik/detail?manga_id=42a015ae-107b-4634-a14c-9b9f9ecbf404');
        console.log('Komik Detail Success:', JSON.stringify(komikRes.data).substring(0, 100));
    } catch (error) {
        console.error('Test Failed:', error.response ? error.response.status : error.message);
        if (error.response) console.error('Error Data:', error.response.data);
    }
}

test();
