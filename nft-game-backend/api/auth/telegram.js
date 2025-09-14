import { sql } from '@vercel/postgres';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function validateTelegramInitData(initData) {
    if (!initData) {
        throw new Error('Missing initData');
    }

    // Parse the initData string into key-value pairs
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    // Sort params alphabetically by key
    const sortedParams = Array.from(params.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    // Create HMAC-SHA256 hash using bot token as key
    const secretKey = crypto.createHmac('sha256', BOT_TOKEN).update('WebAppData').digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(sortedParams).digest('hex');

    if (calculatedHash !== hash) {
        throw new Error('Invalid initData hash');
    }

    // If valid, parse and return the user object from initData
    const userStr = params.get('user');
    if (!userStr) {
        throw new Error('Missing user in initData');
    }
    return JSON.parse(userStr);
}

export default async function handler(req, res) {
    // CORS headers (unchanged)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('Received auth request:', req.body);
        
        const { initData, referredBy } = req.body;  // Note: We'll validate and extract user from initData

        if (!initData) {
            return res.status(400).json({ error: 'Missing initData' });
        }

        // Validate initData and get trusted user
        const user = validateTelegramInitData(initData);

        // Now proceed with the rest (user is trusted)
        if (!user || !user.id) {
            return res.status(400).json({ error: 'Invalid user data' });
        }

        const telegramId = user.id;
        const username = user.username || '';
        const firstName = user.first_name || 'Игрок';
        const lastName = user.last_name || '';
        const photoUrl = user.photo_url || '';

        console.log('Processing user:', { telegramId, username, firstName });

        // The rest of your code remains the same from here: check DB user, create/update, handle referral, generate JWT, etc.
        // ...

    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ 
            error: 'Authentication failed', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
