import { sql } from '@vercel/postgres';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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
    authenticateToken(req, res, async () => {
        
        if (req.method === 'GET') {
            try {
                // Получаем коллекцию пользователя
                const userNfts = await sql`
                    SELECT un.*, nt.name as template_name, nt.img as template_img, nt.tier
                    FROM user_nfts un
                    JOIN nft_templates nt ON un.nft_template_id = nt.id
                    WHERE un.user_id = ${req.user.userId}
                    ORDER BY un.created_at DESC
                `;

                const collection = userNfts.rows.map(nft => ({
                    id: nft.id,
                    templateId: nft.nft_template_id,
                    name: nft.nft_name,
                    img: nft.nft_img,
                    buyPrice: nft.buy_price,
                    upgrades: nft.upgrades || {},
                    isActiveBattle: nft.is_active_battle,
                    tier: nft.tier,
                    createdAt: nft.created_at
                }));

                // Получаем активный NFT для боя
                const activeNft = collection.find(nft => nft.isActiveBattle);

                res.status(200).json({
                    success: true,
                    collection,
                    activeBattleNft: activeNft || null
                });

            } catch (error) {
                console.error('Collection error:', error);
                res.status(500).json({ error: 'Failed to get collection' });
            }
        }
        
        else if (req.method === 'POST') {
            try {
                const { action, ...data } = req.body;

                if (action === 'buy') {
                    const { templateId, price } = data;

                    // Проверяем есть ли у пользователя достаточно звезд
                    const user = await sql`SELECT stars FROM users WHERE id = ${req.user.userId}`;
                    if (user.rows[0].stars < price) {
                        return res.status(400).json({ error: 'Insufficient stars' });
                    }

                    // Получаем шаблон NFT
                    const template = await sql`SELECT * FROM nft_templates WHERE id = ${templateId}`;
                    if (template.rows.length === 0) {
                        return res.status(404).json({ error: 'NFT template not found' });
                    }

                    const nftTemplate = template.rows[0];

                    // Списываем звезды
                    await sql`
                        UPDATE users SET stars = stars - ${price} WHERE id = ${req.user.userId}
                    `;

                    // Добавляем NFT в коллекцию
                    const newNft = await sql`
                        INSERT INTO user_nfts (user_id, nft_template_id, nft_name, nft_img, buy_price)
                        VALUES (${req.user.userId}, ${templateId}, ${nftTemplate.name}, ${nftTemplate.img}, ${price})
                        RETURNING *
                    `;

                    res.status(201).json({
                        success: true,
                        message: `NFT ${nftTemplate.name} purchased!`,
                        nft: {
                            id: newNft.rows[0].id,
                            templateId: newNft.rows[0].nft_template_id,
                            name: newNft.rows[0].nft_name,
                            img: newNft.rows[0].nft_img,
                            buyPrice: newNft.rows[0].buy_price,
                            upgrades: newNft.rows[0].upgrades || {}
                        }
                    });
                }
                
                else if (action === 'sell') {
                    const { nftId } = data;

                    // Получаем NFT
                    const nft = await sql`
                        SELECT * FROM user_nfts WHERE id = ${nftId} AND user_id = ${req.user.userId}
                    `;

                    if (nft.rows.length === 0) {
                        return res.status(404).json({ error: 'NFT not found' });
                    }

                    const nftData = nft.rows[0];
                    const sellPrice = Math.floor(nftData.buy_price * 0.8);

                    // Добавляем звезды пользователю
                    await sql`
                        UPDATE users SET stars = stars + ${sellPrice} WHERE id = ${req.user.userId}
                    `;

                    // Удаляем NFT
                    await sql`
                        DELETE FROM user_nfts WHERE id = ${nftId}
                    `;

                    res.status(200).json({
                        success: true,
                        message: `NFT sold for ${sellPrice} stars`,
                        starsEarned: sellPrice
                    });
                }
                
                else if (action === 'setActive') {
                    const { nftId } = data;

                    // Сбрасываем все активные NFT
                    await sql`
                        UPDATE user_nfts SET is_active_battle = false WHERE user_id = ${req.user.userId}
                    `;

                    // Устанавливаем новый активный NFT
                    const result = await sql`
                        UPDATE user_nfts 
                        SET is_active_battle = true 
                        WHERE id = ${nftId} AND user_id = ${req.user.userId}
                        RETURNING *
                    `;

                    if (result.rows.length === 0) {
                        return res.status(404).json({ error: 'NFT not found' });
                    }

                    res.status(200).json({
                        success: true,
                        message: 'Active battle NFT updated',
                        activeNft: {
                            id: result.rows[0].id,
                            name: result.rows[0].nft_name,
                            img: result.rows[0].nft_img,
                            buyPrice: result.rows[0].buy_price,
                            upgrades: result.rows[0].upgrades || {}
                        }
                    });
                }
                
                else {
                    res.status(400).json({ error: 'Invalid action' });
                }

            } catch (error) {
                console.error('NFT operation error:', error);
                res.status(500).json({ error: 'NFT operation failed' });
            }
        }
        
        else {
            res.status(405).json({ error: 'Method not allowed' });
        }
    });
}