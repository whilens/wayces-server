const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { authenticateAdmin } = require('../../middleware/authMiddleware');
const { Review, User, Product } = require('../../models');

// GET /api/admin/reviews - Получить все отзывы с фильтрацией
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status; // pending, approved, rejected
    const search = req.query.search || '';

    const where = {};
    
    if (status) {
      where.status = status;
    }

    if (search) {
      where[Op.or] = [
        { text: { [Op.iLike]: `%${search}%` } },
        { '$user.first_name$': { [Op.iLike]: `%${search}%` } },
        { '$user.last_name$': { [Op.iLike]: `%${search}%` } },
        { '$product.name$': { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows: reviews } = await Review.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'phone'],
        },
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'defaultImage'],
        },
      ],
      order: [
        ['status', 'ASC'], // pending первыми
        ['createdAt', 'DESC'],
      ],
      limit,
      offset,
    });

    // Подсчет по статусам
    const statusCounts = await Review.findAll({
      attributes: [
        'status',
        [require('sequelize').fn('COUNT', require('sequelize').col('status')), 'count'],
      ],
      group: ['status'],
      raw: true,
    });

    const counts = {
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    statusCounts.forEach(s => {
      counts[s.status] = parseInt(s.count);
    });

    res.json({
      reviews: reviews.map(r => ({
        id: r.id,
        productId: r.productId,
        product: r.product ? {
          id: r.product.id,
          name: r.product.name,
          image: r.product.defaultImage,
        } : null,
        user: r.user ? {
          id: r.user.id,
          firstName: r.user.firstName,
          lastName: r.user.lastName,
          phone: r.user.phone,
        } : null,
        rating: r.rating,
        text: r.text,
        pros: r.pros,
        cons: r.cons,
        photos: r.photos || [],
        status: r.status,
        isPinned: r.isPinned,
        rejectReason: r.rejectReason,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
      statusCounts: counts,
    });
  } catch (error) {
    console.error('Ошибка получения отзывов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/admin/reviews/:id - Получить отзыв по ID
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'phone'],
        },
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'defaultImage'],
        },
      ],
    });

    if (!review) {
      return res.status(404).json({ error: 'Отзыв не найден' });
    }

    res.json({
      id: review.id,
      productId: review.productId,
      product: review.product ? {
        id: review.product.id,
        name: review.product.name,
        image: review.product.defaultImage,
      } : null,
      user: review.user ? {
        id: review.user.id,
        firstName: review.user.firstName,
        lastName: review.user.lastName,
        phone: review.user.phone,
      } : null,
      rating: review.rating,
      text: review.text,
      pros: review.pros,
      cons: review.cons,
      photos: review.photos || [],
      status: review.status,
      isPinned: review.isPinned,
      rejectReason: review.rejectReason,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    });
  } catch (error) {
    console.error('Ошибка получения отзыва:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/admin/reviews/:id/approve - Одобрить отзыв
router.put('/:id/approve', authenticateAdmin, async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id);

    if (!review) {
      return res.status(404).json({ error: 'Отзыв не найден' });
    }

    await review.update({
      status: 'approved',
      rejectReason: null,
    });

    res.json({
      message: 'Отзыв одобрен',
      review: {
        id: review.id,
        status: review.status,
      },
    });
  } catch (error) {
    console.error('Ошибка одобрения отзыва:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/admin/reviews/:id/reject - Отклонить отзыв
router.put('/:id/reject', authenticateAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    const review = await Review.findByPk(req.params.id);

    if (!review) {
      return res.status(404).json({ error: 'Отзыв не найден' });
    }

    await review.update({
      status: 'rejected',
      rejectReason: reason || 'Отзыв не соответствует правилам',
    });

    res.json({
      message: 'Отзыв отклонен',
      review: {
        id: review.id,
        status: review.status,
        rejectReason: review.rejectReason,
      },
    });
  } catch (error) {
    console.error('Ошибка отклонения отзыва:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/admin/reviews/:id/pin - Закрепить/открепить отзыв
router.put('/:id/pin', authenticateAdmin, async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id);

    if (!review) {
      return res.status(404).json({ error: 'Отзыв не найден' });
    }

    await review.update({
      isPinned: !review.isPinned,
    });

    res.json({
      message: review.isPinned ? 'Отзыв закреплен' : 'Отзыв откреплен',
      review: {
        id: review.id,
        isPinned: review.isPinned,
      },
    });
  } catch (error) {
    console.error('Ошибка закрепления отзыва:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/admin/reviews/:id - Удалить отзыв
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id);

    if (!review) {
      return res.status(404).json({ error: 'Отзыв не найден' });
    }

    await review.destroy();

    res.json({
      message: 'Отзыв удален',
    });
  } catch (error) {
    console.error('Ошибка удаления отзыва:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

