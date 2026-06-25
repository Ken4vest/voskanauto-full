const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const https = require('https');
require('dotenv').config();

const { db, initDatabase, dbHelpers } = require('./src/database');
const { requireAuth, requireRole, requireAdmin, requireStaff, setUserLocals } = require('./src/middleware/auth');
const {
  registerValidator, loginValidator, carValidator,
  serviceCreateValidator, serviceUpdateValidator,
  orderValidator, invoiceValidator, appointmentValidator
} = require('./src/middleware/validators');

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// Security middleware
app.use(require('helmet')({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'"],
      scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  }
}));

app.use(require('cors')({ origin: process.env.NODE_ENV === 'production' ? false : true, credentials: true }));

const limiter = require('express-rate-limit')({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Слишком много запросов, попробуйте позже'
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.COOKIE_SECURE === 'true',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'strict'
  },
  name: 'voskanauto.sid'
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Layout setup — express-ejs-layouts
const expressLayouts = require('express-ejs-layouts');
app.use(expressLayouts);
app.set('layout', 'admin/admin_layout');
app.set('layout extractScripts', false);
app.set('layout extractStyles', false);

app.use(setUserLocals);

// ======== HELPER: Приведение данных автомобилей к примитивам ========
function extractString(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'object') {
    if (val.value !== undefined) return extractString(val.value);
    if (val.name !== undefined) return extractString(val.name);
    if (val.text !== undefined) return extractString(val.text);
    if (val.toString && val.toString !== Object.prototype.toString) {
      try { return val.toString(); } catch(e) {}
    }
    if (Array.isArray(val)) return val.map(extractString).join(', ');
    try {
      var json = JSON.stringify(val);
      if (json !== '{}' && json !== '[]') return json;
    } catch(e) {}
  }
  return '';
}

function extractNumber(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    var parsed = parseFloat(val);
    return isNaN(parsed) ? null : parsed;
  }
  if (typeof val === 'object') {
    if (val.value !== undefined) return extractNumber(val.value);
    if (val.toString) {
      try {
        var parsed = parseFloat(val.toString());
        return isNaN(parsed) ? null : parsed;
      } catch(e) {}
    }
  }
  return null;
}

function normalizeCars(rawCars) {
  if (!Array.isArray(rawCars)) return [];
  return rawCars.map(function(car) {
    return {
      id: car.id,
      client_id: car.client_id,
      brand: extractString(car.brand),
      model: extractString(car.model),
      year: extractString(car.year) || null,
      vin: extractString(car.vin) || null,
      license_plate: extractString(car.license_plate) || null,
      mileage: extractNumber(car.mileage),
      color: extractString(car.color) || null,
      created_at: car.created_at
    };
  });
}

// ======== PUBLIC ROUTES (без layout) ========
app.get('/', (req, res) => {
  if (req.session.user) {
    if (req.session.user.role === 'client') return res.redirect('/client/dashboard');
    return res.redirect('/admin/dashboard');
  }
  res.render('login', { layout: false });
});

app.get('/login', (req, res) => {
  if (req.session.user) {
    if (req.session.user.role === 'client') return res.redirect('/client/dashboard');
    return res.redirect('/admin/dashboard');
  }
  res.render('login', { layout: false });
});

app.post('/login', loginValidator, async (req, res) => {
  const { email, password } = req.body;
  const user = await dbHelpers.getUserByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render('login', { layout: false, error: 'Неверный email или пароль' });
  }
  if (!user.is_active) {
    return res.render('login', { layout: false, error: 'Аккаунт заблокирован' });
  }
  req.session.user = { id: user.id, email: user.email, role: user.role, full_name: user.full_name };
  await dbHelpers.logActivity(user.id, 'login', 'user', user.id, 'Вход в систему');
  if (user.role === 'client') return res.redirect('/client/dashboard');
  res.redirect('/admin/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/register', (req, res) => res.render('register', { layout: false }));

app.post('/register', registerValidator, async (req, res) => {
  const { email, password, full_name, phone, company_name, inn, kpp } = req.body;
  const existing = await dbHelpers.getUserByEmail(email);
  if (existing) return res.render('register', { layout: false, error: 'Email уже зарегистрирован' });

  const hash = bcrypt.hashSync(password, 10);
  const result = await dbHelpers.run(
    'INSERT INTO users (email, password, role, full_name, phone, company_name, inn, kpp, discount_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [email, hash, 'client', full_name, phone || null, company_name || null, inn || null, kpp || null, 0]
  );

  req.session.user = { id: result.lastID, email, role: 'client', full_name };
  await dbHelpers.addNotification(result.lastID, 'welcome', 'Добро пожаловать!', 'Спасибо за регистрацию в ВосканАвто');
  res.redirect('/client/dashboard');
});

// ======== CLIENT ROUTES (с client_layout) ========
app.get('/client/dashboard', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    const user = await dbHelpers.getUserById(req.session.user.id);
    const rawCars = await dbHelpers.getClientCars(req.session.user.id);
    const cars = normalizeCars(rawCars);
    const orders = await dbHelpers.all(
      'SELECT wo.*, c.brand, c.model, c.license_plate FROM work_orders wo LEFT JOIN cars c ON wo.car_id = c.id WHERE wo.client_id = ? ORDER BY wo.created_at DESC LIMIT 5',
      [req.session.user.id]
    );
    const appointments = await dbHelpers.getAppointments(req.session.user.id);
    const invoices = await dbHelpers.getInvoices(req.session.user.id);
    const notifications = await dbHelpers.getNotifications(req.session.user.id);
    res.render('client/dashboard', { layout: 'partials/client_layout', user, cars, orders, appointments, invoices, notifications, activePage: 'dashboard', title: 'Личный кабинет', breadcrumbs: 'Главная / Дашборд' });
  } catch (err) {
    console.error('Client dashboard error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки дашборда' });
  }
});

app.get('/client/cars', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    const rawCars = await dbHelpers.getClientCars(req.session.user.id);
    const cars = normalizeCars(rawCars);
    res.render('client/cars', { layout: 'partials/client_layout', cars, activePage: 'cars', title: 'Мои автомобили', breadcrumbs: 'Главная / Автомобили' });
  } catch (err) {
    console.error('Client cars error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки автомобилей' });
  }
});

app.post('/client/cars', requireAuth, requireRole(['client']), carValidator, async (req, res) => {
  try {
    const { brand, model, year, vin, license_plate, mileage, color } = req.body;
    await dbHelpers.addCar({ client_id: req.session.user.id, brand, model, year: year || null, vin: vin || null, license_plate: license_plate || null, mileage: mileage || null, color: color || null });
    res.redirect('/client/cars');
  } catch (err) {
    console.error('Add car error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка добавления автомобиля' });
  }
});

app.get('/client/services', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    const services = await dbHelpers.getAllServices();
    const cartItems = await dbHelpers.getCartItems(req.session.user.id);
    const cartTotal = await dbHelpers.getCartTotal(req.session.user.id);
    res.render('client/services', { layout: 'partials/client_layout', services, cartItems, cartTotal, activePage: 'services', title: 'Услуги', breadcrumbs: 'Главная / Услуги' });
  } catch (err) {
    console.error('Client services error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки услуг' });
  }
});

app.post('/client/cart/add', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    const { service_id, part_id, quantity, price } = req.body;
    await dbHelpers.run(
      'INSERT INTO cart_items (client_id, service_id, part_id, quantity, price) VALUES (?, ?, ?, ?, ?)',
      [req.session.user.id, service_id || null, part_id || null, quantity || 1, price]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Cart add error:', err);
    res.status(500).json({ error: 'Ошибка добавления в корзину' });
  }
});

app.post('/client/cart/remove/:id', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    await dbHelpers.run('DELETE FROM cart_items WHERE id = ? AND client_id = ?', [req.params.id, req.session.user.id]);
    res.redirect('/client/cart');
  } catch (err) {
    console.error('Cart remove error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка удаления из корзины' });
  }
});

app.post('/client/cart/clear', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    await dbHelpers.clearCart(req.session.user.id);
    res.redirect('/client/cart');
  } catch (err) {
    console.error('Cart clear error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка очистки корзины' });
  }
});

app.get('/client/cart', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    const cartItems = await dbHelpers.getCartItems(req.session.user.id);
    const cartTotal = await dbHelpers.getCartTotal(req.session.user.id);
    res.render('client/cart', { layout: 'partials/client_layout', cartItems, cartTotal, activePage: 'cart', title: 'Корзина', breadcrumbs: 'Главная / Корзина' });
  } catch (err) {
    console.error('Cart error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки корзины' });
  }
});

app.get('/client/checkout', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    const cartItems = await dbHelpers.getCartItems(req.session.user.id);
    const cartTotal = await dbHelpers.getCartTotal(req.session.user.id);
    const rawCars = await dbHelpers.getClientCars(req.session.user.id);
    const cars = normalizeCars(rawCars);
    if (cartItems.length === 0) return res.redirect('/client/services');
    res.render('client/checkout', { layout: 'partials/client_layout', cartItems, cartTotal, cars, activePage: 'cart', title: 'Оформление заказа', breadcrumbs: 'Главная / Оформление' });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка оформления' });
  }
});

app.post('/client/checkout', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    const { car_id, appointment_date, appointment_time, notes } = req.body;
    const cartItems = await dbHelpers.getCartItems(req.session.user.id);
    const cartTotal = await dbHelpers.getCartTotal(req.session.user.id);
    if (cartItems.length === 0) return res.redirect('/client/services');

    const orderNumber = 'WO-' + Date.now();
    const orderResult = await dbHelpers.run(
      'INSERT INTO work_orders (order_number, client_id, car_id, status, description, total_amount, scheduled_date, scheduled_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [orderNumber, req.session.user.id, car_id || null, 'created', notes || null, cartTotal.total, appointment_date || null, appointment_time || null]
    );

    const orderId = orderResult.lastID;
    for (const item of cartItems) {
      if (item.service_id) {
        await dbHelpers.run('INSERT INTO work_order_services (order_id, service_id, quantity, price) VALUES (?, ?, ?, ?)',
          [orderId, item.service_id, item.quantity, item.price]);
      }
      if (item.part_id) {
        await dbHelpers.run('INSERT INTO work_order_parts (order_id, part_id, quantity, price) VALUES (?, ?, ?, ?)',
          [orderId, item.part_id, item.quantity, item.price]);
      }
    }

    await dbHelpers.clearCart(req.session.user.id);
    if (appointment_date && appointment_time) {
      await dbHelpers.run(
        'INSERT INTO appointments (client_id, car_id, service_id, appointment_date, appointment_time, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [req.session.user.id, car_id || null, cartItems[0]?.service_id || null, appointment_date, appointment_time, 'pending', notes || null]
      );
    }
    await dbHelpers.addNotification(req.session.user.id, 'order', 'Новый заказ-наряд', `Ваш заказ ${orderNumber} создан и ожидает подтверждения`);
    res.redirect('/client/orders');
  } catch (err) {
    console.error('Checkout post error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка создания заказа' });
  }
});

app.get('/client/orders', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    const orders = await dbHelpers.all(
      'SELECT wo.*, c.brand, c.model, c.license_plate FROM work_orders wo LEFT JOIN cars c ON wo.car_id = c.id WHERE wo.client_id = ? ORDER BY wo.created_at DESC',
      [req.session.user.id]
    );
    res.render('client/orders', { layout: 'partials/client_layout', orders, activePage: 'orders', title: 'Мои заказы', breadcrumbs: 'Главная / Заказы' });
  } catch (err) {
    console.error('Client orders error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки заказов' });
  }
});

app.get('/client/orders/:id', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    const order = await dbHelpers.getWorkOrderById(req.params.id);
    if (!order || order.client_id !== req.session.user.id) return res.status(404).render('error', { layout: false, message: 'Заказ не найден' });
    res.render('client/order_detail', { layout: 'partials/client_layout', order, activePage: 'orders', title: 'Заказ #' + order.order_number, breadcrumbs: 'Главная / Заказы / Детали' });
  } catch (err) {
    console.error('Order detail error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки заказа' });
  }
});

app.get('/client/appointments', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    const appointments = await dbHelpers.getAppointments(req.session.user.id);
    const rawCars = await dbHelpers.getClientCars(req.session.user.id);
    const cars = normalizeCars(rawCars);
    const services = await dbHelpers.getAllServices();
    res.render('client/appointments', { layout: 'partials/client_layout', appointments, cars, services, activePage: 'appointments', title: 'Записи', breadcrumbs: 'Главная / Записи' });
  } catch (err) {
    console.error('Appointments error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки записей' });
  }
});

app.post('/client/appointments', requireAuth, requireRole(['client']), appointmentValidator, async (req, res) => {
  try {
    const { car_id, service_id, appointment_date, appointment_time, notes } = req.body;
    await dbHelpers.run(
      'INSERT INTO appointments (client_id, car_id, service_id, appointment_date, appointment_time, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.session.user.id, car_id || null, service_id || null, appointment_date, appointment_time, 'pending', notes || null]
    );
    res.redirect('/client/appointments');
  } catch (err) {
    console.error('Appointment create error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка создания записи' });
  }
});

app.post('/client/appointments/:id/cancel', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    await dbHelpers.run('UPDATE appointments SET status = "cancelled" WHERE id = ? AND client_id = ?', [req.params.id, req.session.user.id]);
    res.redirect('/client/appointments');
  } catch (err) {
    console.error('Appointment cancel error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка отмены записи' });
  }
});

app.get('/client/wash', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    const washServices = await dbHelpers.getAllWashServices();
    const rawCars = await dbHelpers.getClientCars(req.session.user.id);
    const cars = normalizeCars(rawCars);
    res.render('client/wash', { layout: 'partials/client_layout', washServices, cars, activePage: 'wash', title: 'Мойка', breadcrumbs: 'Главная / Мойка' });
  } catch (err) {
    console.error('Wash error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки мойки' });
  }
});

app.get('/client/parts', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    const parts = await dbHelpers.getAllParts();
    res.render('client/parts', { layout: 'partials/client_layout', parts, activePage: 'parts', title: 'Запчасти', breadcrumbs: 'Главная / Запчасти' });
  } catch (err) {
    console.error('Parts error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки запчастей' });
  }
});

app.get('/client/invoices', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    const invoices = await dbHelpers.getInvoices(req.session.user.id);
    res.render('client/invoices', { layout: 'partials/client_layout', invoices, activePage: 'invoices', title: 'Счета', breadcrumbs: 'Главная / Счета' });
  } catch (err) {
    console.error('Invoices error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки счетов' });
  }
});

app.post('/client/invoices/:id/pay', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    const invoice = await dbHelpers.get('SELECT * FROM invoices WHERE id = ? AND client_id = ?', [req.params.id, req.session.user.id]);
    if (!invoice) return res.status(404).json({ error: 'Счёт не найден' });
    await dbHelpers.run('UPDATE invoices SET status = "paid", paid_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    await dbHelpers.run('INSERT INTO payments (client_id, invoice_id, amount, payment_method) VALUES (?, ?, ?, "online")', [req.session.user.id, invoice.id, invoice.amount]);
    await dbHelpers.addNotification(req.session.user.id, 'payment', 'Оплата прошла', `Счёт ${invoice.invoice_number} оплачен`);
    res.json({ success: true });
  } catch (err) {
    console.error('Invoice pay error:', err);
    res.status(500).json({ error: 'Ошибка оплаты' });
  }
});

app.get('/client/profile', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    const user = await dbHelpers.getUserById(req.session.user.id);
    const rawCars = await dbHelpers.getClientCars(req.session.user.id);
    const cars = normalizeCars(rawCars);
    res.render('client/profile', { layout: 'partials/client_layout', user, cars, activePage: 'profile', title: 'Профиль', breadcrumbs: 'Главная / Профиль' });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки профиля' });
  }
});

app.post('/client/profile', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    const { full_name, phone, company_name, inn, kpp } = req.body;
    await dbHelpers.run(
      'UPDATE users SET full_name = ?, phone = ?, company_name = ?, inn = ?, kpp = ? WHERE id = ?',
      [full_name, phone, company_name || null, inn || null, kpp || null, req.session.user.id]
    );
    req.session.user.full_name = full_name;
    res.redirect('/client/profile');
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка обновления профиля' });
  }
});

app.get('/client/notifications', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    const notifications = await dbHelpers.getNotifications(req.session.user.id);
    await dbHelpers.markRead(req.session.user.id);
    res.render('client/notifications', { layout: 'partials/client_layout', notifications, activePage: 'notifications', title: 'Уведомления', breadcrumbs: 'Главная / Уведомления' });
  } catch (err) {
    console.error('Notifications error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки уведомлений' });
  }
});

// ======== ADMIN ROUTES (с admin_layout по умолчанию) ========
app.get('/admin/dashboard', requireStaff, async (req, res) => {
  try {
    const stats = await dbHelpers.getStats();
    const recentOrders = await dbHelpers.all(
      'SELECT wo.*, u.full_name as client_name, c.brand, c.model, c.license_plate FROM work_orders wo JOIN users u ON wo.client_id = u.id LEFT JOIN cars c ON wo.car_id = c.id ORDER BY wo.created_at DESC LIMIT 10',
      []
    );
    const criticalParts = await dbHelpers.getCriticalParts();
    const unreadNotifications = await dbHelpers.getUnreadCount(req.session.user.id);
    res.render('admin/dashboard', { stats, recentOrders, criticalParts, unreadNotifications, activePage: 'dashboard', title: 'Дашборд', breadcrumbs: 'Главная / Дашборд' });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки дашборда' });
  }
});

// Admin clients
app.get('/admin/clients', requireStaff, async (req, res) => {
  try {
    const clients = await dbHelpers.all('SELECT * FROM users WHERE role = "client" ORDER BY full_name', []);
    res.render('admin/clients', { clients, activePage: 'clients', title: 'Клиенты', breadcrumbs: 'Операции / Клиенты' });
  } catch (err) {
    console.error('Clients error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки клиентов' });
  }
});

app.get('/admin/clients/:id', requireStaff, async (req, res) => {
  try {
    const client = await dbHelpers.getUserById(req.params.id);
    if (!client || client.role !== 'client') return res.status(404).render('error', { layout: false, message: 'Клиент не найден' });
    const rawCars = await dbHelpers.getClientCars(req.params.id);
    const cars = normalizeCars(rawCars);
    const orders = await dbHelpers.all('SELECT * FROM work_orders WHERE client_id = ? ORDER BY created_at DESC', [req.params.id]);
    const invoices = await dbHelpers.getInvoices(req.params.id);
    res.render('admin/client_detail', { client, cars, orders, invoices, activePage: 'clients', title: 'Карточка клиента', breadcrumbs: 'Операции / Клиенты / Карточка' });
  } catch (err) {
    console.error('Client detail error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки клиента' });
  }
});

app.post('/admin/clients/:id/invoices', requireStaff, invoiceValidator, async (req, res) => {
  try {
    const { amount, description, due_date, order_id } = req.body;
    const invoiceNumber = 'INV-' + Date.now();
    await dbHelpers.run(
      'INSERT INTO invoices (invoice_number, client_id, order_id, amount, description, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [invoiceNumber, req.params.id, order_id || null, amount, description, due_date || null, req.session.user.id]
    );
    await dbHelpers.addNotification(req.params.id, 'invoice', 'Новый счёт', `Выставлен счёт ${invoiceNumber} на ₽${amount}`);
    res.redirect('/admin/clients/' + req.params.id);
  } catch (err) {
    console.error('Invoice create error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка создания счёта' });
  }
});

// Admin orders
app.get('/admin/orders', requireStaff, async (req, res) => {
  try {
    const status = req.query.status || 'all';
    const orders = await dbHelpers.getWorkOrders(status);
    const clients = await dbHelpers.all('SELECT id, full_name FROM users WHERE role = "client" ORDER BY full_name', []);
    const mechanics = await dbHelpers.all('SELECT id, full_name FROM users WHERE role = "mechanic" ORDER BY full_name', []);
    res.render('admin/orders', { orders, clients, mechanics, status, activePage: 'orders', title: 'Заказ-наряды', breadcrumbs: 'Операции / Заказ-наряды' });
  } catch (err) {
    console.error('Orders error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки заказов' });
  }
});

app.get('/admin/orders/create', requireStaff, async (req, res) => {
  try {
    const clients = await dbHelpers.all('SELECT id, full_name FROM users WHERE role = "client" ORDER BY full_name', []);
    const services = await dbHelpers.getAllServices();
    const parts = await dbHelpers.getAllParts();
    const mechanics = await dbHelpers.all('SELECT id, full_name FROM users WHERE role = "mechanic" ORDER BY full_name', []);
    res.render('admin/order_create', { clients, services, parts, mechanics, activePage: 'orders', title: 'Новый заказ-наряд', breadcrumbs: 'Операции / Заказ-наряды / Создание' });
  } catch (err) {
    console.error('Order create error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки формы' });
  }
});

app.post('/admin/orders', requireStaff, orderValidator, async (req, res) => {
  try {
    const { client_id, car_id, mechanic_id, post_number, status, description, scheduled_date, scheduled_time, services, parts } = req.body;
    const orderNumber = 'WO-' + Date.now();
    let totalLabor = 0, totalParts = 0;

    if (services) {
      const ids = Array.isArray(services) ? services : [services];
      for (const sid of ids) {
        const s = await dbHelpers.get('SELECT labor_hours, hourly_rate FROM services WHERE id = ?', [sid]);
        if (s) totalLabor += s.labor_hours * s.hourly_rate;
      }
    }
    if (parts) {
      const ids = Array.isArray(parts) ? parts : [parts];
      for (const pid of ids) {
        const p = await dbHelpers.get('SELECT sale_price FROM parts WHERE id = ?', [pid]);
        if (p) totalParts += p.sale_price;
      }
    }

    const result = await dbHelpers.run(
      'INSERT INTO work_orders (order_number, client_id, car_id, mechanic_id, post_number, status, description, total_labor_cost, total_parts_cost, total_amount, scheduled_date, scheduled_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [orderNumber, client_id, car_id || null, mechanic_id || null, post_number || null, status || 'created', description || null, totalLabor, totalParts, totalLabor + totalParts, scheduled_date || null, scheduled_time || null]
    );

    const orderId = result.lastID;
    if (services) {
      const ids = Array.isArray(services) ? services : [services];
      for (const sid of ids) {
        const s = await dbHelpers.get('SELECT labor_hours, hourly_rate FROM services WHERE id = ?', [sid]);
        if (s) {
          await dbHelpers.run('INSERT INTO work_order_services (order_id, service_id, quantity, price) VALUES (?, ?, 1, ?)',
            [orderId, sid, s.labor_hours * s.hourly_rate]);
        }
      }
    }
    if (parts) {
      const ids = Array.isArray(parts) ? parts : [parts];
      for (const pid of ids) {
        const p = await dbHelpers.get('SELECT sale_price FROM parts WHERE id = ?', [pid]);
        if (p) {
          await dbHelpers.run('INSERT INTO work_order_parts (order_id, part_id, quantity, price) VALUES (?, ?, 1, ?)',
            [orderId, pid, p.sale_price]);
        }
      }
    }

    await dbHelpers.addNotification(client_id, 'order', 'Новый заказ-наряд', `Создан заказ ${orderNumber}`);
    res.redirect('/admin/orders');
  } catch (err) {
    console.error('Order create error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка создания заказа' });
  }
});

app.get('/admin/orders/:id', requireStaff, async (req, res) => {
  try {
    const order = await dbHelpers.getWorkOrderById(req.params.id);
    if (!order) return res.status(404).render('error', { layout: false, message: 'Заказ не найден' });
    const mechanics = await dbHelpers.all('SELECT id, full_name FROM users WHERE role = "mechanic" ORDER BY full_name', []);
    res.render('admin/order_detail', { order, mechanics, activePage: 'orders', title: 'Заказ-наряд #' + order.order_number, breadcrumbs: 'Операции / Заказ-наряды / Детали' });
  } catch (err) {
    console.error('Order detail error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки заказа' });
  }
});

app.post('/admin/orders/:id/status', requireStaff, async (req, res) => {
  try {
    const { status } = req.body;
    await dbHelpers.run('UPDATE work_orders SET status = ? WHERE id = ?', [status, req.params.id]);
    const order = await dbHelpers.getWorkOrderById(req.params.id);
    if (order) {
      await dbHelpers.addNotification(order.client_id, 'order', 'Статус изменён', `Заказ ${order.order_number}: ${status}`);
    }
    res.redirect('/admin/orders/' + req.params.id);
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка обновления статуса' });
  }
});

app.post('/admin/orders/:id/send', requireStaff, async (req, res) => {
  try {
    const order = await dbHelpers.getWorkOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    await dbHelpers.run('UPDATE work_orders SET invoice_sent = 1, status = "ready" WHERE id = ?', [req.params.id]);
    await dbHelpers.addNotification(order.client_id, 'order', 'Заказ готов', `Заказ ${order.order_number} готов к выдаче. Сумма: ₽${order.total_amount}`);
    res.json({ success: true, message: 'Заказ-наряд отправлен клиенту' });
  } catch (err) {
    console.error('Order send error:', err);
    res.status(500).json({ error: 'Ошибка отправки заказа' });
  }
});

// ======== SERVICE CRUD (Admin) ========
app.get('/admin/services', requireAdmin, async (req, res) => {
  try {
    const services = await dbHelpers.getAllServices();
    const inactive = await dbHelpers.all('SELECT * FROM services WHERE is_active = 0 ORDER BY name', []);
    res.render('admin/services', { services, inactive, activePage: 'pricelist', title: 'Управление услугами', breadcrumbs: 'Операции / Услуги' });
  } catch (err) {
    console.error('Services error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки услуг' });
  }
});

app.post('/admin/services', requireAdmin, serviceCreateValidator, async (req, res) => {
  try {
    const { code, name, category, description, labor_hours, hourly_rate, compatible_brands } = req.body;
    await dbHelpers.createService({ code, name, category, description, labor_hours, hourly_rate, compatible_brands });
    await dbHelpers.logActivity(req.session.user.id, 'create', 'service', null, `Создана услуга ${code}`);
    res.redirect('/admin/services');
  } catch (e) {
    console.error('Service create error:', e);
    res.render('error', { layout: false, message: 'Ошибка: ' + e.message });
  }
});

app.post('/admin/services/:id', requireAdmin, serviceUpdateValidator, async (req, res) => {
  try {
    const { code, name, category, description, labor_hours, hourly_rate, compatible_brands } = req.body;
    await dbHelpers.updateService(req.params.id, { code, name, category, description, labor_hours, hourly_rate, compatible_brands });
    await dbHelpers.logActivity(req.session.user.id, 'update', 'service', req.params.id, `Обновлена услуга ${code}`);
    res.redirect('/admin/services');
  } catch (e) {
    console.error('Service update error:', e);
    res.render('error', { layout: false, message: 'Ошибка: ' + e.message });
  }
});

app.post('/admin/services/:id/delete', requireAdmin, async (req, res) => {
  try {
    await dbHelpers.deleteService(req.params.id);
    await dbHelpers.logActivity(req.session.user.id, 'delete', 'service', req.params.id, 'Услуга удалена');
    res.redirect('/admin/services');
  } catch (err) {
    console.error('Service delete error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка удаления услуги' });
  }
});

app.post('/admin/services/:id/restore', requireAdmin, async (req, res) => {
  try {
    await dbHelpers.restoreService(req.params.id);
    await dbHelpers.logActivity(req.session.user.id, 'restore', 'service', req.params.id, 'Услуга восстановлена');
    res.redirect('/admin/services');
  } catch (err) {
    console.error('Service restore error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка восстановления услуги' });
  }
});

// Admin appointments
app.get('/admin/appointments', requireStaff, async (req, res) => {
  try {
    const appointments = await dbHelpers.getAppointments();
    res.render('admin/appointments', { appointments, activePage: 'appointments', title: 'Записи', breadcrumbs: 'Операции / Записи' });
  } catch (err) {
    console.error('Appointments error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки записей' });
  }
});

app.post('/admin/appointments/:id/confirm', requireStaff, async (req, res) => {
  try {
    const app = await dbHelpers.get('SELECT client_id FROM appointments WHERE id = ?', [req.params.id]);
    await dbHelpers.run('UPDATE appointments SET status = "confirmed" WHERE id = ?', [req.params.id]);
    if (app) await dbHelpers.addNotification(app.client_id, 'appointment', 'Запись подтверждена', 'Ваша запись подтверждена администратором');
    res.redirect('/admin/appointments');
  } catch (err) {
    console.error('Appointment confirm error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка подтверждения' });
  }
});

app.post('/admin/appointments/:id/reject', requireStaff, async (req, res) => {
  try {
    const app = await dbHelpers.get('SELECT client_id FROM appointments WHERE id = ?', [req.params.id]);
    await dbHelpers.run('UPDATE appointments SET status = "rejected" WHERE id = ?', [req.params.id]);
    if (app) await dbHelpers.addNotification(app.client_id, 'appointment', 'Запись отклонена', 'К сожалению, запись не может быть выполнена');
    res.redirect('/admin/appointments');
  } catch (err) {
    console.error('Appointment reject error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка отклонения' });
  }
});

// Admin warehouse
app.get('/admin/warehouse', requireStaff, async (req, res) => {
  try {
    const parts = await dbHelpers.getAllParts();
    const criticalParts = await dbHelpers.getCriticalParts();
    const suppliers = await dbHelpers.all('SELECT * FROM suppliers', []);
    res.render('admin/warehouse', { parts, criticalParts, suppliers, activePage: 'warehouse', title: 'Склад', breadcrumbs: 'Операции / Склад' });
  } catch (err) {
    console.error('Warehouse error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки склада' });
  }
});

app.post('/admin/warehouse/parts', requireAdmin, async (req, res) => {
  try {
    const { article, name, manufacturer, category, stock_main, min_stock, purchase_price, sale_price } = req.body;
    await dbHelpers.run(
      'INSERT INTO parts (article, name, manufacturer, category, stock_main, min_stock, purchase_price, sale_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [article, name, manufacturer, category, stock_main || 0, min_stock || 5, purchase_price || 0, sale_price || 0]
    );
    res.redirect('/admin/warehouse');
  } catch (err) {
    console.error('Part add error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка добавления запчасти' });
  }
});

app.post('/admin/warehouse/parts/:id/restock', requireStaff, async (req, res) => {
  try {
    const { quantity } = req.body;
    await dbHelpers.run('UPDATE parts SET stock_main = stock_main + ? WHERE id = ?', [quantity, req.params.id]);
    res.redirect('/admin/warehouse');
  } catch (err) {
    console.error('Restock error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка пополнения' });
  }
});

// Admin pricelist (redirect to services)
app.get('/admin/pricelist', requireStaff, (req, res) => res.redirect('/admin/services'));

// Admin finance
app.get('/admin/finance', requireAdmin, async (req, res) => {
  try {
    const payments = await dbHelpers.all(
      'SELECT p.*, u.full_name as client_name, wo.order_number FROM payments p JOIN users u ON p.client_id = u.id LEFT JOIN work_orders wo ON p.order_id = wo.id ORDER BY p.created_at DESC LIMIT 50',
      []
    );
    const totalRevenue = await dbHelpers.get('SELECT COALESCE(SUM(amount), 0) as total FROM payments', []);
    const todayRevenue = await dbHelpers.get('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE DATE(created_at) = DATE("now")', []);
    res.render('admin/finance', { payments, totalRevenue, todayRevenue, activePage: 'finance', title: 'Финансы', breadcrumbs: 'Операции / Финансы' });
  } catch (err) {
    console.error('Finance error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки финансов' });
  }
});

// Admin reports
app.get('/admin/reports', requireAdmin, async (req, res) => {
  try {
    const revenueByDay = await dbHelpers.all(
      'SELECT DATE(created_at) as date, SUM(amount) as total FROM payments WHERE DATE(created_at) >= DATE("now", "-30 days") GROUP BY DATE(created_at) ORDER BY date',
      []
    );
    const popularServices = await dbHelpers.all(
      'SELECT s.name, COUNT(*) as count, SUM(wos.price) as revenue FROM work_order_services wos JOIN services s ON wos.service_id = s.id GROUP BY wos.service_id ORDER BY count DESC LIMIT 10',
      []
    );
    const mechanicStats = await dbHelpers.all(
      'SELECT u.full_name, COUNT(wo.id) as orders_count, SUM(wo.total_amount) as total_revenue FROM work_orders wo JOIN users u ON wo.mechanic_id = u.id WHERE wo.status = "completed" GROUP BY wo.mechanic_id ORDER BY total_revenue DESC',
      []
    );
    res.render('admin/reports', { revenueByDay, popularServices, mechanicStats, activePage: 'reports', title: 'Отчёты', breadcrumbs: 'Управление / Отчёты' });
  } catch (err) {
    console.error('Reports error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки отчётов' });
  }
});

// Admin staff
app.get('/admin/staff', requireAdmin, async (req, res) => {
  try {
    const staff = await dbHelpers.all('SELECT * FROM users WHERE role IN ("admin", "mechanic", "receptionist") ORDER BY role, full_name', []);
    res.render('admin/staff', { staff, activePage: 'staff', title: 'Персонал', breadcrumbs: 'Управление / Персонал' });
  } catch (err) {
    console.error('Staff error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки персонала' });
  }
});

app.post('/admin/staff', requireAdmin, async (req, res) => {
  try {
    const { email, password, full_name, phone, role } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    await dbHelpers.run('INSERT INTO users (email, password, role, full_name, phone) VALUES (?, ?, ?, ?, ?)', [email, hash, role, full_name, phone]);
    res.redirect('/admin/staff');
  } catch (err) {
    console.error('Staff add error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка добавления сотрудника' });
  }
});

// Admin invoices
app.get('/admin/invoices', requireStaff, async (req, res) => {
  try {
    const invoices = await dbHelpers.getInvoices();
    const clients = await dbHelpers.all('SELECT id, full_name FROM users WHERE role = "client" ORDER BY full_name', []);
    res.render('admin/invoices', { invoices, clients, activePage: 'invoices', title: 'Счета', breadcrumbs: 'Операции / Счета' });
  } catch (err) {
    console.error('Invoices error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки счетов' });
  }
});

app.post('/admin/invoices', requireStaff, invoiceValidator, async (req, res) => {
  try {
    const { client_id, amount, description, due_date, order_id } = req.body;
    const invoiceNumber = 'INV-' + Date.now();
    await dbHelpers.run(
      'INSERT INTO invoices (invoice_number, client_id, order_id, amount, description, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [invoiceNumber, client_id, order_id || null, amount, description, due_date || null, req.session.user.id]
    );
    await dbHelpers.addNotification(client_id, 'invoice', 'Новый счёт', `Выставлен счёт ${invoiceNumber} на ₽${amount}`);
    res.redirect('/admin/invoices');
  } catch (err) {
    console.error('Invoice create error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка создания счёта' });
  }
});

app.post('/admin/invoices/:id/pay', requireStaff, async (req, res) => {
  try {
    await dbHelpers.run('UPDATE invoices SET status = "paid", paid_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    const invoice = await dbHelpers.get('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (invoice) {
      await dbHelpers.run('INSERT INTO payments (client_id, invoice_id, amount, payment_method) VALUES (?, ?, ?, "cash")', [invoice.client_id, invoice.id, invoice.amount]);
    }
    res.redirect('/admin/invoices');
  } catch (err) {
    console.error('Invoice pay error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка оплаты счёта' });
  }
});

// Admin notifications
app.get('/admin/notifications', requireStaff, async (req, res) => {
  try {
    const notifications = await dbHelpers.getNotifications(req.session.user.id);
    await dbHelpers.markRead(req.session.user.id);
    res.render('admin/notifications', { notifications, activePage: 'notifications', title: 'Уведомления', breadcrumbs: 'Управление / Уведомления' });
  } catch (err) {
    console.error('Notifications error:', err);
    res.status(500).render('error', { layout: false, message: 'Ошибка загрузки уведомлений' });
  }
});

// API
app.get('/api/cars/:clientId', requireAuth, async (req, res) => {
  try {
    const rawCars = await dbHelpers.getClientCars(req.params.clientId);
    res.json(normalizeCars(rawCars));
  } catch (err) {
    console.error('API cars error:', err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

app.get('/api/stats', requireStaff, async (req, res) => {
  try {
    res.json(await dbHelpers.getStats());
  } catch (err) {
    console.error('API stats error:', err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

app.get('/api/notifications/unread', requireAuth, async (req, res) => {
  try {
    res.json(await dbHelpers.getUnreadCount(req.session.user.id));
  } catch (err) {
    console.error('API notifications error:', err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ======== ВРЕМЕННО: очистка испорченных данных автомобилей ========
app.get('/debug/clear-cars', requireAuth, requireRole(['client']), async (req, res) => {
  try {
    await dbHelpers.run('DELETE FROM cars WHERE client_id = ?', [req.session.user.id]);
    res.send('<h1>Автомобили удалены</h1><p>Все автомобили удалены. <a href="/client/cars">Перейти к автомобилям</a></p>');
  } catch (err) {
    console.error('Clear cars error:', err);
    res.status(500).send('Ошибка: ' + err.message);
  }
});
// ======== КОНЕЦ ВРЕМЕННОГО МАРШРУТА ========

// Error handlers
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { layout: false, message: 'Что-то пошло не так!' });
});

app.use((req, res) => {
  res.status(404).render('error', { layout: false, message: 'Страница не найдена' });
});

// Start server after DB init
(async () => {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log(`ВосканАвто HTTP: http://localhost:${PORT}`);
    });

    // HTTPS (if certificates exist)
    const keyPath = process.env.SSL_KEY_PATH || './ssl/server.key';
    const certPath = process.env.SSL_CERT_PATH || './ssl/server.crt';

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
      https.createServer(httpsOptions, app).listen(HTTPS_PORT, () => {
        console.log(`ВосканАвто HTTPS: https://localhost:${HTTPS_PORT}`);
      });
    } else {
      console.log('SSL certificates not found. HTTPS disabled.');
      console.log('To enable HTTPS, place server.key and server.crt in ./ssl/');
    }

    console.log('Admin: admin@voskanauto.ru / admin123');
    console.log('Mechanic: semenov@voskanauto.ru / mechanic123');
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();