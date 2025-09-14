-- ==========================================
-- NFT GAME DATABASE SCHEMA
-- ==========================================

-- Удаляем таблицы если существуют (для пересоздания)
DROP TABLE IF EXISTS active_battles CASCADE;
DROP TABLE IF EXISTS referrals CASCADE;
DROP TABLE IF EXISTS battle_history CASCADE;
DROP TABLE IF EXISTS user_nfts CASCADE;
DROP TABLE IF EXISTS nft_templates CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ==========================================
-- ОСНОВНЫЕ ТАБЛИЦЫ
-- ==========================================

-- Пользователи
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    photo_url TEXT,
    stars INTEGER DEFAULT 100 CHECK (stars >= 0),
    total_stars_earned INTEGER DEFAULT 0 CHECK (total_stars_earned >= 0),
    battles_count INTEGER DEFAULT 0 CHECK (battles_count >= 0),
    referral_code VARCHAR(8) UNIQUE NOT NULL,
    referred_by VARCHAR(8),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Шаблоны NFT (статичные данные)
CREATE TABLE nft_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    img TEXT NOT NULL,
    tier VARCHAR(50) NOT NULL,
    base_price INTEGER NOT NULL CHECK (base_price > 0),
    popularity_rank INTEGER DEFAULT 0,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- NFT коллекция пользователей
CREATE TABLE user_nfts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    nft_template_id INTEGER REFERENCES nft_templates(id),
    nft_name VARCHAR(255) NOT NULL,
    nft_img TEXT NOT NULL,
    buy_price INTEGER NOT NULL CHECK (buy_price > 0),
    upgrades JSONB DEFAULT '{}',
    is_active_battle BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- История сражений
CREATE TABLE battle_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    player_nft_id INTEGER REFERENCES user_nfts(id) ON DELETE SET NULL,
    player_nft_name VARCHAR(255) NOT NULL,
    player_nft_img TEXT NOT NULL,
    player_upgrades JSONB DEFAULT '{}',
    opponent_nft_name VARCHAR(255) NOT NULL,
    opponent_nft_img TEXT NOT NULL,
    opponent_upgrades JSONB DEFAULT '{}',
    won BOOLEAN NOT NULL,
    battle_duration INTEGER DEFAULT 0, -- секунды
    damage_dealt INTEGER DEFAULT 0,
    damage_received INTEGER DEFAULT 0,
    battle_log JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Реферальная система
CREATE TABLE referrals (
    id SERIAL PRIMARY KEY,
    referrer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    referred_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    stars_earned INTEGER DEFAULT 1 CHECK (stars_earned > 0),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(referrer_id, referred_id)
);

-- Активные сражения (для мультиплеера в будущем)
CREATE TABLE active_battles (
    id SERIAL PRIMARY KEY,
    player1_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    player2_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    player1_nft_id INTEGER REFERENCES user_nfts(id) ON DELETE CASCADE,
    player2_nft_id INTEGER REFERENCES user_nfts(id) ON DELETE CASCADE,
    battle_state JSONB DEFAULT '{}',
    current_turn VARCHAR(10) DEFAULT 'player1' CHECK (current_turn IN ('player1', 'player2')),
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished', 'cancelled')),
    winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- ИНДЕКСЫ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ
-- ==========================================

CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_users_referral_code ON users(referral_code);
CREATE INDEX idx_users_active ON users(is_active);

CREATE INDEX idx_user_nfts_user_id ON user_nfts(user_id);
CREATE INDEX idx_user_nfts_active_battle ON user_nfts(is_active_battle) WHERE is_active_battle = TRUE;
CREATE INDEX idx_user_nfts_template_id ON user_nfts(nft_template_id);

CREATE INDEX idx_battle_history_user_id ON battle_history(user_id);
CREATE INDEX idx_battle_history_date ON battle_history(created_at DESC);
CREATE INDEX idx_battle_history_won ON battle_history(won);

CREATE INDEX idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred_id ON referrals(referred_id);
CREATE INDEX idx_referrals_active ON referrals(is_active) WHERE is_active = TRUE;

CREATE INDEX idx_nft_templates_available ON nft_templates(is_available) WHERE is_available = TRUE;
CREATE INDEX idx_nft_templates_tier ON nft_templates(tier);

-- ==========================================
-- ТРИГГЕРЫ ДЛЯ АВТООБНОВЛЕНИЯ
-- ==========================================

-- Триггер для обновления updated_at в таблице users
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Триггер для обеспечения только одного активного NFT на пользователя
CREATE OR REPLACE FUNCTION ensure_single_active_nft()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active_battle = TRUE THEN
        UPDATE user_nfts 
        SET is_active_battle = FALSE 
        WHERE user_id = NEW.user_id AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_single_active_nft 
    BEFORE INSERT OR UPDATE ON user_nfts 
    FOR EACH ROW 
    WHEN (NEW.is_active_battle = TRUE)
    EXECUTE FUNCTION ensure_single_active_nft();

-- ==========================================
-- ВСТАВКА НАЧАЛЬНЫХ ДАННЫХ
-- ==========================================

-- Вставляем шаблоны NFT
INSERT INTO nft_templates (name, img, tier, base_price, popularity_rank) VALUES
('Bday', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/bdaycandle.gif', 'basic', 100, 1),
('Big Year', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/bigyear.gif', 'basic', 150, 10),
('Durev', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/durev.gif', 'basic', 200, 8),
('Electric Skull', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/electricskull.gif', 'premium', 250, 2),
('Jelly Bean', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/jellybean.gif', 'basic', 440, 9),
('Low Rider', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/lowrider.gif', 'basic', 350, 5),
('Siber', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/siber.gif', 'basic', 240, 7),
('Skull Flower', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/SkullFlower_holders.gif', 'basic', 85, 11),
('Snoop Dog', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/SnoopDogSkins.gif', 'basic', 200, 9),
('Snoops Cigars', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/SnoopsCigars.gif', 'premium', 300, 3),
('Swag Bag', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/Swag_Bag.gif', 'basic', 700, 12),
('Vintage Cigar', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/VintageCigar.gif', 'basic', 500, 6),
('West Side', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/WestSide.gif', 'premium', 220, 4),
('Bday calendar', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/1.gif', 'premium', 150, 13),
('Jester Hat', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/jesterhat.gif', 'premium', 90, 14),
('Jolly Chimp', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/JollyChimp.gif', 'premium', 120, 15),
('Kissed Frog', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/kissedfrog.gif', 'premium', 300, 16),
('Cupid Charm', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/cupidcharm.gif', 'premium', 350, 17),
('Pet Snake', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/petsnake.gif', 'premium', 150, 18),
('Plush Pepe', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/plushpepe.gif', 'premium', 1000, 19),
('Scared Cat', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/scaredcat.gif', 'premium', 500, 20),
('Swiss Watch', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/swisswatch.gif', 'premium', 450, 21),
('Top Hat', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/tophat.gif', 'premium', 200, 22),
('Xmas Stocking', 'https://hdptohtdpkothkoefgefsaefefgefgsewef.vercel.app/mygame/imgg/xmasstocking.gif', 'premium', 100, 23);

-- ==========================================
-- ПОЛЕЗНЫЕ ЗАПРОСЫ ДЛЯ ОТЛАДКИ
-- ==========================================

-- Показать всех пользователей с их статистикой
/*
SELECT 
    u.id,
    u.first_name,
    u.stars,
    COUNT(un.id) as nft_count,
    u.battles_count,
    u.referral_code,
    (SELECT COUNT(*) FROM referrals r WHERE r.referrer_id = u.id) as referrals_count
FROM users u
LEFT JOIN user_nfts un ON u.id = un.user_id
GROUP BY u.id
ORDER BY u.created_at DESC;
*/

-- Показать топ NFT по популярности
/*
SELECT 
    nt.name,
    nt.tier,
    nt.base_price,
    COUNT(un.id) as owned_count
FROM nft_templates nt
LEFT JOIN user_nfts un ON nt.id = un.nft_template_id
GROUP BY nt.id, nt.name, nt.tier, nt.base_price
ORDER BY owned_count DESC, nt.popularity_rank ASC;
*/

-- Статистика битв
/*
SELECT 
    COUNT(*) as total_battles,
    COUNT(CASE WHEN won = true THEN 1 END) as won_battles,
    COUNT(CASE WHEN won = false THEN 1 END) as lost_battles,
    ROUND(AVG(CASE WHEN won = true THEN 100.0 ELSE 0.0 END), 2) as win_rate
FROM battle_history;
*/