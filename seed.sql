-- Очистка данных (опционально, раскомментируйте если нужно)
-- TRUNCATE TABLE product_combination_options CASCADE;
-- TRUNCATE TABLE product_combinations CASCADE;
-- TRUNCATE TABLE product_variant_options CASCADE;
-- TRUNCATE TABLE product_variants CASCADE;
-- TRUNCATE TABLE product_images CASCADE;
-- TRUNCATE TABLE products CASCADE;
-- TRUNCATE TABLE categories CASCADE;

-- Создание категорий
INSERT INTO categories (name, slug, description, display_order, created_at, updated_at) VALUES
('Электроника', 'electronics', 'Смартфоны, планшеты и другие электронные устройства', 1, NOW(), NOW()),
('Спорт', 'sports', 'Спортивная обувь и одежда', 2, NOW(), NOW()),
('Одежда', 'clothing', 'Мужская и женская одежда', 3, NOW(), NOW()),
('Книги', 'books', 'Художественная и научная литература', 4, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- ТЕЛЕФОНЫ
-- ============================================

-- 1. iPhone 15 Pro Max (3 комплектации - разные цвета и памяти)
INSERT INTO products (name, slug, base_price, category_id, description, specifications, default_image, rating, reviews_count, is_active, created_at, updated_at) VALUES
('Смартфон iPhone 15 Pro Max', 'iphone-15-pro-max', 129999, 
 (SELECT id FROM categories WHERE slug = 'electronics'),
 'Флагманский смартфон с титановым корпусом, чипом A17 Pro, камерой 48 МП и дисплеем ProMotion.',
 '{"display": "6.7\", 2796x1290, Super Retina XDR, 120 Гц", "processor": "Apple A17 Pro", "camera": "48+12+12 МП", "battery": "4441 мА·ч"}'::json,
 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&h=500&fit=crop',
 4.9, 89, true, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- Варианты для iPhone
INSERT INTO product_variants (product_id, variant_key, variant_name, variant_type, display_order, is_required) 
SELECT id, 'color', 'Цвет', 'color', 1, true FROM products WHERE slug = 'iphone-15-pro-max'
ON CONFLICT DO NOTHING;

INSERT INTO product_variants (product_id, variant_key, variant_name, variant_type, display_order, is_required) 
SELECT id, 'storage', 'Память', 'button', 2, true FROM products WHERE slug = 'iphone-15-pro-max'
ON CONFLICT DO NOTHING;

-- Опции цвета для iPhone
INSERT INTO product_variant_options (variant_id, option_key, option_value, color_code, price_modifier, images, is_default, is_available, stock_quantity, display_order)
SELECT 
    (SELECT id FROM product_variants WHERE product_id = (SELECT id FROM products WHERE slug = 'iphone-15-pro-max') AND variant_key = 'color'),
    'color-natural', 'Натуральный титан', '#8B7355', 0,
    '["https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&h=500&fit=crop"]'::json,
    true, true, 10, 1
ON CONFLICT DO NOTHING;

INSERT INTO product_variant_options (variant_id, option_key, option_value, color_code, price_modifier, images, is_default, is_available, stock_quantity, display_order)
SELECT 
    (SELECT id FROM product_variants WHERE product_id = (SELECT id FROM products WHERE slug = 'iphone-15-pro-max') AND variant_key = 'color'),
    'color-blue', 'Синий титан', '#4A90E2', 0,
    '["https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&h=500&fit=crop"]'::json,
    false, true, 8, 2
ON CONFLICT DO NOTHING;

INSERT INTO product_variant_options (variant_id, option_key, option_value, color_code, price_modifier, images, is_default, is_available, stock_quantity, display_order)
SELECT 
    (SELECT id FROM product_variants WHERE product_id = (SELECT id FROM products WHERE slug = 'iphone-15-pro-max') AND variant_key = 'color'),
    'color-black', 'Черный титан', '#1C1C1E', 0,
    '["https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&h=500&fit=crop"]'::json,
    false, true, 12, 3
ON CONFLICT DO NOTHING;

-- Опции памяти для iPhone
INSERT INTO product_variant_options (variant_id, option_key, option_value, price_modifier, is_default, is_available, stock_quantity, display_order)
SELECT 
    (SELECT id FROM product_variants WHERE product_id = (SELECT id FROM products WHERE slug = 'iphone-15-pro-max') AND variant_key = 'storage'),
    'storage-256', '256 ГБ', 0, true, true, 15, 1
ON CONFLICT DO NOTHING;

INSERT INTO product_variant_options (variant_id, option_key, option_value, price_modifier, is_default, is_available, stock_quantity, display_order)
SELECT 
    (SELECT id FROM product_variants WHERE product_id = (SELECT id FROM products WHERE slug = 'iphone-15-pro-max') AND variant_key = 'storage'),
    'storage-512', '512 ГБ', 20000, false, true, 8, 2
ON CONFLICT DO NOTHING;

INSERT INTO product_variant_options (variant_id, option_key, option_value, price_modifier, is_default, is_available, stock_quantity, display_order)
SELECT 
    (SELECT id FROM product_variants WHERE product_id = (SELECT id FROM products WHERE slug = 'iphone-15-pro-max') AND variant_key = 'storage'),
    'storage-1tb', '1 ТБ', 40000, false, true, 3, 3
ON CONFLICT DO NOTHING;

-- Комбинации для iPhone (создаем вручную для 3 основных)
INSERT INTO product_combinations (product_id, combination_key, price, stock_quantity, sku, is_active, created_at, updated_at)
SELECT 
    id,
    'color-natural_storage-256',
    base_price + 0 + 0,
    10,
    'IPHONE15PM-256-NAT',
    true,
    NOW(),
    NOW()
FROM products WHERE slug = 'iphone-15-pro-max'
ON CONFLICT DO NOTHING;

INSERT INTO product_combinations (product_id, combination_key, price, stock_quantity, sku, is_active, created_at, updated_at)
SELECT 
    id,
    'color-blue_storage-512',
    base_price + 0 + 20000,
    8,
    'IPHONE15PM-512-BLU',
    true,
    NOW(),
    NOW()
FROM products WHERE slug = 'iphone-15-pro-max'
ON CONFLICT DO NOTHING;

INSERT INTO product_combinations (product_id, combination_key, price, stock_quantity, sku, is_active, created_at, updated_at)
SELECT 
    id,
    'color-black_storage-1tb',
    base_price + 0 + 40000,
    3,
    'IPHONE15PM-1TB-BLK',
    true,
    NOW(),
    NOW()
FROM products WHERE slug = 'iphone-15-pro-max'
ON CONFLICT DO NOTHING;

-- Связи комбинаций с опциями для iPhone
INSERT INTO product_combination_options (combination_id, option_id)
SELECT 
    pc.id,
    pvo.id
FROM product_combinations pc
JOIN products p ON pc.product_id = p.id
JOIN product_variant_options pvo ON (
    (pc.combination_key LIKE '%' || pvo.option_key || '%')
)
WHERE p.slug = 'iphone-15-pro-max'
ON CONFLICT DO NOTHING;

-- 2. Samsung Galaxy S24 Ultra (отдельный телефон без вариантов)
INSERT INTO products (name, slug, base_price, category_id, description, specifications, default_image, rating, reviews_count, is_active, created_at, updated_at) VALUES
('Смартфон Samsung Galaxy S24 Ultra', 'samsung-galaxy-s24-ultra', 99999, 
 (SELECT id FROM categories WHERE slug = 'electronics'),
 'Флагманский смартфон Samsung с экраном 6.8 дюймов, камерой 200 МП и процессором Snapdragon 8 Gen 3.',
 '{"display": "6.8\", Dynamic AMOLED 2X, 120 Гц", "processor": "Snapdragon 8 Gen 3", "camera": "200+50+10+12 МП", "battery": "5000 мА·ч"}'::json,
 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&h=500&fit=crop',
 4.7, 156, true, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- 3. Xiaomi 14 Pro (отдельный телефон без вариантов)
INSERT INTO products (name, slug, base_price, category_id, description, specifications, default_image, rating, reviews_count, is_active, created_at, updated_at) VALUES
('Смартфон Xiaomi 14 Pro', 'xiaomi-14-pro', 69999, 
 (SELECT id FROM categories WHERE slug = 'electronics'),
 'Премиальный смартфон с камерой Leica, процессором Snapdragon 8 Gen 3 и быстрой зарядкой 120W.',
 '{"display": "6.73\", LTPO AMOLED, 120 Гц", "processor": "Snapdragon 8 Gen 3", "camera": "50+50+50 МП Leica", "battery": "4880 мА·ч"}'::json,
 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&h=500&fit=crop',
 4.6, 203, true, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- КРОССОВКИ (6 моделей)
-- ============================================

-- 4. Nike Air Max 270
INSERT INTO products (name, slug, base_price, category_id, description, specifications, default_image, rating, reviews_count, is_active, created_at, updated_at) VALUES
('Кроссовки Nike Air Max 270', 'nike-air-max-270', 8999, 
 (SELECT id FROM categories WHERE slug = 'sports'),
 'Спортивные кроссовки с технологией Air Max для максимального комфорта.',
 '{"material": "Текстиль, синтетика", "sole": "Резина", "weight": "320 г"}'::json,
 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&h=500&fit=crop',
 4.6, 189, true, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- Варианты для Nike
INSERT INTO product_variants (product_id, variant_key, variant_name, variant_type, display_order, is_required) 
SELECT id, 'color', 'Цвет', 'color', 1, true FROM products WHERE slug = 'nike-air-max-270'
ON CONFLICT DO NOTHING;

INSERT INTO product_variants (product_id, variant_key, variant_name, variant_type, display_order, is_required) 
SELECT id, 'size', 'Размер', 'button', 2, true FROM products WHERE slug = 'nike-air-max-270'
ON CONFLICT DO NOTHING;

-- Опции для Nike
INSERT INTO product_variant_options (variant_id, option_key, option_value, color_code, price_modifier, is_default, is_available, stock_quantity, display_order)
SELECT 
    (SELECT id FROM product_variants WHERE product_id = (SELECT id FROM products WHERE slug = 'nike-air-max-270') AND variant_key = 'color'),
    'color-black', 'Черный', '#000000', 0, true, true, 20, 1
ON CONFLICT DO NOTHING;

INSERT INTO product_variant_options (variant_id, option_key, option_value, color_code, price_modifier, is_default, is_available, stock_quantity, display_order)
SELECT 
    (SELECT id FROM product_variants WHERE product_id = (SELECT id FROM products WHERE slug = 'nike-air-max-270') AND variant_key = 'color'),
    'color-white', 'Белый', '#FFFFFF', 0, false, true, 15, 2
ON CONFLICT DO NOTHING;

INSERT INTO product_variant_options (variant_id, option_key, option_value, price_modifier, is_default, is_available, stock_quantity, display_order)
SELECT 
    (SELECT id FROM product_variants WHERE product_id = (SELECT id FROM products WHERE slug = 'nike-air-max-270') AND variant_key = 'size'),
    'size-41', '41', 0, true, true, 12, 1
ON CONFLICT DO NOTHING;

INSERT INTO product_variant_options (variant_id, option_key, option_value, price_modifier, is_default, is_available, stock_quantity, display_order)
SELECT 
    (SELECT id FROM product_variants WHERE product_id = (SELECT id FROM products WHERE slug = 'nike-air-max-270') AND variant_key = 'size'),
    'size-42', '42', 0, false, true, 15, 2
ON CONFLICT DO NOTHING;

INSERT INTO product_variant_options (variant_id, option_key, option_value, price_modifier, is_default, is_available, stock_quantity, display_order)
SELECT 
    (SELECT id FROM product_variants WHERE product_id = (SELECT id FROM products WHERE slug = 'nike-air-max-270') AND variant_key = 'size'),
    'size-43', '43', 0, false, true, 10, 3
ON CONFLICT DO NOTHING;

-- Комбинации для Nike
INSERT INTO product_combinations (product_id, combination_key, price, stock_quantity, sku, is_active, created_at, updated_at)
SELECT id, 'color-black_size-41', base_price, 12, 'NIKE270-41-BLK', true, NOW(), NOW()
FROM products WHERE slug = 'nike-air-max-270'
ON CONFLICT DO NOTHING;

INSERT INTO product_combinations (product_id, combination_key, price, stock_quantity, sku, is_active, created_at, updated_at)
SELECT id, 'color-black_size-42', base_price, 15, 'NIKE270-42-BLK', true, NOW(), NOW()
FROM products WHERE slug = 'nike-air-max-270'
ON CONFLICT DO NOTHING;

INSERT INTO product_combinations (product_id, combination_key, price, stock_quantity, sku, is_active, created_at, updated_at)
SELECT id, 'color-white_size-42', base_price, 10, 'NIKE270-42-WHT', true, NOW(), NOW()
FROM products WHERE slug = 'nike-air-max-270'
ON CONFLICT DO NOTHING;

-- Связи для Nike
INSERT INTO product_combination_options (combination_id, option_id)
SELECT pc.id, pvo.id
FROM product_combinations pc
JOIN products p ON pc.product_id = p.id
JOIN product_variant_options pvo ON (pc.combination_key LIKE '%' || pvo.option_key || '%')
WHERE p.slug = 'nike-air-max-270'
ON CONFLICT DO NOTHING;

-- 5-9. Остальные кроссовки (без вариантов для простоты)
INSERT INTO products (name, slug, base_price, category_id, description, specifications, default_image, rating, reviews_count, is_active, created_at, updated_at) VALUES
('Кроссовки Adidas Ultraboost 23', 'adidas-ultraboost-23', 12999, 
 (SELECT id FROM categories WHERE slug = 'sports'),
 'Премиальные беговые кроссовки с технологией Boost.',
 '{"material": "Primeknit верх", "sole": "Boost", "weight": "280 г"}'::json,
 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&h=500&fit=crop',
 4.8, 234, true, NOW(), NOW()),
('Кроссовки Puma RS-X', 'puma-rs-x', 7999, 
 (SELECT id FROM categories WHERE slug = 'sports'),
 'Стильные кроссовки в ретро-стиле.',
 '{"material": "Синтетика", "sole": "Резина", "weight": "350 г"}'::json,
 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&h=500&fit=crop',
 4.5, 167, true, NOW(), NOW()),
('Кроссовки New Balance 574', 'new-balance-574', 6999, 
 (SELECT id FROM categories WHERE slug = 'sports'),
 'Классические кроссовки для повседневной носки.',
 '{"material": "Сукно, кожа", "sole": "EVA", "weight": "310 г"}'::json,
 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&h=500&fit=crop',
 4.4, 145, true, NOW(), NOW()),
('Кроссовки Reebok Classic', 'reebok-classic', 5999, 
 (SELECT id FROM categories WHERE slug = 'sports'),
 'Легендарная модель Reebok в классическом дизайне.',
 '{"material": "Кожа", "sole": "Резина", "weight": "340 г"}'::json,
 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&h=500&fit=crop',
 4.3, 98, true, NOW(), NOW()),
('Кроссовки Vans Old Skool', 'vans-old-skool', 5499, 
 (SELECT id FROM categories WHERE slug = 'sports'),
 'Культовая модель Vans для скейтбординга.',
 '{"material": "Холст", "sole": "Вулканизированная резина", "weight": "290 г"}'::json,
 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&h=500&fit=crop',
 4.6, 312, true, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- ДРУГИЕ ТОВАРЫ
-- ============================================

-- 10. Куртка-пуховик
INSERT INTO products (name, slug, base_price, category_id, description, specifications, default_image, rating, reviews_count, is_active, created_at, updated_at) VALUES
('Куртка-пуховик Uniqlo Ultra Light Down', 'uniqlo-ultra-light-down', 4999, 
 (SELECT id FROM categories WHERE slug = 'clothing'),
 'Легкая и теплая куртка-пуховик с наполнителем из пуха.',
 '{"material": "Полиэстер, пух", "filling": "90% пух, 10% перо", "weight": "250 г"}'::json,
 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=500&h=500&fit=crop',
 4.5, 127, true, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- 11. Книга
INSERT INTO products (name, slug, base_price, category_id, description, specifications, default_image, rating, reviews_count, is_active, created_at, updated_at) VALUES
('Книга "Война и мир" Л.Н. Толстой', 'war-and-peace', 899, 
 (SELECT id FROM categories WHERE slug = 'books'),
 'Величайший роман русской литературы в полном издании.',
 '{"author": "Л.Н. Толстой", "pages": 1274, "language": "Русский", "cover": "Твердый переплет"}'::json,
 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500&h=500&fit=crop',
 4.8, 456, true, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- 12. Ноутбук MacBook Pro
INSERT INTO products (name, slug, base_price, category_id, description, specifications, default_image, rating, reviews_count, is_active, created_at, updated_at) VALUES
('Ноутбук MacBook Pro 16 M3', 'macbook-pro-16-m3', 249999, 
 (SELECT id FROM categories WHERE slug = 'electronics'),
 'Профессиональный ноутбук с чипом M3, дисплеем Liquid Retina XDR.',
 '{"display": "16.2\", Liquid Retina XDR", "processor": "Apple M3", "memory": "18 ГБ", "storage": "512 ГБ SSD"}'::json,
 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500&h=500&fit=crop',
 4.9, 78, true, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;
