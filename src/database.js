const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');
require('dotenv').config();

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'voskanauto.db');

// Создаём папку для БД если нет
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
  }
});

// Включаем WAL и foreign keys
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');

// Promise-обёртка для sqlite3
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDatabase() {
  try {
    // Users
    await run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'client',
      full_name TEXT NOT NULL,
      phone TEXT,
      inn TEXT,
      kpp TEXT,
      company_name TEXT,
      discount_percent INTEGER DEFAULT 0,
      bonus_points INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Cars
    await run(`CREATE TABLE IF NOT EXISTS cars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER,
      vin TEXT,
      license_plate TEXT,
      mileage INTEGER,
      color TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Services
    await run(`CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      labor_hours REAL NOT NULL,
      hourly_rate INTEGER DEFAULT 2500,
      price INTEGER GENERATED ALWAYS AS (CAST(labor_hours * hourly_rate AS INTEGER)) STORED,
      compatible_brands TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Parts
    await run(`CREATE TABLE IF NOT EXISTS parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      manufacturer TEXT,
      category TEXT NOT NULL,
      compatible_brands TEXT,
      stock_main INTEGER DEFAULT 0,
      stock_small INTEGER DEFAULT 0,
      stock_defect INTEGER DEFAULT 0,
      min_stock INTEGER DEFAULT 5,
      purchase_price INTEGER DEFAULT 0,
      sale_price INTEGER DEFAULT 0,
      supplier_id INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Suppliers
    await run(`CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      api_url TEXT,
      is_active INTEGER DEFAULT 1
    )`);

    // Work orders
    await run(`CREATE TABLE IF NOT EXISTS work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      client_id INTEGER NOT NULL,
      car_id INTEGER,
      status TEXT DEFAULT 'created',
      post_number INTEGER,
      mechanic_id INTEGER,
      receptionist_id INTEGER,
      description TEXT,
      total_labor_cost INTEGER DEFAULT 0,
      total_parts_cost INTEGER DEFAULT 0,
      total_amount INTEGER DEFAULT 0,
      paid_amount INTEGER DEFAULT 0,
      invoice_sent INTEGER DEFAULT 0,
      invoice_paid INTEGER DEFAULT 0,
      scheduled_date DATE,
      scheduled_time TIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id),
      FOREIGN KEY (car_id) REFERENCES cars(id),
      FOREIGN KEY (mechanic_id) REFERENCES users(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS work_order_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      price INTEGER NOT NULL,
      total INTEGER GENERATED ALWAYS AS (quantity * price) STORED,
      FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS work_order_parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      part_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      price INTEGER NOT NULL,
      total INTEGER GENERATED ALWAYS AS (quantity * price) STORED,
      FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (part_id) REFERENCES parts(id)
    )`);

    // Cart
    await run(`CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      service_id INTEGER,
      part_id INTEGER,
      quantity INTEGER DEFAULT 1,
      price INTEGER NOT NULL,
      total INTEGER GENERATED ALWAYS AS (quantity * price) STORED,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id),
      FOREIGN KEY (part_id) REFERENCES parts(id)
    )`);

    // Appointments
    await run(`CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      car_id INTEGER,
      service_id INTEGER,
      appointment_type TEXT DEFAULT 'service',
      appointment_date DATE NOT NULL,
      appointment_time TIME NOT NULL,
      post_number INTEGER,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id),
      FOREIGN KEY (car_id) REFERENCES cars(id),
      FOREIGN KEY (service_id) REFERENCES services(id)
    )`);

    // Invoices
    await run(`CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      client_id INTEGER NOT NULL,
      order_id INTEGER,
      amount INTEGER NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      due_date DATE,
      paid_at DATETIME,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id),
      FOREIGN KEY (order_id) REFERENCES work_orders(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    // Payments
    await run(`CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      order_id INTEGER,
      invoice_id INTEGER,
      amount INTEGER NOT NULL,
      payment_method TEXT DEFAULT 'cash',
      status TEXT DEFAULT 'completed',
      transaction_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id),
      FOREIGN KEY (order_id) REFERENCES work_orders(id),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    )`);

    // Notifications
    await run(`CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Activity log
    await run(`CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Wash services
    await run(`CREATE TABLE IF NOT EXISTS wash_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price_from INTEGER NOT NULL,
      price_to INTEGER,
      duration_minutes INTEGER,
      features TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Insert default admin
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@voskanauto.ru';
    const adminExists = await get('SELECT id FROM users WHERE email = ?', [adminEmail]);
    if (!adminExists) {
      const adminHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
      await run('INSERT INTO users (email, password, role, full_name, phone, discount_percent) VALUES (?, ?, ?, ?, ?, ?)',
        [adminEmail, adminHash, 'admin', 'Администратор', '+7 (495) 123-45-67', 0]);
    }

    // Mechanics
    const mechanics = [
      { email: 'semenov@voskanauto.ru', name: 'Семёнов Алексей Владимирович', phone: '+7 (999) 111-22-33' },
      { email: 'kuznetsov@voskanauto.ru', name: 'Кузнецов Павел Сергеевич', phone: '+7 (999) 222-33-44' },
      { email: 'novikov@voskanauto.ru', name: 'Новиков Игорь Романович', phone: '+7 (999) 333-44-55' }
    ];
    for (const m of mechanics) {
      const exists = await get('SELECT id FROM users WHERE email = ?', [m.email]);
      if (!exists) {
        const hash = bcrypt.hashSync('mechanic123', 10);
        await run('INSERT INTO users (email, password, role, full_name, phone, discount_percent) VALUES (?, ?, ?, ?, ?, ?)',
          [m.email, hash, 'mechanic', m.name, m.phone, 0]);
      }
    }

    // Receptionist
    const recExists = await get('SELECT id FROM users WHERE email = ?', ['reception@voskanauto.ru']);
    if (!recExists) {
      const recHash = bcrypt.hashSync('reception123', 10);
      await run('INSERT INTO users (email, password, role, full_name, phone, discount_percent) VALUES (?, ?, ?, ?, ?, ?)',
        ['reception@voskanauto.ru', recHash, 'receptionist', 'Иванова Анна Петровна', '+7 (999) 444-55-66', 0]);
    }

    // Services
    const services = [
      ['TO-001', 'ТО-1 (замена масла + фильтры)', 'ТО', 'Регулярное техническое обслуживание', 1.0, 'Все'],
      ['TO-002', 'ТО-2 (полное)', 'ТО', 'Полное ТО с диагностикой', 3.5, 'Все'],
      ['BRK-001', 'Замена тормозных колодок (перед)', 'Тормозная система', 'Замена передних колодок с притиркой', 1.5, 'Все'],
      ['BRK-002', 'Замена тормозных дисков (перед)', 'Тормозная система', 'Замена и проточка дисков', 2.0, 'Все'],
      ['SUSP-001', 'Замена амортизаторов (1 шт.)', 'Ходовая часть', 'Замена с развалом-схождением', 1.5, 'Все'],
      ['ENG-001', 'Капитальный ремонт ДВС', 'Двигатель', 'Полный капремонт с гарантией', 40.0, 'Все'],
      ['ELEC-001', 'Замена генератора', 'Электрика', 'Диагностика и замена', 2.5, 'Все'],
      ['DIAG-001', 'Компьютерная диагностика', 'Диагностика', 'Полная диагностика всех систем', 0.5, 'Все'],
      ['BRK-003', 'Замена тормозных колодок (зад)', 'Тормозная система', 'Замена задних колодок', 1.5, 'Все'],
      ['SUSP-002', 'Замена рулевых наконечников', 'Ходовая часть', 'С развалом-схождением', 2.0, 'Все'],
      ['AC-001', 'Заправка кондиционера', 'Кондиционер', 'Диагностика утечек + заправка', 1.0, 'Все'],
      ['OIL-001', 'Замена масла в АКПП', 'Трансмиссия', 'Полная замена с фильтром', 2.0, 'Все']
    ];
    for (const s of services) {
      const exists = await get('SELECT id FROM services WHERE code = ?', [s[0]]);
      if (!exists) {
        await run('INSERT INTO services (code, name, category, description, labor_hours, compatible_brands) VALUES (?, ?, ?, ?, ?, ?)',
          [s[0], s[1], s[2], s[3], s[4], s[5]]);
      }
    }

    // Parts
    const parts = [
      ['OIL-5W30-4L', 'Масло моторное 5W-30 (4л)', 'Shell Helix Ultra', 'Масла и жидкости', 'Все', 18, 8, 3200, 4500],
      ['OIL-5W30-1L', 'Масло моторное 5W-30 (1л)', 'Shell Helix', 'Масла и жидкости', 'Все', 2, 10, 850, 1200],
      ['BRK-BOSCH-001', 'Тормозные колодки передние', 'Bosch', 'Тормозная система', 'Все', 1, 5, 1800, 2800],
      ['BRK-DISC-001', 'Тормозные диски передние', 'Brembo', 'Тормозная система', 'Все', 12, 4, 4500, 6500],
      ['FILT-MANN-001', 'Масляный фильтр', 'Mann-Filter', 'Фильтры', 'Все', 3, 15, 450, 750],
      ['FILT-AIR-001', 'Воздушный фильтр', 'Mann-Filter', 'Фильтры', 'Все', 25, 10, 650, 1100],
      ['SUSP-SHOCK-001', 'Амортизаторы задние', 'KYB', 'Ходовая часть', 'Все', 6, 3, 3200, 4800],
      ['ELEC-GEN-001', 'Генератор 12V 90A', 'Bosch', 'Электрика', 'Все', 4, 2, 8500, 12500],
      ['ELEC-SPARK-001', 'Свечи зажигания (компл. 4 шт.)', 'NGK', 'Электрика', 'Все', 20, 8, 1200, 1800],
      ['AC-FR-001', 'Фреон R134a (1кг)', 'DuPont', 'Кондиционер', 'Все', 15, 5, 800, 1200]
    ];
    for (const p of parts) {
      const exists = await get('SELECT id FROM parts WHERE article = ?', [p[0]]);
      if (!exists) {
        await run('INSERT INTO parts (article, name, manufacturer, category, compatible_brands, stock_main, min_stock, purchase_price, sale_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8]]);
      }
    }

    // Wash services
    const washServices = [
      ['WASH-001', 'Комплексная мойка', 'Полный комплекс: кузов, салон, двигатель', 1400, 2500, 60, 'Пылесос салона|Химчистка салона|Мойка двигателя|Полировка кузова|До 2 машин|Зал ожидания'],
      ['WASH-002', 'Химчистка салона', 'Глубокая очистка всех поверхностей', 3500, 5500, 120, 'Чистка сидений|Очистка пластика|Удаление запахов|Обработка кожи|Чистка потолка|Кондиционер кожи'],
      ['WASH-003', 'Полировка кузова', 'Восстановление блеска и защита ЛКП', 5000, 8000, 180, 'Удаление царапин|Устранение помутнений|Восстановление цвета|Нанесение воска|Керамическое покрытие|Гарантия 6 мес'],
      ['WASH-004', 'Кузовной ремонт', 'Полный спектр кузовных работ', 8000, 50000, 240, 'Восстановление геометрии|Покраска|Полировка|Ремонт вмятин|Сварка|Подбор краски'],
      ['WASH-005', 'Мойка двигателя', 'Очистка моторного отсека', 1200, 1800, 30, 'Очистка от масла|Защита электрики|Консервация|Проверка утечек'],
      ['WASH-006', 'Тонировка', 'Профессиональная тонировка стёкол', 3000, 8000, 120, 'Плёнка премиум|Гарантия 5 лет|Снятие старой|Проверка светопропускания']
    ];
    for (const ws of washServices) {
      const exists = await get('SELECT id FROM wash_services WHERE code = ?', [ws[0]]);
      if (!exists) {
        await run('INSERT INTO wash_services (code, name, description, price_from, price_to, duration_minutes, features) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [ws[0], ws[1], ws[2], ws[3], ws[4], ws[5], ws[6]]);
      }
    }

    // Suppliers
    const suppliers = [
      ['ООО «АвтоЗапчасти»', 'Семёнов И.В.', '+7 (495) 777-88-99', 'zakaz@autozap.ru'],
      ['ИП Кузнецов П.С.', 'Кузнецов П.С.', '+7 (495) 666-55-44', 'parts@kuznetsov.ru'],
      ['ООО «МаслоПром»', 'Петров А.Н.', '+7 (495) 555-44-33', 'sales@oilprom.ru']
    ];
    for (const s of suppliers) {
      const exists = await get('SELECT id FROM suppliers WHERE name = ?', [s[0]]);
      if (!exists) {
        await run('INSERT INTO suppliers (name, contact_person, phone, email) VALUES (?, ?, ?, ?)', [s[0], s[1], s[2], s[3]]);
      }
    }

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err.message);
    throw err;
  }
}

// CRUD Helpers (async)
const dbHelpers = {
  // Прямые SQL-запросы (для server.js)
  run: (sql, params) => run(sql, params),
  get: (sql, params) => get(sql, params),
  all: (sql, params) => all(sql, params),

  // Users
  getUserByEmail: (email) => get('SELECT * FROM users WHERE email = ?', [email]),
  getUserById: (id) => get('SELECT * FROM users WHERE id = ?', [id]),

  // Cars
  getClientCars: (clientId) => all('SELECT * FROM cars WHERE client_id = ? ORDER BY created_at DESC', [clientId]),
  addCar: (data) => run('INSERT INTO cars (client_id, brand, model, year, vin, license_plate, mileage, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [data.client_id, data.brand, data.model, data.year, data.vin, data.license_plate, data.mileage, data.color]),

  // Services
  getAllServices: () => all('SELECT * FROM services WHERE is_active = 1 ORDER BY category, name'),
  getServiceById: (id) => get('SELECT * FROM services WHERE id = ?', [id]),
  createService: (data) => run('INSERT INTO services (code, name, category, description, labor_hours, hourly_rate, compatible_brands) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [data.code, data.name, data.category, data.description, data.labor_hours, data.hourly_rate || 2500, data.compatible_brands || 'Все']),
  updateService: (id, data) => run('UPDATE services SET code = ?, name = ?, category = ?, description = ?, labor_hours = ?, hourly_rate = ?, compatible_brands = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [data.code, data.name, data.category, data.description, data.labor_hours, data.hourly_rate, data.compatible_brands, id]),
  deleteService: (id) => run('UPDATE services SET is_active = 0 WHERE id = ?', [id]),
  restoreService: (id) => run('UPDATE services SET is_active = 1 WHERE id = ?', [id]),

  // Parts
  getAllParts: () => all('SELECT * FROM parts WHERE is_active = 1 ORDER BY category, name'),
  getCriticalParts: () => all('SELECT * FROM parts WHERE stock_main <= min_stock AND is_active = 1'),

  // Wash services
  getAllWashServices: () => all('SELECT * FROM wash_services WHERE is_active = 1 ORDER BY price_from'),

  // Work orders
  getWorkOrders: (status) => {
    let sql = `SELECT wo.*, u.full_name as client_name, u.phone as client_phone, c.brand, c.model, c.license_plate
               FROM work_orders wo JOIN users u ON wo.client_id = u.id LEFT JOIN cars c ON wo.car_id = c.id`;
    const params = [];
    if (status && status !== 'all') {
      sql += ' WHERE wo.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY wo.created_at DESC';
    return all(sql, params);
  },
  getWorkOrderById: async (id) => {
    const order = await get(`SELECT wo.*, u.full_name as client_name, u.phone as client_phone, u.email as client_email,
                              c.brand, c.model, c.license_plate, c.vin, c.mileage, m.full_name as mechanic_name
                              FROM work_orders wo JOIN users u ON wo.client_id = u.id
                              LEFT JOIN cars c ON wo.car_id = c.id LEFT JOIN users m ON wo.mechanic_id = m.id
                              WHERE wo.id = ?`, [id]);
    if (order) {
      order.services = await all(`SELECT wos.*, s.name as service_name, s.category FROM work_order_services wos JOIN services s ON wos.service_id = s.id WHERE wos.order_id = ?`, [id]);
      order.parts = await all(`SELECT wop.*, p.name as part_name, p.article, p.manufacturer FROM work_order_parts wop JOIN parts p ON wop.part_id = p.id WHERE wop.order_id = ?`, [id]);
    }
    return order;
  },

  // Cart
  getCartItems: (clientId) => all(`SELECT ci.*, s.name as service_name, s.category, p.name as part_name, p.article
    FROM cart_items ci LEFT JOIN services s ON ci.service_id = s.id LEFT JOIN parts p ON ci.part_id = p.id WHERE ci.client_id = ?`, [clientId]),
  getCartTotal: (clientId) => get('SELECT COALESCE(SUM(total), 0) as total FROM cart_items WHERE client_id = ?', [clientId]),
  clearCart: (clientId) => run('DELETE FROM cart_items WHERE client_id = ?', [clientId]),

  // Appointments
  getAppointments: (clientId) => {
    if (clientId) {
      return all(`SELECT a.*, s.name as service_name, c.brand, c.model, c.license_plate
        FROM appointments a LEFT JOIN services s ON a.service_id = s.id LEFT JOIN cars c ON a.car_id = c.id
        WHERE a.client_id = ? ORDER BY a.appointment_date, a.appointment_time`, [clientId]);
    }
    return all(`SELECT a.*, u.full_name as client_name, u.phone as client_phone, s.name as service_name, c.brand, c.model
      FROM appointments a JOIN users u ON a.client_id = u.id LEFT JOIN services s ON a.service_id = s.id LEFT JOIN cars c ON a.car_id = c.id
      ORDER BY a.appointment_date, a.appointment_time`);
  },

  // Invoices
  getInvoices: (clientId) => {
    if (clientId) {
      return all(`SELECT i.*, u.full_name as client_name FROM invoices i JOIN users u ON i.client_id = u.id WHERE i.client_id = ? ORDER BY i.created_at DESC`, [clientId]);
    }
    return all(`SELECT i.*, u.full_name as client_name, u.email as client_email FROM invoices i JOIN users u ON i.client_id = u.id ORDER BY i.created_at DESC`);
  },

  // Notifications
  getNotifications: (userId) => all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [userId]),
  getUnreadCount: (userId) => get('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', [userId]),
  markRead: (userId) => run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]),
  addNotification: (userId, type, title, message) => run('INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)', [userId, type, title, message]),

  // Stats
  getStats: async () => {
    const today = new Date().toISOString().split('T')[0];
    return {
      revenueToday: (await get('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE DATE(created_at) = ?', [today])).total,
      activeOrders: (await get('SELECT COUNT(*) as count FROM work_orders WHERE status IN ("created", "in_progress", "waiting_parts")')).count,
      postLoad: (await get('SELECT COUNT(*) as count FROM work_orders WHERE status IN ("in_progress", "waiting_parts") AND DATE(scheduled_date) = ?', [today])).count,
      waitingParts: (await get('SELECT COUNT(*) as count FROM work_orders WHERE status = "waiting_parts"')).count,
      totalClients: (await get('SELECT COUNT(*) as count FROM users WHERE role = "client"')).count,
      totalOrders: (await get('SELECT COUNT(*) as count FROM work_orders')).count,
      criticalParts: (await get('SELECT COUNT(*) as count FROM parts WHERE stock_main <= min_stock')).count,
      pendingAppointments: (await get('SELECT COUNT(*) as count FROM appointments WHERE status = "pending"')).count
    };
  },

  // Activity log
  logActivity: (userId, action, entityType, entityId, details) => 
    run('INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, action, entityType, entityId, details])
};

module.exports = { db, initDatabase, dbHelpers };