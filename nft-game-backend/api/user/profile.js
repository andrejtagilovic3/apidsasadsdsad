import { sql } from '@vercel/postgres';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware для проверки токена
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
}

export default async function handler(req, res) {
    // Аутентификация для всех методов
    authenticateToken(req, res, async () => {
        
        if (req.method === 'GET') {
            try {
                // Получаем полные данные пользователя
                const userData = await sql`
                    SELECT u.*, 
                           (SELECT COUNT(*) FROM user_nfts WHERE user_id = u.id) as nft_count,
                           (SELECT COUNT(*) FROM referrals WHERE referrer_id = u.id) as referrals_count,
                           (SELECT COUNT(*) FROM battle_history WHERE user_id = u.id) as battles_count
                    FROM users u 
                    WHERE id = ${req.user.userId}
                `;

                if (userData.rows.length === 0) {
                    return res.status(404).json({ error: 'User not found' });
                }

                const user = userData.rows[0];

                res.status(200).json({
                    success: true,
                    user: {
                        id: user.id,
                        telegramId: user.telegram_id,
                        username: user.username,
                        firstName: user.first_name,
                        lastName: user.last_name,
                        photoUrl: user.photo_url,
                        stars: user.stars,
                        totalStarsEarned: user.total_stars_earned,
                        battlesCount: user.battles_count,
                        referralCode: user.referral_code,
                        nftCount: user.nft_count,
                        referralsCount: user.referrals_count,
                        createdAt: user.created_at
                    }
                });

            } catch (error) {
                console.error('Profile error:', error);
                res.status(500).json({ error: 'Failed to get user profile' });
            }
        }
        
        else if (req.method === 'PUT') {
            try {
                const { stars, totalStarsEarned, battlesCount } = req.body;

                // Обновляем данные пользователя
                const updatedUser = await sql`
                    UPDATE users 
                    SET stars = COALESCE(${stars}, stars),
                        total_stars_earned = COALESCE(${totalStarsEarned}, total_stars_earned),
                        battles_count = COALESCE(${battlesCount}, battles_count),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ${req.user.userId}
                    RETURNING *
                `;

                if (updatedUser.rows.length === 0) {
                    return res.status(404).json({ error: 'User not found' });
                }

                const user = updatedUser.rows[0];

                res.status(200).json({
                    success: true,
                    user: {
                        id: user.id,
                        stars: user.stars,
                        totalStarsEarned: user.total_stars_earned,
                        battlesCount: user.battles_count
                    }
                });

            } catch (error) {
                console.error('Update profile error:', error);
                res.status(500).json({ error: 'Failed to update user profile' });
            }
        }
        
        else {
            res.status(405).json({ error: 'Method not allowed' });
        }
    });
}