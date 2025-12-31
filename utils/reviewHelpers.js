const { Review } = require('../models');
const { Op } = require('sequelize');

/**
 * Форматирует отзыв для ответа API
 * @param {Object} review - Объект отзыва из БД
 * @returns {Object} Отформатированный отзыв
 */
const formatReviewResponse = (review) => {
  return {
    id: review.id,
    rating: review.rating,
    text: review.text,
    pros: review.pros,
    cons: review.cons,
    photos: review.photos || [],
    isPinned: review.isPinned,
    createdAt: review.createdAt,
    user: {
      firstName: review.user?.firstName || '',
      lastName: review.user?.lastName ? review.user.lastName.charAt(0) + '.' : '',
      avatar: review.user?.avatar || null,
    },
  };
};

/**
 * Вычисляет статистику рейтинга для товара
 * @param {number} productId - ID товара
 * @returns {Promise<Object>} { averageRating, totalReviews, ratingBreakdown }
 */
const calculateReviewStats = async (productId) => {
  const stats = await Review.findAll({
    where: { productId, status: 'approved' },
    attributes: [
      'rating',
      [require('sequelize').fn('COUNT', require('sequelize').col('rating')), 'count'],
    ],
    group: ['rating'],
    raw: true,
  });

  const ratingStats = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  stats.forEach(s => {
    ratingStats[s.rating] = parseInt(s.count);
  });

  const totalReviews = Object.values(ratingStats).reduce((a, b) => a + b, 0);
  const averageRating = totalReviews > 0
    ? Object.entries(ratingStats).reduce((sum, [rating, count]) => sum + rating * count, 0) / totalReviews
    : 0;

  return {
    averageRating: Math.round(averageRating * 10) / 10,
    totalReviews,
    ratingBreakdown: ratingStats,
  };
};

module.exports = {
  formatReviewResponse,
  calculateReviewStats,
};

