# Настройка Push-уведомлений

## 1. Генерация VAPID ключей

VAPID (Voluntary Application Server Identification) ключи необходимы для отправки push-уведомлений.

### Установка web-push (если еще не установлен)
```bash
npm install web-push
```

### Генерация ключей
```bash
npx web-push generate-vapid-keys
```

Вы получите что-то вроде:
```
Public Key: BKGx... (длинная строка)
Private Key: 8xK2... (длинная строка)
```

## 2. Настройка .env файла

Добавьте в `server/.env`:

```env
VAPID_PUBLIC_KEY=ваш_public_key
VAPID_PRIVATE_KEY=ваш_private_key
VAPID_SUBJECT=mailto:admin@wayces.com
```

**Важно:**
- `VAPID_SUBJECT` должен быть валидным email или URL (например, `mailto:admin@wayces.com`)
- Ключи должны быть в формате base64

## 3. Создание таблицы в БД

Таблица `push_subscriptions` будет создана автоматически при запуске сервера (в development режиме).

Если нужно создать вручную:

```sql
CREATE TABLE push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  keys JSON NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 4. Проверка работы

1. Запустите сервер: `npm start`
2. Откройте приложение в браузере
3. Через 5 секунд должно появиться предложение подписаться на уведомления
4. Разрешите уведомления
5. Создайте новый товар в админ-панели
6. Все подписанные пользователи должны получить push-уведомление

## 5. Как это работает

### На фронте:
- Компонент `PushNotificationPrompt` автоматически запрашивает разрешение через 5 секунд
- При согласии создается подписка и сохраняется на сервере
- Если пользователь отклонил, промпт не показывается 2 часа

### На сервере:
- При создании товара → отправляется push всем подписанным
- При редактировании товара → если цена снизилась, отправляется push всем подписанным
- Невалидные подписки автоматически удаляются

## 6. Отладка

### Проверка подписок в БД:
```sql
SELECT * FROM push_subscriptions;
```

### Проверка логов:
В консоли сервера должны быть сообщения:
- `Push-уведомления отправлены: X успешно, Y неудачно`

### Проверка в браузере:
1. DevTools → Application → Service Workers
2. DevTools → Application → Notifications (если есть)

## 7. Важные замечания

- Push-уведомления работают только на HTTPS или localhost
- В production обязательно используйте HTTPS
- VAPID ключи должны быть одинаковыми для всех серверов (если их несколько)
- Невалидные подписки (410 Gone) автоматически удаляются

