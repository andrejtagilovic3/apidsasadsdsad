import { sql } from '@vercel/postgres';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export default async function handler(req, res) {
    // CORS headers
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
        
        const { initData, user, referredBy } = req.body;

        // Проверяем что у нас есть пользователь
        if (!user || !user.id) {
            return res.status(400).json({ error: 'Invalid user data' });
        }

        const telegramId = user.id;
        const username = user.username || '';
        const firstName = user.first_name || 'Игрок';
        const lastName = user.last_name || '';
        const photoUrl = user.photo_url || '';

        console.log('Processing user:', { telegramId, username, firstName });

        // Проверяем существует ли пользователь
        let dbUser = await sql`
            SELECT * FROM users WHERE telegram_id = ${telegramId}
        `;

        if (dbUser.rows.length === 0) {
            console.log('Creating new user...');
            
            // Создаем нового пользователя
            const referralCode = Math.random().toString(36).substr(2, 8).toUpperCase();
            
            const newUser = await sql`
                INSERT INTO users (telegram_id, username, first_name, last_name, photo_url, referral_code, stars, total_stars_earned)
                VALUES (${telegramId}, ${username}, ${firstName}, ${lastName}, ${photoUrl}, ${referralCode}, 100, 0)
                RETURNING *
            `;
            
            dbUser = newUser;
            
            // Обрабатываем реферала если есть
            if (referredBy) {
                try {
                    const referrer = await sql`
                        SELECT id FROM users WHERE referral_code = ${referredBy}
                    `;
                    
                    if (referrer.rows.length > 0) {
                        const referrerId = referrer.rows[0].id;
                        const newUserId = newUser.rows[0].id;
                        
                        // Добавляем реферальную связь
                        await sql`
                            INSERT INTO referrals (referrer_id, referred_id, stars_earned)
                            VALUES (${referrerId}, ${newUserId}, 1)
                        `;
                        
                        // Добавляем звезду рефереру
                        await sql`
                            UPDATE users 
                            SET stars = stars + 1, total_stars_earned = total_stars_earned + 1
                            WHERE id = ${referrerId}
                        `;
                        
                        console.log('Referral bonus awarded');
                    }
                } catch (refError) {
                    console.error('Referral error:', refError);
                }
            }
        } else {
            console.log('Updating existing user...');
            
            // Обновляем данные существующего пользователя
            await sql`
                UPDATE users 
                SET username = ${username}, first_name = ${firstName}, 
                    last_name = ${lastName}, photo_url = ${photoUrl}, 
                    updated_at = CURRENT_TIMESTAMP
                WHERE telegram_id = ${telegramId}
            `;
        }

        // Получаем актуальные данные пользователя
        const userData = await sql`
            SELECT u.*, 
                   (SELECT COUNT(*) FROM user_nfts WHERE user_id = u.id) as nft_count,
                   (SELECT COUNT(*) FROM referrals WHERE referrer_id = u.id) as referrals_count
            FROM users u 
            WHERE telegram_id = ${telegramId}
        `;

        const user_data = userData.rows[0];

        // Создаем JWT токен
        const token = jwt.sign(
            { 
                userId: user_data.id, 
                telegramId: user_data.telegram_id 
            },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        console.log('Authentication successful for user:', user_data.id);

        res.status(200).json({
            success: true,
            token,
            user: {
                id: user_data.id,
                telegramId: user_data.telegram_id,
                username: user_data.username,
                firstName: user_data.first_name,
                lastName: user_data.last_name,
                photoUrl: user_data.photo_url,
                stars: user_data.stars,
                totalStarsEarned: user_data.total_stars_earned,
                battlesCount: user_data.battles_count || 0,
                referralCode: user_data.referral_code,
                nftCount: parseInt(user_data.nft_count) || 0,
                referralsCount: parseInt(user_data.referrals_count) || 0,
                createdAt: user_data.created_at
            }
        });

    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ 
            error: 'Authentication failed', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
