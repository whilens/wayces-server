const webpush = require('web-push');
const { PushSubscription } = require('../models');
const path = require('path');

// Функция для получения полного URL изображения
function getImageUrl(imagePath) {
  if (!imagePath) return null;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  return `${baseUrl}/uploads/${imagePath}`;
}

// Инициализация VAPID ключей
// Эти ключи должны быть в .env файле
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@wayces.com';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey
  );
} else {
  console.warn('⚠️ VAPID ключи не настроены. Push-уведомления не будут работать.');
}

/**
 * Отправка push-уведомления всем подписанным пользователям
 * @param {Object} notification - Объект уведомления { title, body, icon, url }
 */
async function sendPushToAll(notification) {
  try {
    const subscriptions = await PushSubscription.findAll();
    
    if (subscriptions.length === 0) {
      console.log('Нет активных подписок для отправки push-уведомлений');
      return { sent: 0, failed: 0 };
    }

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: notification.icon || '/192.png',
      badge: '/192.png',
      url: notification.url || '/',
      data: notification.data || {},
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        try {
          const pushSubscription = {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          };

          await webpush.sendNotification(pushSubscription, payload);
          return { success: true, subscriptionId: subscription.id };
        } catch (error) {
          // Если подписка невалидна (410 Gone), удаляем её
          if (error.statusCode === 410) {
            console.log(`Удаление невалидной подписки ${subscription.id}`);
            await subscription.destroy();
          }
          return { success: false, subscriptionId: subscription.id, error: error.message };
        }
      })
    );

    const sent = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - sent;

    console.log(`Push-уведомления отправлены: ${sent} успешно, ${failed} неудачно`);
    return { sent, failed };
  } catch (error) {
    console.error('Ошибка отправки push-уведомлений:', error);
    throw error;
  }
}

/**
 * Отправка уведомления о новом товаре
 * @param {Object} product - Объект товара
 */
async function notifyNewProduct(product) {
  const notification = {
    title: 'Новый товар! 🎉',
    body: `${product.name} - теперь в наличии`,
    icon: product.defaultImage ? getImageUrl(product.defaultImage) : '/192.png',
    url: `/products/${product.id}`,
    data: {
      type: 'new_product',
      productId: product.id,
    },
  };

  return await sendPushToAll(notification);
}

/**
 * Отправка уведомления о снижении цены
 * @param {Object} product - Объект товара
 * @param {Number} oldPrice - Старая цена
 * @param {Number} newPrice - Новая цена
 */
async function notifyPriceDrop(product, oldPrice, newPrice) {
  const priceDiff = oldPrice - newPrice;
  const discountPercent = Math.round((priceDiff / oldPrice) * 100);

  const notification = {
    title: 'Цена снижена! 💰',
    body: `${product.name} - скидка ${discountPercent}%`,
    icon: product.defaultImage ? getImageUrl(product.defaultImage) : '/192.png',
    url: `/products/${product.id}`,
    data: {
      type: 'price_drop',
      productId: product.id,
      oldPrice,
      newPrice,
      discountPercent,
    },
  };

  return await sendPushToAll(notification);
}

module.exports = {
  sendPushToAll,
  notifyNewProduct,
  notifyPriceDrop,
  vapidPublicKey, // Экспортируем для использования на фронте
};

