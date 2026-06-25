const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'voskanauto.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ======== ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ ========
function initDatabase() {
  // Пользователи
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'client',
      full_name TEXT,
      phone TEXT,
      company_name TEXT,
      inn TEXT,
      kpp TEXT,
      discount_percent INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Автомобили
  db.exec(`
    CREATE TABLE IF NOT EXISTS cars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      brand TEXT,
      model TEXT,
      year TEXT,
      vin TEXT,
      license_plate TEXT,
      mileage INTEGER,
      color TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id)
    )
  `);

  // Услуги
  db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      labor_hours REAL DEFAULT 1,
      hourly_rate INTEGER DEFAULT 2500,
      compatible_brands TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Запчасти
  db.exec(`
    CREATE TABLE IF NOT EXISTS parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article TEXT UNIQUE,
      name TEXT NOT NULL,
      manufacturer TEXT,
      category TEXT,
      stock_main INTEGER DEFAULT 0,
      min_stock INTEGER DEFAULT 5,
      purchase_price INTEGER DEFAULT 0,
      sale_price INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Заказ-наряды
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE,
      client_id INTEGER,
      car_id INTEGER,
      mechanic_id INTEGER,
      post_number TEXT,
      status TEXT DEFAULT 'created',
      description TEXT,
      total_labor_cost INTEGER DEFAULT 0,
      total_parts_cost INTEGER DEFAULT 0,
      total_amount INTEGER DEFAULT 0,
      scheduled_date TEXT,
      scheduled_time TEXT,
      invoice_sent INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id)
    )
  `);

  // Услуги в заказе
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_order_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      service_id INTEGER,
      quantity INTEGER DEFAULT 1,
      price INTEGER
    )
  `);

  // Запчасти в заказе
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_order_parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      part_id INTEGER,
      quantity INTEGER DEFAULT 1,
      price INTEGER
    )
  `);

  // Записи на сервис
  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      car_id INTEGER,
      service_id INTEGER,
      appointment_date TEXT,
      appointment_time TEXT,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Счета
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE,
      client_id INTEGER,
      order_id INTEGER,
      amount INTEGER,
      description TEXT,
      status TEXT DEFAULT 'pending',
      due_date TEXT,
      paid_at DATETIME,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Платежи
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      invoice_id INTEGER,
      order_id INTEGER,
      amount INTEGER,
      payment_method TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Уведомления
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      type TEXT,
      title TEXT,
      message TEXT,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Корзина
  db.exec(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      service_id INTEGER,
      part_id INTEGER,
      quantity INTEGER DEFAULT 1,
      price INTEGER
    )
  `);

  // Лог активности
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Поставщики
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      phone TEXT,
      email TEXT,
      address TEXT
    )
  `);

  
  // Отзывы клиентов
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      client_id INTEGER,
      rating INTEGER CHECK(rating >= 1 AND rating <= 5),
      text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES work_orders(id),
      FOREIGN KEY (client_id) REFERENCES users(id)
    )
  `);

  // История изменений заказа (таймлайн)
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      user_id INTEGER,
      action TEXT,
      old_value TEXT,
      new_value TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES work_orders(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Комментарии к заказу
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      user_id INTEGER,
      text TEXT,
      is_internal INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES work_orders(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Фото заказа (до/после)
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      photo_type TEXT,
      photo_url TEXT,
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES work_orders(id)
    )
  `);

  // Напоминания персоналу
  db.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT,
      description TEXT,
      due_date DATETIME,
      is_completed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Тема пользователя
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY,
      theme TEXT DEFAULT 'light',
      language TEXT DEFAULT 'ru',
      notifications_enabled INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  console.log('✅ Таблицы созданы');
  seedDatabase();
  console.log('✅ Демо-данные добавлены');
}

// ======== ДЕМО-ДАННЫЕ ========
function seedDatabase() {
  const hash = (pwd) => bcrypt.hashSync(pwd, 10);

  // Админ
  const admin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@voskanauto.ru');
  if (!admin) {
    db.prepare('INSERT INTO users (email, password, role, full_name, phone) VALUES (?, ?, ?, ?, ?)')
      .run('admin@voskanauto.ru', hash('admin123'), 'admin', 'Администратор', '+7 (999) 000-00-00');
  }

  // Механик
  const mechanic = db.prepare('SELECT id FROM users WHERE email = ?').get('semenov@voskanauto.ru');
  if (!mechanic) {
    db.prepare('INSERT INTO users (email, password, role, full_name, phone) VALUES (?, ?, ?, ?, ?)')
      .run('semenov@voskanauto.ru', hash('mechanic123'), 'mechanic', 'Семенов И.П.', '+7 (999) 111-11-11');
  }

  // Клиент
  const client = db.prepare('SELECT id FROM users WHERE email = ?').get('client@example.com');
  if (!client) {
    const clientResult = db.prepare('INSERT INTO users (email, password, role, full_name, phone) VALUES (?, ?, ?, ?, ?)')
      .run('client@example.com', hash('client123'), 'client', 'Даниил Боглюков', '+7 (908) 926-03-34');
    const clientId = clientResult.lastInsertRowid;

    // Автомобиль клиента
    db.prepare('INSERT INTO cars (client_id, brand, model, year, license_plate, mileage) VALUES (?, ?, ?, ?, ?, ?)')
      .run(clientId, 'Toyota', 'Camry', '2020', 'А123БВ777', 45000);
  }

  // Услуги
  const servicesCount = db.prepare('SELECT COUNT(*) as cnt FROM services').get();
  if (servicesCount.cnt === 0) {
    const services = [
      ['WASH-001', 'Комплексная мойка', 'Автомойки', 'Кузов, салон, двигатель', 1, 2500],
      ['ANTICOR-001', 'Антикоррозийная обработка', 'Антикор', 'Обработка днища и арок', 2, 2500],
      ['EXH-001', 'Ремонт выхлопных систем', 'Выхлопная система', 'Замена глушителя, катализатора', 2, 2500],
      ['ENG-001', 'Капитальный ремонт ДВС', 'Двигатель', 'Полный капремонт с гарантией', 40, 2500],
      ['ENG-003', 'Ремонт бензиновых двигателей', 'Двигатель', 'Капитальный и текущий ремонт', 18, 2500],
      ['ENG-002', 'Ремонт дизельных двигателей', 'Двигатель', 'Капитальный и текущий ремонт', 20, 2500],
      ['DIAG-003', 'Диагностика ходовой части', 'Диагностика', 'Проверка подвески, амортизаторов', 0.5, 2500],
      ['DIAG-001', 'Компьютерная диагностика', 'Диагностика', 'Полная диагностика всех систем', 0.5, 2500],
      ['INFO-001', 'Консультация', 'Инфо', 'Бесплатная консультация механика', 0, 2500],
      ['AC-001', 'Заправка кондиционера', 'Кондиционер', 'Диагностика утечек + заправка', 1, 2500],
      ['AC-002', 'Обслуживание климатических систем', 'Кондиционер', 'Диагностика, заправка, ремонт', 1.5, 2500],
      ['BODY-001', 'Кузовной ремонт', 'Кузовной ремонт', 'Восстановление геометрии, покраска', 8, 2500],
      ['LIGHT-001', 'Установка и ремонт автооптики', 'Оптика', 'Фары, противотуманки, LED', 1, 2500],
      ['STEER-001', 'Ремонт рулевых реек', 'Рулевое управление', 'Диагностика и ремонт', 3, 2500],
      ['GLASS-001', 'Установка и ремонт автостёкол', 'Стёкла', 'Лобовое, боковое, заднее', 2, 2500],
      ['OIL-001', 'Замена масла', 'ТО', 'Замена масла и фильтра', 0.5, 2500],
      ['BRK-001', 'Замена тормозных колодок', 'Тормозная система', 'Передние и задние колодки', 1, 2500],
      ['SUSP-001', 'Замена амортизаторов', 'Ходовая часть', 'Передние и задние амортизаторы', 2, 2500],
      ['TRANS-001', 'Ремонт АКПП', 'Трансмиссия', 'Диагностика и ремонт АКПП', 15, 2500],
      ['ELEC-001', 'Ремонт электрики', 'Электрика', 'Диагностика и ремонт электрики', 2, 2500],
      ['FUEL-001', 'Чистка форсунок', 'Топливная система', 'Ультразвуковая чистка', 2, 2500],
      ['TIRE-001', 'Шиномонтаж', 'Шиномонтаж', 'Балансировка, прокатка', 0.5, 2500],
    ];

    const stmt = db.prepare('INSERT INTO services (code, name, category, description, labor_hours, hourly_rate) VALUES (?, ?, ?, ?, ?, ?)');
    for (const s of services) {
      stmt.run(s[0], s[1], s[2], s[3], s[4], s[5]);
    }
  }

  // Запчасти
  const partsCount = db.prepare('SELECT COUNT(*) as cnt FROM parts').get();
  if (partsCount.cnt === 0) {
    const parts = [
      ['AC-FR-001', 'Фреон R134a (1кг)', 'Кондиционер', 15, 5, 800, 1200],
      ['OIL-5W30-1L', 'Масло моторное 5W-30 (1л)', 'Масла и жидкости', 2, 10, 850, 1200],
      ['OIL-5W30-4L', 'Масло моторное 5W-30 (4л)', 'Масла и жидкости', 18, 5, 3200, 4500],
      ['BRK-DISC-001', 'Тормозные диски передние', 'Тормозная система', 12, 3, 4500, 6500],
      ['BRK-BOSCH-001', 'Тормозные колодки передние', 'Тормозная система', 1, 5, 1800, 2800],
      ['FILT-AIR-001', 'Воздушный фильтр', 'Фильтры', 25, 5, 650, 1100],
      ['FILT-MANN-001', 'Масляный фильтр', 'Фильтры', 3, 15, 450, 750],
      ['SUSP-SHOCK-001', 'Амортизаторы задние', 'Ходовая часть', 6, 2, 3200, 4800],
      ['ELEC-GEN-001', 'Генератор 12V 90A', 'Электрика', 4, 2, 8500, 12500],
      ['ELEC-SPARK-001', 'Свечи зажигания (компл. 4 шт.)', 'Электрика', 20, 5, 1200, 1800],
    ];

    const stmt = db.prepare('INSERT INTO parts (article, name, category, stock_main, min_stock, purchase_price, sale_price) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const p of parts) {
      stmt.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6]);
    }
  }

  // Заказ-наряд
  const ordersCount = db.prepare('SELECT COUNT(*) as cnt FROM work_orders').get();
  if (ordersCount.cnt === 0) {
    const clientRow = db.prepare('SELECT id FROM users WHERE email = ?').get('client@example.com');
    if (clientRow) {
      db.prepare('INSERT INTO work_orders (order_number, client_id, status, total_amount, description) VALUES (?, ?, ?, ?, ?)')
        .run('WO-1782332003364', clientRow.id, 'created', 1250, 'ТО и диагностика');
    }
  }
}

// ======== DB HELPERS ========
const dbHelpers = {
  run: (sql, params = []) => db.prepare(sql).run(params),
  get: (sql, params = []) => db.prepare(sql).get(params),
  all: (sql, params = []) => db.prepare(sql).all(params),

  getUserByEmail: (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email),
  getUserById: (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id),
  getClientCars: (clientId) => db.prepare('SELECT * FROM cars WHERE client_id = ?').all(clientId),
  addCar: (data) => db.prepare('INSERT INTO cars (client_id, brand, model, year, vin, license_plate, mileage, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(data.client_id, data.brand, data.model, data.year, data.vin, data.license_plate, data.mileage, data.color),

  getAllServices: () => db.prepare('SELECT * FROM services WHERE is_active = 1 ORDER BY name').all(),
  getAllWashServices: () => db.prepare('SELECT * FROM services WHERE category = "Автомойки" AND is_active = 1').all(),
  getAllParts: () => db.prepare('SELECT * FROM parts ORDER BY name').all(),
  getCriticalParts: () => db.prepare('SELECT * FROM parts WHERE stock_main <= min_stock ORDER BY stock_main').all(),

  getCartItems: (clientId) => db.prepare('SELECT c.*, s.name as service_name, p.name as part_name FROM cart_items c LEFT JOIN services s ON c.service_id = s.id LEFT JOIN parts p ON c.part_id = p.id WHERE c.client_id = ?').all(clientId),
  getCartTotal: (clientId) => db.prepare('SELECT COALESCE(SUM(price * quantity), 0) as total FROM cart_items WHERE client_id = ?').get(clientId),
  clearCart: (clientId) => db.prepare('DELETE FROM cart_items WHERE client_id = ?').run(clientId),

  getWorkOrders: (status) => {
    if (status && status !== 'all') {
      return db.prepare('SELECT wo.*, u.full_name as client_name, u.phone as client_phone, c.brand, c.model, c.license_plate, m.full_name as mechanic_name FROM work_orders wo LEFT JOIN users u ON wo.client_id = u.id LEFT JOIN cars c ON wo.car_id = c.id LEFT JOIN users m ON wo.mechanic_id = m.id WHERE wo.status = ? ORDER BY wo.created_at DESC').all(status);
    }
    return db.prepare('SELECT wo.*, u.full_name as client_name, u.phone as client_phone, c.brand, c.model, c.license_plate, m.full_name as mechanic_name FROM work_orders wo LEFT JOIN users u ON wo.client_id = u.id LEFT JOIN cars c ON wo.car_id = c.id LEFT JOIN users m ON wo.mechanic_id = m.id ORDER BY wo.created_at DESC').all();
  },
  getWorkOrderById: (id) => db.prepare('SELECT wo.*, u.full_name as client_name, c.brand, c.model, c.license_plate FROM work_orders wo LEFT JOIN users u ON wo.client_id = u.id LEFT JOIN cars c ON wo.car_id = c.id WHERE wo.id = ?').get(id),

  getAppointments: (clientId) => {
    if (clientId) {
      return db.prepare('SELECT a.*, s.name as service_name, c.brand, c.model, c.license_plate FROM appointments a LEFT JOIN services s ON a.service_id = s.id LEFT JOIN cars c ON a.car_id = c.id WHERE a.client_id = ? ORDER BY a.appointment_date DESC').all(clientId);
    }
    return db.prepare('SELECT a.*, u.full_name as client_name, s.name as service_name, c.brand, c.model FROM appointments a LEFT JOIN users u ON a.client_id = u.id LEFT JOIN services s ON a.service_id = s.id LEFT JOIN cars c ON a.car_id = c.id ORDER BY a.appointment_date DESC').all();
  },

  getInvoices: (clientId) => {
    if (clientId) {
      return db.prepare('SELECT * FROM invoices WHERE client_id = ? ORDER BY created_at DESC').all(clientId);
    }
    return db.prepare('SELECT i.*, u.full_name as client_name FROM invoices i LEFT JOIN users u ON i.client_id = u.id ORDER BY i.created_at DESC').all();
  },

  getNotifications: (userId) => db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC').all(userId),
  addNotification: (userId, type, title, message) => db.prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)').run(userId, type, title, message),
  markRead: (userId) => db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId),
  getUnreadCount: (userId) => db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(userId),

  getStats: () => {
    const orders = db.prepare('SELECT COUNT(*) as total, SUM(total_amount) as revenue FROM work_orders').get();
    const clients = db.prepare('SELECT COUNT(*) as total FROM users WHERE role = "client"').get();
    const parts = db.prepare('SELECT COUNT(*) as total FROM parts').get();
    const critical = db.prepare('SELECT COUNT(*) as total FROM parts WHERE stock_main <= min_stock').get();
    return { orders: orders.total || 0, revenue: orders.revenue || 0, clients: clients.total || 0, parts: parts.total || 0, critical: critical.total || 0 };
  },

  createService: (data) => db.prepare('INSERT INTO services (code, name, category, description, labor_hours, hourly_rate, compatible_brands) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(data.code, data.name, data.category, data.description, data.labor_hours, data.hourly_rate, data.compatible_brands),
  updateService: (id, data) => db.prepare('UPDATE services SET code = ?, name = ?, category = ?, description = ?, labor_hours = ?, hourly_rate = ?, compatible_brands = ? WHERE id = ?')
    .run(data.code, data.name, data.category, data.description, data.labor_hours, data.hourly_rate, data.compatible_brands, id),
  deleteService: (id) => db.prepare('UPDATE services SET is_active = 0 WHERE id = ?').run(id),
  restoreService: (id) => db.prepare('UPDATE services SET is_active = 1 WHERE id = ?').run(id),

  logActivity: (userId, action, entityType, entityId, description) => db.prepare('INSERT INTO activity_log (user_id, action, entity_type, entity_id, description) VALUES (?, ?, ?, ?, ?)')
    .run(userId, action, entityType, entityId, description),
};


  getOrderHistory: (orderId) => db.prepare('SELECT oh.*, u.full_name as user_name FROM order_history oh LEFT JOIN users u ON oh.user_id = u.id WHERE oh.order_id = ? ORDER BY oh.created_at DESC').all(orderId),

  addOrderHistory: (orderId, userId, action, oldValue, newValue) => db.prepare('INSERT INTO order_history (order_id, user_id, action, old_value, new_value) VALUES (?, ?, ?, ?, ?)').run(orderId, userId, action, oldValue, newValue),

  getOrderComments: (orderId) => db.prepare('SELECT oc.*, u.full_name as user_name, u.role as user_role FROM order_comments oc LEFT JOIN users u ON oc.user_id = u.id WHERE oc.order_id = ? ORDER BY oc.created_at DESC').all(orderId),

  addOrderComment: (orderId, userId, text, isInternal) => db.prepare('INSERT INTO order_comments (order_id, user_id, text, is_internal) VALUES (?, ?, ?, ?)').run(orderId, userId, text, isInternal),

  getReviews: () => db.prepare('SELECT r.*, u.full_name as client_name, wo.order_number FROM reviews r LEFT JOIN users u ON r.client_id = u.id LEFT JOIN work_orders wo ON r.order_id = wo.id ORDER BY r.created_at DESC').all(),

  getOrderReviews: (orderId) => db.prepare('SELECT * FROM reviews WHERE order_id = ?').all(orderId),

  addReview: (orderId, clientId, rating, text) => db.prepare('INSERT INTO reviews (order_id, client_id, rating, text) VALUES (?, ?, ?, ?)').run(orderId, clientId, rating, text),

  getReminders: (userId) => db.prepare('SELECT * FROM reminders WHERE user_id = ? AND is_completed = 0 ORDER BY due_date ASC').all(userId),

  addReminder: (userId, title, description, dueDate) => db.prepare('INSERT INTO reminders (user_id, title, description, due_date) VALUES (?, ?, ?, ?)').run(userId, title, description, dueDate),

  completeReminder: (id) => db.prepare('UPDATE reminders SET is_completed = 1 WHERE id = ?').run(id),

  getUserSettings: (userId) => db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId),

  setUserTheme: (userId, theme) => db.prepare('INSERT OR REPLACE INTO user_settings (user_id, theme) VALUES (?, ?)').run(userId, theme),

  module.exports = { db, initDatabase, dbHelpers };
