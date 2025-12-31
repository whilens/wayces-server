require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/sequelize');
const { Admin } = require('../models');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

const createAdmin = async () => {
  try {
    // Подключение к БД
    await sequelize.authenticate();
    console.log('✅ Подключение к БД успешно установлено');

    // Синхронизация моделей
    await sequelize.sync({ alter: false });
    console.log('✅ Модели синхронизированы с БД\n');

    // Запрашиваем данные
    const login = await question('Введите логин админа: ');
    
    if (!login || login.trim().length === 0) {
      console.error('❌ Логин не может быть пустым');
      process.exit(1);
    }

    // Проверяем, существует ли уже такой логин
    const existingAdmin = await Admin.findOne({ where: { login: login.trim() } });
    if (existingAdmin) {
      console.error('❌ Админ с таким логином уже существует');
      process.exit(1);
    }

    const password = await question('Введите пароль админа: ');
    
    if (!password || password.trim().length === 0) {
      console.error('❌ Пароль не может быть пустым');
      process.exit(1);
    }

    if (password.length < 6) {
      console.error('❌ Пароль должен быть не менее 6 символов');
      process.exit(1);
    }

    // Хешируем пароль
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Создаем админа
    const admin = await Admin.create({
      login: login.trim(),
      passwordHash,
      role: 'admin',
    });

    console.log('\n✅ Админ успешно создан!');
    console.log(`   ID: ${admin.id}`);
    console.log(`   Логин: ${admin.login}`);
    console.log(`   Роль: ${admin.role}`);
    console.log(`   Создан: ${admin.createdAt}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка создания админа:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
};

createAdmin();

