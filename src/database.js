const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.NODE_ENV === 'production'
    ? '/tmp/voskanauto.db'
    : path.join(__dirname, '..', 'database', 'voskanauto.db');


const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('Ошибка подключения к БД:', err.message);
  else console.log('Подключено к SQLite:', DB_PATH);
});

db.run('PRAGMA foreign_keys = ON');

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
    await run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'client', full_name TEXT NOT NULL, phone TEXT, company_name TEXT,
      inn TEXT, kpp TEXT, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await run(`CREATE TABLE IF NOT EXISTS cars (
      id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, brand TEXT NOT NULL,
      model TEXT NOT NULL, year TEXT, vin TEXT, license_plate TEXT, mileage INTEGER, color TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    await run(`CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general', description TEXT, labor_hours REAL DEFAULT 0,
      hourly_rate REAL DEFAULT 0, compatible_brands TEXT, is_active INTEGER DEFAULT 1,
      is_favorite INTEGER DEFAULT 0, popularity INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await run(`CREATE TABLE IF NOT EXISTS parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, article TEXT NOT NULL, name TEXT NOT NULL,
      manufacturer TEXT, category TEXT, stock_main INTEGER DEFAULT 0, min_stock INTEGER DEFAULT 5,
      purchase_price REAL DEFAULT 0, sale_price REAL DEFAULT 0, popularity INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await run(`CREATE TABLE IF NOT EXISTS work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_number TEXT NOT NULL UNIQUE, client_id INTEGER NOT NULL,
      car_id INTEGER, mechanic_id INTEGER, post_number TEXT, status TEXT DEFAULT 'created',
      description TEXT, total_labor_cost REAL DEFAULT 0, total_parts_cost REAL DEFAULT 0,
      total_amount REAL DEFAULT 0, scheduled_date TEXT, scheduled_time TEXT, invoice_sent INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id), FOREIGN KEY (car_id) REFERENCES cars(id),
      FOREIGN KEY (mechanic_id) REFERENCES users(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS work_order_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, service_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1, price REAL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS work_order_parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, part_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1, price REAL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (part_id) REFERENCES parts(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, car_id INTEGER, service_id INTEGER,
      appointment_date TEXT NOT NULL, appointment_time TEXT, status TEXT DEFAULT 'pending', notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id), FOREIGN KEY (car_id) REFERENCES cars(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_number TEXT NOT NULL UNIQUE, client_id INTEGER NOT NULL,
      order_id INTEGER, amount REAL NOT NULL, description TEXT, status TEXT DEFAULT 'pending',
      due_date TEXT, paid_at TIMESTAMP, created_by INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id), FOREIGN KEY (order_id) REFERENCES work_orders(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, invoice_id INTEGER, order_id INTEGER,
      amount REAL NOT NULL, payment_method TEXT DEFAULT 'cash', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id), FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, service_id INTEGER, part_id INTEGER,
      quantity INTEGER DEFAULT 1, price REAL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL,
      title TEXT NOT NULL, message TEXT NOT NULL, is_read INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, action TEXT NOT NULL,
      entity_type TEXT, entity_id INTEGER, details TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, contact TEXT, email TEXT,
      phone TEXT, address TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await run(`CREATE TABLE IF NOT EXISTS user_themes (
      user_id INTEGER PRIMARY KEY, theme TEXT DEFAULT 'light', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    await run(`CREATE TABLE IF NOT EXISTS order_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      action TEXT NOT NULL, old_value TEXT, new_value TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS order_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      text TEXT NOT NULL, is_internal INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, client_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5), text TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES users(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS order_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, type TEXT NOT NULL,
      filename TEXT NOT NULL, original_name TEXT, uploaded_by INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, user_id INTEGER NOT NULL,
      text TEXT NOT NULL, remind_at TEXT NOT NULL, status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, error TEXT NOT NULL, stack TEXT, url TEXT,
      method TEXT, user_id INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      user_id INTEGER PRIMARY KEY, subscription TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    await run(`CREATE TABLE IF NOT EXISTS wash_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT,
      price REAL DEFAULT 0, duration_minutes INTEGER DEFAULT 30, is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await run('CREATE INDEX IF NOT EXISTS idx_orders_client ON work_orders(client_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_orders_status ON work_orders(status)');
    await run('CREATE INDEX IF NOT EXISTS idx_history_order ON order_history(order_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_comments_order ON order_comments(order_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_reviews_order ON reviews(order_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_photos_order ON order_photos(order_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_cars_client ON cars(client_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_services_category ON services(category)');
    await run('CREATE INDEX IF NOT EXISTS idx_parts_category ON parts(category)');

    await seedDemoData();
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database init error:', err);
    throw err;
  }
}

async function seedDemoData() {
  const bcrypt = require('bcryptjs');

  const adminExists = await get('SELECT id FROM users WHERE email = ?', ['admin@voskanauto.ru']);
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    await run('INSERT INTO users (email, password, role, full_name, phone) VALUES (?, ?, ?, ?, ?)',
      ['admin@voskanauto.ru', hash, 'admin', 'Администратор', '+7 (999) 000-00-00']);
  }

  const mechanicExists = await get('SELECT id FROM users WHERE email = ?', ['semenov@voskanauto.ru']);
  if (!mechanicExists) {
    const hash = bcrypt.hashSync('mechanic123', 10);
    await run('INSERT INTO users (email, password, role, full_name, phone) VALUES (?, ?, ?, ?, ?)',
      ['semenov@voskanauto.ru', hash, 'mechanic', 'Семенов А.В.', '+7 (999) 111-11-11']);
  }

  const serviceCount = await get('SELECT COUNT(*) as count FROM services');
  if (serviceCount.count === 0) {
    const demoServices = [
      { code: 'DIAG-001', name: 'Компьютерная диагностика', category: 'Диагностика', description: 'Полная диагностика всех систем автомобиля с использованием сканера', labor_hours: 1, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 95 },
      { code: 'DIAG-002', name: 'Диагностика ходовой части', category: 'Диагностика', description: 'Проверка амортизаторов, рычагов, сайлентблоков, шаровых опор', labor_hours: 0.8, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 78 },
      { code: 'DIAG-003', name: 'Диагностика двигателя', category: 'Диагностика', description: 'Компрессия, утечки, работа форсунок, состояние свечей', labor_hours: 1.5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 88 },
      { code: 'DIAG-004', name: 'Диагностика тормозной системы', category: 'Диагностика', description: 'Толщина дисков и колодок, герметичность системы', labor_hours: 0.5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 72 },
      { code: 'TO-001', name: 'ТО-1 (10 000 км)', category: 'ТО', description: 'Замена масла, фильтра, проверка всех систем', labor_hours: 1, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 100 },
      { code: 'TO-002', name: 'ТО-2 (20 000 км)', category: 'ТО', description: 'ТО-1 + замена воздушного и салонного фильтров', labor_hours: 1.5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 92 },
      { code: 'TO-003', name: 'ТО-3 (30 000 км)', category: 'ТО', description: 'ТО-2 + замена свечей, проверка тормозов', labor_hours: 2, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 85 },
      { code: 'TO-004', name: 'ТО-4 (40 000 км)', category: 'ТО', description: 'ТО-3 + замена тормозной жидкости, антифриза', labor_hours: 2.5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 80 },
      { code: 'TO-005', name: 'ТО-5 (50 000 км)', category: 'ТО', description: 'ТО-4 + замена ремня ГРМ, роликов', labor_hours: 4, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 75 },
      { code: 'TO-006', name: 'ТО-6 (60 000 км)', category: 'ТО', description: 'ТО-5 + замена топливного фильтра, свечей', labor_hours: 3, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 70 },
      { code: 'BRAKE-001', name: 'Замена передних тормозных колодок', category: 'Тормозная система', description: 'Снятие колес, замена колодок, проверка дисков', labor_hours: 1, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 90 },
      { code: 'BRAKE-002', name: 'Замена задних тормозных колодок', category: 'Тормозная система', description: 'Замена задних колодок (барабан/диск)', labor_hours: 1.2, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 82 },
      { code: 'BRAKE-003', name: 'Замена тормозных дисков', category: 'Тормозная система', description: 'Замена дисков + колодок, прокачка системы', labor_hours: 1.5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 76 },
      { code: 'BRAKE-004', name: 'Замена тормозной жидкости', category: 'Тормозная система', description: 'Полная замена жидкости с прокачкой', labor_hours: 1, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 68 },
      { code: 'BRAKE-005', name: 'Замена тормозных шлангов', category: 'Тормозная система', description: 'Замена гибких шлангов, проверка герметичности', labor_hours: 1.5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 55 },
      { code: 'SUS-001', name: 'Замена амортизаторов', category: 'Ходовая часть', description: 'Замена передних/задних амортизаторов', labor_hours: 2, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 74 },
      { code: 'SUS-002', name: 'Замена сайлентблоков', category: 'Ходовая часть', description: 'Замена сайлентблоков рычагов', labor_hours: 2.5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 62 },
      { code: 'SUS-003', name: 'Замена шаровых опор', category: 'Ходовая часть', description: 'Замена шаровых опор передних рычагов', labor_hours: 2, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 66 },
      { code: 'SUS-004', name: 'Замена рулевых наконечников', category: 'Ходовая часть', description: 'Замена наконечников, сход-развал', labor_hours: 1.5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 58 },
      { code: 'SUS-005', name: 'Замена стоек стабилизатора', category: 'Ходовая часть', description: 'Замена втулок и стоек стабилизатора', labor_hours: 1, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 64 },
      { code: 'SUS-006', name: 'Сход-развал', category: 'Ходовая часть', description: 'Настройка углов установки колёс', labor_hours: 1, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 86 },
      { code: 'ENG-001', name: 'Замена масла ДВС', category: 'Двигатель', description: 'Слив старого, залив нового масла + фильтр', labor_hours: 0.5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 98 },
      { code: 'ENG-002', name: 'Замена свечей зажигания', category: 'Двигатель', description: 'Замена 4 свечей, проверка зазоров', labor_hours: 0.8, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 84 },
      { code: 'ENG-003', name: 'Замена ремня ГРМ', category: 'Двигатель', description: 'Замена ремня, роликов, помпы', labor_hours: 4, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 71 },
      { code: 'ENG-004', name: 'Чистка форсунок', category: 'Двигатель', description: 'Ультразвуковая чистка инжектора', labor_hours: 2, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 69 },
      { code: 'ENG-005', name: 'Замена прокладки ГБЦ', category: 'Двигатель', description: 'Снятие/установка ГБЦ, замена прокладки', labor_hours: 6, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 52 },
      { code: 'ENG-006', name: 'Замена цепи ГРМ', category: 'Двигатель', description: 'Замена цепи, успокоителей, натяжителя', labor_hours: 5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 60 },
      { code: 'ELEC-001', name: 'Замена аккумулятора', category: 'Электрика', description: 'Диагностика, подбор, установка АКБ', labor_hours: 0.3, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 89 },
      { code: 'ELEC-002', name: 'Замена генератора', category: 'Электрика', description: 'Диагностика, замена генератора', labor_hours: 1.5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 56 },
      { code: 'ELEC-003', name: 'Ремонт стартера', category: 'Электрика', description: 'Разборка, замена щёток, обмотки', labor_hours: 2, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 48 },
      { code: 'ELEC-004', name: 'Установка сигнализации', category: 'Электрика', description: 'Установка автосигнализации с автозапуском', labor_hours: 3, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 77 },
      { code: 'ELEC-005', name: 'Замена ламп освещения', category: 'Электрика', description: 'Замена ламп ближнего/дальнего света', labor_hours: 0.3, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 91 },
      { code: 'TRANS-001', name: 'Замена масла АКПП', category: 'Трансмиссия', description: 'Частичная/полная замена масла АКПП', labor_hours: 1.5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 73 },
      { code: 'TRANS-002', name: 'Замена сцепления', category: 'Трансмиссия', description: 'Замена диска, корзины, выжимного подшипника', labor_hours: 4, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 67 },
      { code: 'TRANS-003', name: 'Замена масла МКПП', category: 'Трансмиссия', description: 'Замена масла в механической коробке', labor_hours: 0.5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 65 },
      { code: 'TRANS-004', name: 'Замена ШРУС', category: 'Трансмиссия', description: 'Замена наружного/внутреннего ШРУС', labor_hours: 2, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 59 },
      { code: 'AC-001', name: 'Заправка кондиционера', category: 'Кондиционер', description: 'Диагностика утечек, заправка фреоном', labor_hours: 1, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 87 },
      { code: 'AC-002', name: 'Ремонт кондиционера', category: 'Кондиционер', description: 'Поиск и устранение утечек, замена компрессора', labor_hours: 3, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 54 },
      { code: 'AC-003', name: 'Замена фильтра салона', category: 'Кондиционер', description: 'Замена фильтра, дезинфекция системы', labor_hours: 0.3, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 83 },
      { code: 'EXH-001', name: 'Замена глушителя', category: 'Выхлопная система', description: 'Замена глушителя/резонатора', labor_hours: 1.5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 61 },
      { code: 'EXH-002', name: 'Замена катализатора', category: 'Выхлопная система', description: 'Замена катализатора, установка пламегасителя', labor_hours: 2, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 47 },
      { code: 'EXH-003', name: 'Сварка выхлопа', category: 'Выхлопная система', description: 'Сварка трещин, замена участков трубы', labor_hours: 2, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 53 },
      { code: 'OPT-001', name: 'Замена фары', category: 'Оптика', description: 'Замена блок-фары, настройка', labor_hours: 1, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 63 },
      { code: 'OPT-002', name: 'Полировка фар', category: 'Оптика', description: 'Восстановление прозрачности фар', labor_hours: 1, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 79 },
      { code: 'OPT-003', name: 'Регулировка фар', category: 'Оптика', description: 'Настройка угла наклона фар', labor_hours: 0.5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 57 },
      { code: 'GLASS-001', name: 'Замена лобового стекла', category: 'Стёкла', description: 'Демонтаж/монтаж стекла, установка молдинга', labor_hours: 2, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 51 },
      { code: 'GLASS-002', name: 'Ремонт скола', category: 'Стёкла', description: 'Заполнение скола полимером', labor_hours: 0.5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 81 },
      { code: 'GLASS-003', name: 'Тонирование стёкол', category: 'Стёкла', description: 'Тонировка боковых/заднего стекла', labor_hours: 2, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 75 },
      { code: 'STEER-001', name: 'Замена рулевой рейки', category: 'Рулевое управление', description: 'Замена рейки, настройка сход-развала', labor_hours: 3, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 49 },
      { code: 'STEER-002', name: 'Замена насоса ГУР', category: 'Рулевое управление', description: 'Замена насоса, прокачка системы', labor_hours: 2, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 46 },
      { code: 'STEER-003', name: 'Замена рулевого наконечника', category: 'Рулевое управление', description: 'Замена наконечника, регулировка', labor_hours: 1, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 50 },
      { code: 'ANT-001', name: 'Антикоррозийная обработка', category: 'Антикор', description: 'Обработка днища, арок, скрытых полостей', labor_hours: 3, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 44 },
      { code: 'ANT-002', name: 'Пескоструйная обработка', category: 'Антикор', description: 'Очистка поверхности перед покраской', labor_hours: 4, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 38 },
      { code: 'FUEL-001', name: 'Замена топливного фильтра', category: 'Топливная система', description: 'Замена фильтра, проверка давления', labor_hours: 1, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 70 },
      { code: 'FUEL-002', name: 'Чистка инжектора', category: 'Топливная система', description: 'Ультразвуковая чистка форсунок', labor_hours: 2, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 68 },
      { code: 'FUEL-003', name: 'Замена бензонасоса', category: 'Топливная система', description: 'Замена насоса в баке, проверка давления', labor_hours: 2, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 42 },
      { code: 'TIRE-001', name: 'Шиномонтаж (4 колеса)', category: 'Шиномонтаж', description: 'Бортировка, балансировка, установка', labor_hours: 1, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 93 },
      { code: 'TIRE-002', name: 'Балансировка колеса', category: 'Шиномонтаж', description: 'Балансировка одного колеса', labor_hours: 0.3, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 85 },
      { code: 'TIRE-003', name: 'Ремонт прокола', category: 'Шиномонтаж', description: 'Грибок/латка, балансировка', labor_hours: 0.5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 90 },
      { code: 'TIRE-004', name: 'Переобувка на сезон', category: 'Шиномонтаж', description: 'Снятие/установка, балансировка 4 колёс', labor_hours: 1, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 96 },
      { code: 'WASH-001', name: 'Экспресс-мойка', category: 'Автомойки', description: 'Мойка кузова, сушка', labor_hours: 0.3, hourly_rate: 1500, compatible_brands: 'Все марки', popularity: 94 },
      { code: 'WASH-002', name: 'Комплексная мойка', category: 'Автомойки', description: 'Кузов + пылесос салона + протирка панели', labor_hours: 0.8, hourly_rate: 1500, compatible_brands: 'Все марки', popularity: 88 },
      { code: 'WASH-003', name: 'Детейлинг-мойка', category: 'Автомойки', description: 'Глубокая очистка, воск, защита', labor_hours: 1.5, hourly_rate: 1500, compatible_brands: 'Все марки', popularity: 78 },
      { code: 'WASH-004', name: 'Химчистка салона', category: 'Автомойки', description: 'Химчистка сидений, ковров, потолка', labor_hours: 3, hourly_rate: 1500, compatible_brands: 'Все марки', popularity: 72 },
      { code: 'BODY-001', name: 'Покраска элемента', category: 'Кузовной ремонт', description: 'Подготовка, покраска, полировка одного элемента', labor_hours: 4, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 65 },
      { code: 'BODY-002', name: 'Удаление вмятин', category: 'Кузовной ремонт', description: 'PDR удаление вмятин без покраски', labor_hours: 2, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 74 },
      { code: 'BODY-003', name: 'Полировка кузова', category: 'Кузовной ремонт', description: 'Восстановительная полировка ЛКП', labor_hours: 3, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 80 },
      { code: 'BODY-004', name: 'Защитная плёнка', category: 'Кузовной ремонт', description: 'Оклейка переднего бампера, капота, крыльев', labor_hours: 4, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 58 },
      { code: 'INFO-001', name: 'Консультация механика', category: 'Инфо', description: 'Осмотр автомобиля, рекомендации', labor_hours: 0.5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 45 },
      { code: 'INFO-002', name: 'Предпродажная подготовка', category: 'Инфо', description: 'Комплексная подготовка к продаже', labor_hours: 5, hourly_rate: 2500, compatible_brands: 'Все марки', popularity: 40 }
    ];

    for (const s of demoServices) {
      await run('INSERT INTO services (code, name, category, description, labor_hours, hourly_rate, compatible_brands, popularity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [s.code, s.name, s.category, s.description, s.labor_hours, s.hourly_rate, s.compatible_brands, s.popularity]);
    }
  }

  const partCount = await get('SELECT COUNT(*) as count FROM parts');
  if (partCount.count === 0) {
    const demoParts = [
      { article: 'OIL-5W30', name: 'Масло моторное 5W-30 4л', manufacturer: 'Castrol', category: 'Масла и жидкости', stock_main: 45, min_stock: 10, purchase_price: 2800, sale_price: 3500, popularity: 95 },
      { article: 'OIL-5W40', name: 'Масло моторное 5W-40 4л', manufacturer: 'Liqui Moly', category: 'Масла и жидкости', stock_main: 32, min_stock: 10, purchase_price: 3200, sale_price: 4000, popularity: 88 },
      { article: 'FILTER-OIL', name: 'Фильтр масляный', manufacturer: 'Mann', category: 'Фильтры', stock_main: 120, min_stock: 20, purchase_price: 350, sale_price: 500, popularity: 92 },
      { article: 'FILTER-AIR', name: 'Фильтр воздушный', manufacturer: 'Mann', category: 'Фильтры', stock_main: 85, min_stock: 15, purchase_price: 400, sale_price: 600, popularity: 85 },
      { article: 'FILTER-CABIN', name: 'Фильтр салона', manufacturer: 'Mann', category: 'Фильтры', stock_main: 60, min_stock: 15, purchase_price: 450, sale_price: 700, popularity: 80 },
      { article: 'BRAKE-PAD-F', name: 'Тормозные колодки передние', manufacturer: 'Brembo', category: 'Тормозная система', stock_main: 40, min_stock: 10, purchase_price: 2200, sale_price: 3200, popularity: 90 },
      { article: 'BRAKE-PAD-R', name: 'Тормозные колодки задние', manufacturer: 'Brembo', category: 'Тормозная система', stock_main: 35, min_stock: 10, purchase_price: 2000, sale_price: 2900, popularity: 82 },
      { article: 'BRAKE-DISC-F', name: 'Тормозной диск передний', manufacturer: 'Brembo', category: 'Тормозная система', stock_main: 28, min_stock: 8, purchase_price: 2800, sale_price: 4000, popularity: 76 },
      { article: 'SPARK-PLUG', name: 'Свеча зажигания (комплект 4 шт)', manufacturer: 'NGK', category: 'Двигатель', stock_main: 50, min_stock: 12, purchase_price: 1200, sale_price: 1800, popularity: 87 },
      { article: 'BATTERY-60', name: 'Аккумулятор 60 Ah', manufacturer: 'Varta', category: 'Электрика', stock_main: 18, min_stock: 5, purchase_price: 5500, sale_price: 7500, popularity: 78 },
      { article: 'BATTERY-75', name: 'Аккумулятор 75 Ah', manufacturer: 'Varta', category: 'Электрика', stock_main: 15, min_stock: 5, purchase_price: 6800, sale_price: 9000, popularity: 72 },
      { article: 'WIPER-24', name: 'Щётка стеклоочистителя 24"', manufacturer: 'Bosch', category: 'Стёкла', stock_main: 40, min_stock: 10, purchase_price: 600, sale_price: 900, popularity: 84 },
      { article: 'WIPER-20', name: 'Щётка стеклоочистителя 20"', manufacturer: 'Bosch', category: 'Стёкла', stock_main: 35, min_stock: 10, purchase_price: 550, sale_price: 850, popularity: 79 },
      { article: 'TIRE-205-55', name: 'Шина 205/55 R16 летняя', manufacturer: 'Michelin', category: 'Шины', stock_main: 24, min_stock: 8, purchase_price: 5200, sale_price: 7000, popularity: 91 },
      { article: 'TIRE-195-65', name: 'Шина 195/65 R15 летняя', manufacturer: 'Continental', category: 'Шины', stock_main: 20, min_stock: 8, purchase_price: 4800, sale_price: 6500, popularity: 86 },
      { article: 'ANTIFREEZE-5', name: 'Антифриз G12 5л', manufacturer: 'Liqui Moly', category: 'Масла и жидкости', stock_main: 30, min_stock: 10, purchase_price: 1500, sale_price: 2200, popularity: 75 },
      { article: 'BRAKE-FLUID', name: 'Тормозная жидкость DOT-4 1л', manufacturer: 'Castrol', category: 'Масла и жидкости', stock_main: 25, min_stock: 8, purchase_price: 400, sale_price: 600, popularity: 68 },
      { article: 'SHOCK-F', name: 'Амортизатор передний', manufacturer: 'KYB', category: 'Ходовая часть', stock_main: 12, min_stock: 5, purchase_price: 3500, sale_price: 5000, popularity: 65 },
      { article: 'SHOCK-R', name: 'Амортизатор задний', manufacturer: 'KYB', category: 'Ходовая часть', stock_main: 10, min_stock: 5, purchase_price: 3200, sale_price: 4600, popularity: 62 },
      { article: 'BALL-JOINT', name: 'Шаровая опора', manufacturer: 'Lemförder', category: 'Ходовая часть', stock_main: 22, min_stock: 8, purchase_price: 800, sale_price: 1200, popularity: 58 },
      { article: 'TIE-ROD', name: 'Рулевой наконечник', manufacturer: 'Lemförder', category: 'Рулевое управление', stock_main: 18, min_stock: 6, purchase_price: 900, sale_price: 1400, popularity: 55 },
      { article: 'BELT-AC', name: 'Ремень генератора/кондиционера', manufacturer: 'Continental', category: 'Двигатель', stock_main: 30, min_stock: 10, purchase_price: 500, sale_price: 800, popularity: 70 },
      { article: 'AC-REFILL', name: 'Фреон R134a 1кг', manufacturer: 'Honeywell', category: 'Кондиционер', stock_main: 15, min_stock: 5, purchase_price: 1200, sale_price: 1800, popularity: 74 },
      { article: 'MUFFLER', name: 'Глушитель универсальный', manufacturer: 'Polmostrow', category: 'Выхлопная система', stock_main: 8, min_stock: 3, purchase_price: 2500, sale_price: 3800, popularity: 52 },
      { article: 'CATALYST', name: 'Катализатор универсальный', manufacturer: 'Eberspächer', category: 'Выхлопная система', stock_main: 5, min_stock: 2, purchase_price: 8000, sale_price: 12000, popularity: 45 },
      { article: 'HEADLIGHT-L', name: 'Фара левая (дефолт)', manufacturer: 'TYC', category: 'Оптика', stock_main: 6, min_stock: 3, purchase_price: 4500, sale_price: 6500, popularity: 60 },
      { article: 'HEADLIGHT-R', name: 'Фара правая (дефолт)', manufacturer: 'TYC', category: 'Оптика', stock_main: 6, min_stock: 3, purchase_price: 4500, sale_price: 6500, popularity: 60 },
      { article: 'WINDSHIELD', name: 'Лобовое стекло (дефолт)', manufacturer: 'Pilkington', category: 'Стёкла', stock_main: 3, min_stock: 2, purchase_price: 6000, sale_price: 9000, popularity: 48 },
      { article: 'CLUTCH-KIT', name: 'Комплект сцепления', manufacturer: 'LUK', category: 'Трансмиссия', stock_main: 7, min_stock: 3, purchase_price: 5500, sale_price: 8000, popularity: 56 },
      { article: 'FUEL-PUMP', name: 'Бензонасос в сборе', manufacturer: 'Bosch', category: 'Топливная система', stock_main: 6, min_stock: 3, purchase_price: 4000, sale_price: 6000, popularity: 50 },
      { article: 'WAX-PROTECT', name: 'Восковая защита кузова', manufacturer: 'Meguiars', category: 'Автокосметика', stock_main: 20, min_stock: 8, purchase_price: 800, sale_price: 1300, popularity: 73 },
      { article: 'POLISH-PASTE', name: 'Полировальная паста', manufacturer: '3M', category: 'Автокосметика', stock_main: 15, min_stock: 5, purchase_price: 600, sale_price: 1000, popularity: 69 },
      { article: 'ARMREST', name: 'Подлокотник универсальный', manufacturer: 'AutoStyle', category: 'Аксессуары', stock_main: 12, min_stock: 5, purchase_price: 1500, sale_price: 2500, popularity: 64 },
      { article: 'FLOOR-MATS', name: 'Коврики в салон 3D', manufacturer: 'Novline', category: 'Аксессуары', stock_main: 20, min_stock: 8, purchase_price: 2500, sale_price: 4000, popularity: 77 },
      { article: 'TRUNK-MAT', name: 'Коврик в багажник', manufacturer: 'Novline', category: 'Аксессуары', stock_main: 15, min_stock: 5, purchase_price: 1200, sale_price: 2000, popularity: 71 },
      { article: 'CAR-COVER', name: 'Чехол на автомобиль', manufacturer: 'Garage', category: 'Аксессуары', stock_main: 8, min_stock: 3, purchase_price: 3000, sale_price: 5000, popularity: 53 },
      { article: 'DASH-CAM', name: 'Видеорегистратор Full HD', manufacturer: 'Xiaomi', category: 'Электроника', stock_main: 10, min_stock: 5, purchase_price: 3500, sale_price: 5500, popularity: 82 },
      { article: 'GPS-TRACKER', name: 'GPS-трекер автомобильный', manufacturer: 'StarLine', category: 'Электроника', stock_main: 8, min_stock: 3, purchase_price: 4000, sale_price: 6500, popularity: 67 },
      { article: 'SEAT-COVER', name: 'Чехлы на сиденья (экокожа)', manufacturer: 'Autoprofi', category: 'Аксессуары', stock_main: 6, min_stock: 3, purchase_price: 5000, sale_price: 8000, popularity: 59 },
      { article: 'ALARM-SYS', name: 'Автосигнализация с автозапуском', manufacturer: 'StarLine', category: 'Электроника', stock_main: 5, min_stock: 2, purchase_price: 12000, sale_price: 18000, popularity: 75 },
      { article: 'LED-LIGHT', name: 'LED-лампы H7 (комплект)', manufacturer: 'Osram', category: 'Оптика', stock_main: 15, min_stock: 5, purchase_price: 2000, sale_price: 3200, popularity: 81 },
      { article: 'CAR-PHONE', name: 'Держатель для телефона', manufacturer: 'Baseus', category: 'Аксессуары', stock_main: 25, min_stock: 10, purchase_price: 400, sale_price: 700, popularity: 89 },
      { article: 'AIR-FRESH', name: 'Ароматизатор воздуха', manufacturer: 'Little Trees', category: 'Аксессуары', stock_main: 50, min_stock: 20, purchase_price: 100, sale_price: 200, popularity: 93 }
    ];

    for (const p of demoParts) {
      await run('INSERT INTO parts (article, name, manufacturer, category, stock_main, min_stock, purchase_price, sale_price, popularity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [p.article, p.name, p.manufacturer, p.category, p.stock_main, p.min_stock, p.purchase_price, p.sale_price, p.popularity]);
    }
  }

  const washCount = await get('SELECT COUNT(*) as count FROM wash_services');
  if (washCount.count === 0) {
    const demoWash = [
      { name: 'Экспресс-мойка', description: 'Быстрая мойка кузова, сушка', price: 500, duration_minutes: 15 },
      { name: 'Комплексная мойка', description: 'Мойка кузова + пылесос салона + протирка панели', price: 1200, duration_minutes: 30 },
      { name: 'Детейлинг-мойка', description: 'Глубокая очистка, воск, защита ЛКП', price: 2500, duration_minutes: 60 },
      { name: 'Химчистка салона', description: 'Полная химчистка сидений, ковров, потолка', price: 4500, duration_minutes: 120 },
      { name: 'Мойка двигателя', description: 'Очистка моторного отсека паром', price: 1500, duration_minutes: 30 }
    ];
    for (const w of demoWash) {
      await run('INSERT INTO wash_services (name, description, price, duration_minutes) VALUES (?, ?, ?, ?)',
        [w.name, w.description, w.price, w.duration_minutes]);
    }
  }
}

const dbHelpers = {
  get, all, run,

  getUserById: (id) => get('SELECT * FROM users WHERE id = ?', [id]),
  getUserByEmail: (email) => get('SELECT * FROM users WHERE email = ?', [email]),

  getClientCars: (clientId) => all('SELECT * FROM cars WHERE client_id = ? ORDER BY created_at DESC', [clientId]),
  addCar: ({ client_id, brand, model, year, vin, license_plate, mileage, color }) => {
    return run('INSERT INTO cars (client_id, brand, model, year, vin, license_plate, mileage, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [client_id, brand, model, year, vin, license_plate, mileage, color]);
  },

  getAllServices: () => all('SELECT * FROM services WHERE is_active = 1 ORDER BY popularity DESC, name'),
  getPopularServices: (limit = 6) => all('SELECT * FROM services WHERE is_active = 1 ORDER BY popularity DESC LIMIT ?', [limit]),
  getAllWashServices: () => all('SELECT * FROM wash_services WHERE is_active = 1 ORDER BY price'),
  createService: ({ code, name, category, description, labor_hours, hourly_rate, compatible_brands }) => {
    return run('INSERT INTO services (code, name, category, description, labor_hours, hourly_rate, compatible_brands) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [code, name, category, description, labor_hours, hourly_rate, compatible_brands]);
  },
  updateService: (id, { code, name, category, description, labor_hours, hourly_rate, compatible_brands }) => {
    return run('UPDATE services SET code = ?, name = ?, category = ?, description = ?, labor_hours = ?, hourly_rate = ?, compatible_brands = ? WHERE id = ?',
      [code, name, category, description, labor_hours, hourly_rate, compatible_brands, id]);
  },
  deleteService: (id) => run('UPDATE services SET is_active = 0 WHERE id = ?', [id]),
  restoreService: (id) => run('UPDATE services SET is_active = 1 WHERE id = ?', [id]),

  getAllParts: () => all('SELECT * FROM parts ORDER BY popularity DESC, name'),
  getPopularParts: (limit = 6) => all('SELECT * FROM parts ORDER BY popularity DESC LIMIT ?', [limit]),
  getCriticalParts: () => all('SELECT * FROM parts WHERE stock_main <= min_stock ORDER BY stock_main'),

  getWorkOrders: (status = 'all') => {
    if (status === 'all') {
      return all('SELECT wo.*, u.full_name as client_name, c.brand, c.model, c.license_plate FROM work_orders wo JOIN users u ON wo.client_id = u.id LEFT JOIN cars c ON wo.car_id = c.id ORDER BY wo.created_at DESC');
    }
    return all('SELECT wo.*, u.full_name as client_name, c.brand, c.model, c.license_plate FROM work_orders wo JOIN users u ON wo.client_id = u.id LEFT JOIN cars c ON wo.car_id = c.id WHERE wo.status = ? ORDER BY wo.created_at DESC', [status]);
  },
  getWorkOrderById: (id) => {
    return get('SELECT wo.*, u.full_name as client_name, u.phone as client_phone, u.email as client_email, c.brand, c.model, c.license_plate, c.vin, c.year, c.mileage, c.color, m.full_name as mechanic_name FROM work_orders wo JOIN users u ON wo.client_id = u.id LEFT JOIN cars c ON wo.car_id = c.id LEFT JOIN users m ON wo.mechanic_id = m.id WHERE wo.id = ?', [id]);
  },

  getCartItems: (clientId) => {
    return all(`
      SELECT ci.*, s.name as service_name, s.labor_hours, s.hourly_rate, s.category as service_category, p.name as part_name, p.article as part_article, p.category as part_category
      FROM cart_items ci
      LEFT JOIN services s ON ci.service_id = s.id
      LEFT JOIN parts p ON ci.part_id = p.id
      WHERE ci.client_id = ?
      ORDER BY ci.created_at DESC
    `, [clientId]);
  },
  getCartTotal: (clientId) => {
    return get('SELECT COALESCE(SUM(price * quantity), 0) as total FROM cart_items WHERE client_id = ?', [clientId]);
  },
  clearCart: (clientId) => run('DELETE FROM cart_items WHERE client_id = ?', [clientId]),

  getAppointments: (clientId = null) => {
    if (clientId) {
      return all('SELECT a.*, s.name as service_name, c.brand, c.model, c.license_plate FROM appointments a LEFT JOIN services s ON a.service_id = s.id LEFT JOIN cars c ON a.car_id = c.id WHERE a.client_id = ? ORDER BY a.appointment_date DESC, a.appointment_time DESC', [clientId]);
    }
    return all('SELECT a.*, u.full_name as client_name, s.name as service_name, c.brand, c.model, c.license_plate FROM appointments a JOIN users u ON a.client_id = u.id LEFT JOIN services s ON a.service_id = s.id LEFT JOIN cars c ON a.car_id = c.id ORDER BY a.appointment_date DESC, a.appointment_time DESC');
  },

  getInvoices: (clientId = null) => {
    if (clientId) {
      return all('SELECT i.*, wo.order_number FROM invoices i LEFT JOIN work_orders wo ON i.order_id = wo.id WHERE i.client_id = ? ORDER BY i.created_at DESC', [clientId]);
    }
    return all('SELECT i.*, u.full_name as client_name, wo.order_number FROM invoices i JOIN users u ON i.client_id = u.id LEFT JOIN work_orders wo ON i.order_id = wo.id ORDER BY i.created_at DESC');
  },

  getNotifications: (userId) => all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [userId]),
  getUnreadCount: (userId) => get('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', [userId]),
  addNotification: (userId, type, title, message) => {
    return run('INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)', [userId, type, title, message]);
  },
  markRead: (userId) => run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]),

  logActivity: (userId, action, entityType, entityId, details) => {
    return run('INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, action, entityType, entityId, details]);
  },

  getStats: async () => {
    const totalClients = await get('SELECT COUNT(*) as count FROM users WHERE role = "client"');
    const totalOrders = await get('SELECT COUNT(*) as count FROM work_orders');
    const pendingOrders = await get('SELECT COUNT(*) as count FROM work_orders WHERE status IN ("created", "in_progress")');
    const completedOrders = await get('SELECT COUNT(*) as count FROM work_orders WHERE status = "completed"');
    const totalRevenue = await get('SELECT COALESCE(SUM(amount), 0) as total FROM payments');
    const todayRevenue = await get('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE DATE(created_at) = DATE("now")');
    const totalParts = await get('SELECT COUNT(*) as count FROM parts');
    const criticalParts = await get('SELECT COUNT(*) as count FROM parts WHERE stock_main <= min_stock');
    const totalServices = await get('SELECT COUNT(*) as count FROM services WHERE is_active = 1');
    const avgRating = await get('SELECT COALESCE(AVG(rating), 0) as avg FROM reviews');
    const totalReviews = await get('SELECT COUNT(*) as count FROM reviews');

    return {
      totalClients: totalClients.count, totalOrders: totalOrders.count, pendingOrders: pendingOrders.count,
      completedOrders: completedOrders.count, totalRevenue: totalRevenue.total, todayRevenue: todayRevenue.total,
      totalParts: totalParts.count, criticalParts: criticalParts.count, totalServices: totalServices.count,
      avgRating: avgRating.avg, totalReviews: totalReviews.count
    };
  },

  setUserTheme: (userId, theme) => {
    return run('INSERT INTO user_themes (user_id, theme) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET theme = ?, updated_at = CURRENT_TIMESTAMP',
      [userId, theme, theme]);
  },
  getUserTheme: (userId) => get('SELECT theme FROM user_themes WHERE user_id = ?', [userId]),

  addOrderHistory: (orderId, userId, action, oldValue, newValue) => {
    return run('INSERT INTO order_history (order_id, user_id, action, old_value, new_value) VALUES (?, ?, ?, ?, ?)',
      [orderId, userId, action, oldValue || null, newValue || null]);
  },
  getOrderHistory: (orderId) => {
    return all(`SELECT oh.*, u.full_name as user_name, u.role as user_role FROM order_history oh JOIN users u ON oh.user_id = u.id WHERE oh.order_id = ? ORDER BY oh.created_at DESC`, [orderId]);
  },

  addOrderComment: (orderId, userId, text, isInternal) => {
    return run('INSERT INTO order_comments (order_id, user_id, text, is_internal) VALUES (?, ?, ?, ?)', [orderId, userId, text, isInternal || 0]);
  },
  getOrderComments: (orderId) => {
    return all(`SELECT oc.*, u.full_name as user_name, u.role as user_role FROM order_comments oc JOIN users u ON oc.user_id = u.id WHERE oc.order_id = ? ORDER BY oc.created_at DESC`, [orderId]);
  },

  addReview: (orderId, clientId, rating, text) => {
    return run('INSERT INTO reviews (order_id, client_id, rating, text) VALUES (?, ?, ?, ?)', [orderId, clientId, rating, text]);
  },
  getOrderReviews: (orderId) => {
    return all(`SELECT r.*, u.full_name as client_name FROM reviews r JOIN users u ON r.client_id = u.id WHERE r.order_id = ?`, [orderId]);
  },
  getAllReviews: () => {
    return all(`SELECT r.*, u.full_name as client_name, wo.order_number FROM reviews r JOIN users u ON r.client_id = u.id JOIN work_orders wo ON r.order_id = wo.id ORDER BY r.created_at DESC`);
  },

  addOrderPhoto: (orderId, type, filename, originalName, uploadedBy) => {
    return run('INSERT INTO order_photos (order_id, type, filename, original_name, uploaded_by) VALUES (?, ?, ?, ?, ?)', [orderId, type, filename, originalName, uploadedBy]);
  },
  getOrderPhotos: (orderId) => {
    return all(`SELECT op.*, u.full_name as uploaded_by_name FROM order_photos op JOIN users u ON op.uploaded_by = u.id WHERE op.order_id = ? ORDER BY op.created_at DESC`, [orderId]);
  },

  addReminder: (orderId, userId, text, remindAt) => {
    return run('INSERT INTO reminders (order_id, user_id, text, remind_at) VALUES (?, ?, ?, ?)', [orderId || null, userId, text, remindAt]);
  },
  getPendingReminders: (userId) => {
    return all('SELECT * FROM reminders WHERE user_id = ? AND status = "pending" AND remind_at <= DATETIME("now") ORDER BY remind_at', [userId]);
  },
  getAllReminders: (userId) => {
    return all('SELECT * FROM reminders WHERE user_id = ? ORDER BY remind_at DESC', [userId]);
  },
  completeReminder: (id) => run('UPDATE reminders SET status = "completed" WHERE id = ?', [id]),

  logError: (error, stack, url, method, userId) => {
    return run('INSERT INTO error_logs (error, stack, url, method, user_id) VALUES (?, ?, ?, ?, ?)', [error, stack || null, url || null, method || null, userId || null]);
  },
  getRecentErrors: (limit = 50) => {
    return all('SELECT * FROM error_logs ORDER BY created_at DESC LIMIT ?', [limit]);
  },

  savePushSubscription: (userId, subscription) => {
    return run('INSERT INTO push_subscriptions (user_id, subscription) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET subscription = ?', [userId, subscription, subscription]);
  },
  getPushSubscription: (userId) => get('SELECT * FROM push_subscriptions WHERE user_id = ?', [userId]),
  getAllPushSubscriptions: () => all('SELECT * FROM push_subscriptions'),

  backup: () => {
    return new Promise((resolve, reject) => {
      const backupPath = path.join(__dirname, '..', 'database', `backup_${Date.now()}.db`);
      db.serialize(() => {
        db.run('VACUUM', (err) => {
          if (err) reject(err);
          else resolve(backupPath);
        });
      });
    });
  }
};

module.exports = { db, initDatabase, dbHelpers };
