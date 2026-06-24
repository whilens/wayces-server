-- Удаление неиспользуемых колонок (если sync alter не применился автоматически)
ALTER TABLE order_cancellations DROP COLUMN IF EXISTS admin_comment;
ALTER TABLE product_images DROP COLUMN IF EXISTS option_id;
ALTER TABLE products DROP COLUMN IF EXISTS rating;
ALTER TABLE products DROP COLUMN IF EXISTS reviews_count;
ALTER TABLE product_variant_options DROP COLUMN IF EXISTS stock_quantity;
