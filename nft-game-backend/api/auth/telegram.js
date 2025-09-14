import { sql } from '@vercel/postgres';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Проверка данных от Telegram
function verifyTelegramAuth(authData) {
    if (!BOT_TOKEN) {
        throw new Error('BOT_TOKEN not configured');
    }
    
    const { hash, ...data } = authData;
    
    // Создаем строку для проверки
    const dataCheckString = Object.keys(data)
        .sort()
        .map(key => `${key}=${data[key]}`)
        .join('\n');
    
    // Создаем секретный ключ
    const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(BOT_TOKEN)
        .digest();
    
    // Проверяем хеш
    const calculatedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');
    
    return calculatedHash === hash;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { initData, user } = req.body;

        // В продакшене включить проверку
        // if (!verifyTelegramAuth(initData)) {
        //     return res.status(401).json({ error: 'Invalid Telegram auth data' });
        // }

        const telegramId = user.id;
        const username = user.username || '';
        const firstName = user.first_name || '';
        const lastName = user.last_name || '';
        const photoUrl = user.photo_url || '';

        // Проверяем существует ли пользователь
        let dbUser = await sql`
            SELECT * FROM users WHERE telegram_id = ${telegramId}
        `;

        if (dbUser.rows.length === 0) {
            // Создаем нового пользователя
            const referralCode = Math.random().toString(36).substr(2, 8).toUpperCase();
            
            const newUser = await sql`
                INSERT INTO users (telegram_id, username, first_name, last_name, photo_url, referral_code, stars, total_stars_earned)
                VALUES (${telegramId}, ${username}, ${firstName}, ${lastName}, ${photoUrl}, ${referralCode}, 100, 0)
                RETURNING *
            `;
            
            dbUser = newUser;
            
            // Обрабатываем реферала если есть
            const { referredBy } = req.body;
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
                    }
                } catch (refError) {
                    console.error('Referral error:', refError);
                }
            }
        } else {
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
                battlesCount: user_data.battles_count,
                referralCode: user_data.referral_code,
                nftCount: user_data.nft_count,
                referralsCount: user_data.referrals_count,
                createdAt: user_data.created_at
            }
        });

    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ error: 'Authentication failed', details: error.message });
    }
}