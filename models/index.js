const Category = require('./Category');
const Product = require('./Product');
const ProductVariant = require('./ProductVariant');
const ProductVariantOption = require('./ProductVariantOption');
const ProductCombination = require('./ProductCombination');
const ProductCombinationOption = require('./ProductCombinationOption');
const ProductImage = require('./ProductImage');
const Admin = require('./Admin');
const RefreshToken = require('./RefreshToken');
const Order = require('./Order');
const OrderItem = require('./OrderItem');
const User = require('./User');
const UserRefreshToken = require('./UserRefreshToken');
const Review = require('./Review');
const Favorite = require('./Favorite');
const OrderCancellation = require('./OrderCancellation');
const CategorySpecification = require('./CategorySpecification');
const CategoryVariant = require('./CategoryVariant');

// Определение связей

Category.hasMany(Product, { foreignKey: 'category_id', as: 'products' });
Product.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });

Category.hasMany(Category, { foreignKey: 'parent_id', as: 'children' });
Category.belongsTo(Category, { foreignKey: 'parent_id', as: 'parent' });

Product.hasMany(ProductVariant, { foreignKey: 'product_id', as: 'variants' });
ProductVariant.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

ProductVariant.hasMany(ProductVariantOption, { foreignKey: 'variant_id', as: 'options' });
ProductVariantOption.belongsTo(ProductVariant, { foreignKey: 'variant_id', as: 'variant' });

Product.hasMany(ProductCombination, { foreignKey: 'product_id', as: 'combinations' });
ProductCombination.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

ProductCombination.hasMany(ProductCombinationOption, { foreignKey: 'combination_id' });
ProductCombinationOption.belongsTo(ProductCombination, { foreignKey: 'combination_id' });

ProductVariantOption.hasMany(ProductCombinationOption, { foreignKey: 'option_id' });
ProductCombinationOption.belongsTo(ProductVariantOption, { foreignKey: 'option_id' });

Product.hasMany(ProductImage, { foreignKey: 'product_id', as: 'images' });
ProductImage.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

ProductCombination.hasMany(ProductImage, { foreignKey: 'combination_id' });
ProductImage.belongsTo(ProductCombination, { foreignKey: 'combination_id' });

ProductVariantOption.hasMany(ProductImage, { foreignKey: 'option_id' });
ProductImage.belongsTo(ProductVariantOption, { foreignKey: 'option_id' });

// Связи для админов
Admin.hasMany(RefreshToken, { foreignKey: 'admin_id', as: 'refreshTokens' });
RefreshToken.belongsTo(Admin, { foreignKey: 'admin_id', as: 'admin' });

// Связи для заказов
Order.hasMany(OrderItem, { foreignKey: 'order_id', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

// Связи для пользователей
User.hasMany(UserRefreshToken, { foreignKey: 'user_id', as: 'refreshTokens' });
UserRefreshToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Связи для отзывов
User.hasMany(Review, { foreignKey: 'user_id', as: 'reviews' });
Review.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Product.hasMany(Review, { foreignKey: 'product_id', as: 'reviews' });
Review.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

// Связи для избранного
User.hasMany(Favorite, { foreignKey: 'user_id', as: 'favorites' });
Favorite.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Product.hasMany(Favorite, { foreignKey: 'product_id', as: 'favorites' });
Favorite.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

// Связи для заказов пользователя
User.hasMany(Order, { foreignKey: 'user_id', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Связи для заявок на отмену
User.hasMany(OrderCancellation, { foreignKey: 'user_id', as: 'orderCancellations' });
OrderCancellation.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Order.hasMany(OrderCancellation, { foreignKey: 'order_id', as: 'cancellations' });
OrderCancellation.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

// Связи для предопределенных характеристик и вариантов категорий
Category.hasMany(CategorySpecification, { foreignKey: 'category_id', as: 'specifications' });
CategorySpecification.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });

Category.hasMany(CategoryVariant, { foreignKey: 'category_id', as: 'variants' });
CategoryVariant.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });

module.exports = {
  Category,
  Product,
  ProductVariant,
  ProductVariantOption,
  ProductCombination,
  ProductCombinationOption,
  ProductImage,
  Admin,
  RefreshToken,
  Order,
  OrderItem,
  User,
  UserRefreshToken,
  Review,
  Favorite,
  OrderCancellation,
  CategorySpecification,
  CategoryVariant,
};

