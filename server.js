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
// Security middleware
app.use(require('helmet')({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'"],
      scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],  // ← добавь эту строку
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
app.use(setUserLocals);

// ======== PUBLIC ROUTES ========
app.get('/', (req, res) => {
  if (req.session.user) {
    if (req.session.user.role === 'client') return res.redirect('/client/dashboard');
    return res.redirect('/admin/dashboard');
  }
  res.render('login');
});

app.get('/login', (req, res) => {
  if (req.session.user) {
    if (req.session.user.role === 'client') return res.redirect('/client/dashboard');
    return res.redirect('/admin/dashboard');
  }
  res.render('login');
});

app.post('/login', loginValidator, async (req, res) => {
  const { email, password } = req.body;
  const user = await dbHelpers.getUserByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render('login', { error: 'Неверный email или пароль' });
  }
  if (!user.is_active) {
    return res.render('login', { error: 'Аккаунт заблокирован' });
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

app.get('/register', (req, res) => res.render('register'));

app.post('/register', registerValidator, async (req, res) => {
  const { email, password, full_name, phone, company_name, inn, kpp } = req.body;
  const existing = await dbHelpers.getUserByEmail(email);
  if (existing) return res.render('register', { error: 'Email уже зарегистрирован' });

  const hash = bcrypt.hashSync(password, 10);
  const result = await dbHelpers.run(
    'INSERT INTO users (email, password, role, full_name, phone, company_name, inn, kpp, discount_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [email, hash, 'client', full_name, phone || null, company_name || null, inn || null, kpp || null, 0]
  );

  req.session.user = { id: result.lastID, email, role: 'client', full_name };
  await dbHelpers.addNotification(result.lastID, 'welcome', 'Добро пожаловать!', 'Спасибо за регистрацию в ВосканАвто');
  res.redirect('/client/dashboard');
});

// ======== CLIENT ROUTES ========
app.get('/client/dashboard', requireAuth, requireRole(['client']), async (req, res) => {
  const user = await dbHelpers.getUserById(req.session.user.id);
  const cars = await dbHelpers.getClientCars(req.session.user.id);
  const orders = await dbHelpers.all(
    'SELECT wo.*, c.brand, c.model, c.license_plate FROM work_orders wo LEFT JOIN cars c ON wo.car_id = c.id WHERE wo.client_id = ? ORDER BY wo.created_at DESC LIMIT 5',
    [req.session.user.id]
  );
  const appointments = await dbHelpers.getAppointments(req.session.user.id);
  const invoices = await dbHelpers.getInvoices(req.session.user.id);
  const notifications = await dbHelpers.getNotifications(req.session.user.id);
  res.render('client/dashboard', { user, cars, orders, appointments, invoices, notifications, activePage: 'dashboard' });
});

app.get('/client/cars', requireAuth, requireRole(['client']), async (req, res) => {
  const cars = await dbHelpers.getClientCars(req.session.user.id);
  res.render('client/cars', { cars, activePage: 'cars' });
});

app.post('/client/cars', requireAuth, requireRole(['client']), carValidator, async (req, res) => {
  const { brand, model, year, vin, license_plate, mileage, color } = req.body;
  await dbHelpers.addCar({ client_id: req.session.user.id, brand, model, year: year || null, vin: vin || null, license_plate: license_plate || null, mileage: mileage || null, color: color || null });
  res.redirect('/client/cars');
});

app.get('/client/services', requireAuth, requireRole(['client']), async (req, res) => {
  const services = await dbHelpers.getAllServices();
  const cartItems = await dbHelpers.getCartItems(req.session.user.id);
  const cartTotal = await dbHelpers.getCartTotal(req.session.user.id);
  res.render('client/services', { services, cartItems, cartTotal, activePage: 'services' });
});

app.post('/client/cart/add', requireAuth, requireRole(['client']), async (req, res) => {
  const { service_id, part_id, quantity, price } = req.body;
  await dbHelpers.run(
    'INSERT INTO cart_items (client_id, service_id, part_id, quantity, price) VALUES (?, ?, ?, ?, ?)',
    [req.session.user.id, service_id || null, part_id || null, quantity || 1, price]
  );
  res.json({ success: true });
});

app.post('/client/cart/remove/:id', requireAuth, requireRole(['client']), async (req, res) => {
  await dbHelpers.run('DELETE FROM cart_items WHERE id = ? AND client_id = ?', [req.params.id, req.session.user.id]);
  res.redirect('/client/cart');
});

app.post('/client/cart/clear', requireAuth, requireRole(['client']), async (req, res) => {
  await dbHelpers.clearCart(req.session.user.id);
  res.redirect('/client/cart');
});

app.get('/client/cart', requireAuth, requireRole(['client']), async (req, res) => {
  const cartItems = await dbHelpers.getCartItems(req.session.user.id);
  const cartTotal = await dbHelpers.getCartTotal(req.session.user.id);
  res.render('client/cart', { cartItems, cartTotal, activePage: 'cart' });
});

app.get('/client/checkout', requireAuth, requireRole(['client']), async (req, res) => {
  const cartItems = await dbHelpers.getCartItems(req.session.user.id);
  const cartTotal = await dbHelpers.getCartTotal(req.session.user.id);
  const cars = await dbHelpers.getClientCars(req.session.user.id);
  if (cartItems.length === 0) return res.redirect('/client/services');
  res.render('client/checkout', { cartItems, cartTotal, cars, activePage: 'cart' });
});

app.post('/client/checkout', requireAuth, requireRole(['client']), async (req, res) => {
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
});

app.get('/client/orders', requireAuth, requireRole(['client']), async (req, res) => {
  const orders = await dbHelpers.all(
    'SELECT wo.*, c.brand, c.model, c.license_plate FROM work_orders wo LEFT JOIN cars c ON wo.car_id = c.id WHERE wo.client_id = ? ORDER BY wo.created_at DESC',
    [req.session.user.id]
  );
  res.render('client/orders', { orders, activePage: 'orders' });
});

app.get('/client/orders/:id', requireAuth, requireRole(['client']), async (req, res) => {
  const order = await dbHelpers.getWorkOrderById(req.params.id);
  if (!order || order.client_id !== req.session.user.id) return res.status(404).render('error', { message: 'Заказ не найден' });
  res.render('client/order_detail', { order, activePage: 'orders' });
});

app.get('/client/appointments', requireAuth, requireRole(['client']), async (req, res) => {
  const appointments = await dbHelpers.getAppointments(req.session.user.id);
  const cars = await dbHelpers.getClientCars(req.session.user.id);
  const services = await dbHelpers.getAllServices();
  res.render('client/appointments', { appointments, cars, services, activePage: 'appointments' });
});

app.post('/client/appointments', requireAuth, requireRole(['client']), appointmentValidator, async (req, res) => {
  const { car_id, service_id, appointment_date, appointment_time, notes } = req.body;
  await dbHelpers.run(
    'INSERT INTO appointments (client_id, car_id, service_id, appointment_date, appointment_time, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.session.user.id, car_id || null, service_id || null, appointment_date, appointment_time, 'pending', notes || null]
  );
  res.redirect('/client/appointments');
});

app.post('/client/appointments/:id/cancel', requireAuth, requireRole(['client']), async (req, res) => {
  await dbHelpers.run('UPDATE appointments SET status = "cancelled" WHERE id = ? AND client_id = ?', [req.params.id, req.session.user.id]);
  res.redirect('/client/appointments');
});

app.get('/client/wash', requireAuth, requireRole(['client']), async (req, res) => {
  const washServices = await dbHelpers.getAllWashServices();
  const cars = await dbHelpers.getClientCars(req.session.user.id);
  res.render('client/wash', { washServices, cars, activePage: 'wash' });
});

app.get('/client/parts', requireAuth, requireRole(['client']), async (req, res) => {
  const parts = await dbHelpers.getAllParts();
  res.render('client/parts', { parts, activePage: 'parts' });
});

app.get('/client/invoices', requireAuth, requireRole(['client']), async (req, res) => {
  const invoices = await dbHelpers.getInvoices(req.session.user.id);
  res.render('client/invoices', { invoices, activePage: 'invoices' });
});

app.post('/client/invoices/:id/pay', requireAuth, requireRole(['client']), async (req, res) => {
  const invoice = await dbHelpers.get('SELECT * FROM invoices WHERE id = ? AND client_id = ?', [req.params.id, req.session.user.id]);
  if (!invoice) return res.status(404).json({ error: 'Счёт не найден' });
  await dbHelpers.run('UPDATE invoices SET status = "paid", paid_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
  await dbHelpers.run('INSERT INTO payments (client_id, invoice_id, amount, payment_method) VALUES (?, ?, ?, "online")', [req.session.user.id, invoice.id, invoice.amount]);
  await dbHelpers.addNotification(req.session.user.id, 'payment', 'Оплата прошла', `Счёт ${invoice.invoice_number} оплачен`);
  res.json({ success: true });
});

app.get('/client/profile', requireAuth, requireRole(['client']), async (req, res) => {
  const user = await dbHelpers.getUserById(req.session.user.id);
  const cars = await dbHelpers.getClientCars(req.session.user.id);
  res.render('client/profile', { user, cars, activePage: 'profile' });
});

app.post('/client/profile', requireAuth, requireRole(['client']), async (req, res) => {
  const { full_name, phone, company_name, inn, kpp } = req.body;
  await dbHelpers.run(
    'UPDATE users SET full_name = ?, phone = ?, company_name = ?, inn = ?, kpp = ? WHERE id = ?',
    [full_name, phone, company_name || null, inn || null, kpp || null, req.session.user.id]
  );
  req.session.user.full_name = full_name;
  res.redirect('/client/profile');
});

app.get('/client/notifications', requireAuth, requireRole(['client']), async (req, res) => {
  const notifications = await dbHelpers.getNotifications(req.session.user.id);
  await dbHelpers.markRead(req.session.user.id);
  res.render('client/notifications', { notifications, activePage: 'notifications' });
});

// ======== ADMIN ROUTES ========
app.get('/admin/dashboard', requireStaff, async (req, res) => {
  const stats = await dbHelpers.getStats();
  const recentOrders = await dbHelpers.all(
    'SELECT wo.*, u.full_name as client_name, c.brand, c.model, c.license_plate FROM work_orders wo JOIN users u ON wo.client_id = u.id LEFT JOIN cars c ON wo.car_id = c.id ORDER BY wo.created_at DESC LIMIT 10',
    []
  );
  const criticalParts = await dbHelpers.getCriticalParts();
  const unreadNotifications = await dbHelpers.getUnreadCount(req.session.user.id);
  res.render('admin/dashboard', { stats, recentOrders, criticalParts, unreadNotifications, activePage: 'dashboard', title: 'Дашборд', breadcrumbs: 'Главная / Дашборд' });
});

// Admin clients
app.get('/admin/clients', requireStaff, async (req, res) => {
  const clients = await dbHelpers.all('SELECT * FROM users WHERE role = "client" ORDER BY full_name', []);
  res.render('admin/clients', { clients, activePage: 'clients', title: 'Клиенты', breadcrumbs: 'Операции / Клиенты' });
});

app.get('/admin/clients/:id', requireStaff, async (req, res) => {
  const client = await dbHelpers.getUserById(req.params.id);
  if (!client || client.role !== 'client') return res.status(404).render('error', { message: 'Клиент не найден' });
  const cars = await dbHelpers.getClientCars(req.params.id);
  const orders = await dbHelpers.all('SELECT * FROM work_orders WHERE client_id = ? ORDER BY created_at DESC', [req.params.id]);
  const invoices = await dbHelpers.getInvoices(req.params.id);
  res.render('admin/client_detail', { client, cars, orders, invoices, activePage: 'clients', title: 'Карточка клиента', breadcrumbs: 'Операции / Клиенты / Карточка' });
});

app.post('/admin/clients/:id/invoices', requireStaff, invoiceValidator, async (req, res) => {
  const { amount, description, due_date, order_id } = req.body;
  const invoiceNumber = 'INV-' + Date.now();
  await dbHelpers.run(
    'INSERT INTO invoices (invoice_number, client_id, order_id, amount, description, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [invoiceNumber, req.params.id, order_id || null, amount, description, due_date || null, req.session.user.id]
  );
  await dbHelpers.addNotification(req.params.id, 'invoice', 'Новый счёт', `Выставлен счёт ${invoiceNumber} на ₽${amount}`);
  res.redirect('/admin/clients/' + req.params.id);
});

// Admin orders
app.get('/admin/orders', requireStaff, async (req, res) => {
  const status = req.query.status || 'all';
  const orders = await dbHelpers.getWorkOrders(status);
  const clients = await dbHelpers.all('SELECT id, full_name FROM users WHERE role = "client" ORDER BY full_name', []);
  const mechanics = await dbHelpers.all('SELECT id, full_name FROM users WHERE role = "mechanic" ORDER BY full_name', []);
  res.render('admin/orders', { orders, clients, mechanics, status, activePage: 'orders', title: 'Заказ-наряды', breadcrumbs: 'Операции / Заказ-наряды' });
});

app.get('/admin/orders/create', requireStaff, async (req, res) => {
  const clients = await dbHelpers.all('SELECT id, full_name FROM users WHERE role = "client" ORDER BY full_name', []);
  const services = await dbHelpers.getAllServices();
  const parts = await dbHelpers.getAllParts();
  const mechanics = await dbHelpers.all('SELECT id, full_name FROM users WHERE role = "mechanic" ORDER BY full_name', []);
  res.render('admin/order_create', { clients, services, parts, mechanics, activePage: 'orders', title: 'Новый заказ-наряд', breadcrumbs: 'Операции / Заказ-наряды / Создание' });
});

app.post('/admin/orders', requireStaff, orderValidator, async (req, res) => {
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
});

app.get('/admin/orders/:id', requireStaff, async (req, res) => {
  const order = await dbHelpers.getWorkOrderById(req.params.id);
  if (!order) return res.status(404).render('error', { message: 'Заказ не найден' });
  const mechanics = await dbHelpers.all('SELECT id, full_name FROM users WHERE role = "mechanic" ORDER BY full_name', []);
  res.render('admin/order_detail', { order, mechanics, activePage: 'orders', title: 'Заказ-наряд #' + order.order_number, breadcrumbs: 'Операции / Заказ-наряды / Детали' });
});

app.post('/admin/orders/:id/status', requireStaff, async (req, res) => {
  const { status } = req.body;
  await dbHelpers.run('UPDATE work_orders SET status = ? WHERE id = ?', [status, req.params.id]);
  const order = await dbHelpers.getWorkOrderById(req.params.id);
  if (order) {
    await dbHelpers.addNotification(order.client_id, 'order', 'Статус изменён', `Заказ ${order.order_number}: ${status}`);
  }
  res.redirect('/admin/orders/' + req.params.id);
});

app.post('/admin/orders/:id/send', requireStaff, async (req, res) => {
  const order = await dbHelpers.getWorkOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  await dbHelpers.run('UPDATE work_orders SET invoice_sent = 1, status = "ready" WHERE id = ?', [req.params.id]);
  await dbHelpers.addNotification(order.client_id, 'order', 'Заказ готов', `Заказ ${order.order_number} готов к выдаче. Сумма: ₽${order.total_amount}`);
  res.json({ success: true, message: 'Заказ-наряд отправлен клиенту' });
});

// ======== SERVICE CRUD (Admin) ========
app.get('/admin/services', requireAdmin, async (req, res) => {
  const services = await dbHelpers.getAllServices();
  const inactive = await dbHelpers.all('SELECT * FROM services WHERE is_active = 0 ORDER BY name', []);
  res.render('admin/services', { services, inactive, activePage: 'pricelist', title: 'Управление услугами', breadcrumbs: 'Операции / Услуги' });
});

app.post('/admin/services', requireAdmin, serviceCreateValidator, async (req, res) => {
  const { code, name, category, description, labor_hours, hourly_rate, compatible_brands } = req.body;
  try {
    await dbHelpers.createService({ code, name, category, description, labor_hours, hourly_rate, compatible_brands });
    await dbHelpers.logActivity(req.session.user.id, 'create', 'service', null, `Создана услуга ${code}`);
    res.redirect('/admin/services');
  } catch (e) {
    res.render('error', { message: 'Ошибка: ' + e.message });
  }
});

app.post('/admin/services/:id', requireAdmin, serviceUpdateValidator, async (req, res) => {
  const { code, name, category, description, labor_hours, hourly_rate, compatible_brands } = req.body;
  try {
    await dbHelpers.updateService(req.params.id, { code, name, category, description, labor_hours, hourly_rate, compatible_brands });
    await dbHelpers.logActivity(req.session.user.id, 'update', 'service', req.params.id, `Обновлена услуга ${code}`);
    res.redirect('/admin/services');
  } catch (e) {
    res.render('error', { message: 'Ошибка: ' + e.message });
  }
});

app.post('/admin/services/:id/delete', requireAdmin, async (req, res) => {
  await dbHelpers.deleteService(req.params.id);
  await dbHelpers.logActivity(req.session.user.id, 'delete', 'service', req.params.id, 'Услуга удалена');
  res.redirect('/admin/services');
});

app.post('/admin/services/:id/restore', requireAdmin, async (req, res) => {
  await dbHelpers.restoreService(req.params.id);
  await dbHelpers.logActivity(req.session.user.id, 'restore', 'service', req.params.id, 'Услуга восстановлена');
  res.redirect('/admin/services');
});

// Admin appointments
app.get('/admin/appointments', requireStaff, async (req, res) => {
  const appointments = await dbHelpers.getAppointments();
  res.render('admin/appointments', { appointments, activePage: 'appointments', title: 'Записи', breadcrumbs: 'Операции / Записи' });
});

app.post('/admin/appointments/:id/confirm', requireStaff, async (req, res) => {
  const app = await dbHelpers.get('SELECT client_id FROM appointments WHERE id = ?', [req.params.id]);
  await dbHelpers.run('UPDATE appointments SET status = "confirmed" WHERE id = ?', [req.params.id]);
  if (app) await dbHelpers.addNotification(app.client_id, 'appointment', 'Запись подтверждена', 'Ваша запись подтверждена администратором');
  res.redirect('/admin/appointments');
});

app.post('/admin/appointments/:id/reject', requireStaff, async (req, res) => {
  const app = await dbHelpers.get('SELECT client_id FROM appointments WHERE id = ?', [req.params.id]);
  await dbHelpers.run('UPDATE appointments SET status = "rejected" WHERE id = ?', [req.params.id]);
  if (app) await dbHelpers.addNotification(app.client_id, 'appointment', 'Запись отклонена', 'К сожалению, запись не может быть выполнена');
  res.redirect('/admin/appointments');
});

// Admin warehouse
app.get('/admin/warehouse', requireStaff, async (req, res) => {
  const parts = await dbHelpers.getAllParts();
  const criticalParts = await dbHelpers.getCriticalParts();
  const suppliers = await dbHelpers.all('SELECT * FROM suppliers', []);
  res.render('admin/warehouse', { parts, criticalParts, suppliers, activePage: 'warehouse', title: 'Склад', breadcrumbs: 'Операции / Склад' });
});

app.post('/admin/warehouse/parts', requireAdmin, async (req, res) => {
  const { article, name, manufacturer, category, stock_main, min_stock, purchase_price, sale_price } = req.body;
  await dbHelpers.run(
    'INSERT INTO parts (article, name, manufacturer, category, stock_main, min_stock, purchase_price, sale_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [article, name, manufacturer, category, stock_main || 0, min_stock || 5, purchase_price || 0, sale_price || 0]
  );
  res.redirect('/admin/warehouse');
});

app.post('/admin/warehouse/parts/:id/restock', requireStaff, async (req, res) => {
  const { quantity } = req.body;
  await dbHelpers.run('UPDATE parts SET stock_main = stock_main + ? WHERE id = ?', [quantity, req.params.id]);
  res.redirect('/admin/warehouse');
});

// Admin pricelist (redirect to services)
app.get('/admin/pricelist', requireStaff, (req, res) => res.redirect('/admin/services'));

// Admin finance
app.get('/admin/finance', requireAdmin, async (req, res) => {
  const payments = await dbHelpers.all(
    'SELECT p.*, u.full_name as client_name, wo.order_number FROM payments p JOIN users u ON p.client_id = u.id LEFT JOIN work_orders wo ON p.order_id = wo.id ORDER BY p.created_at DESC LIMIT 50',
    []
  );
  const totalRevenue = await dbHelpers.get('SELECT COALESCE(SUM(amount), 0) as total FROM payments', []);
  const todayRevenue = await dbHelpers.get('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE DATE(created_at) = DATE("now")', []);
  res.render('admin/finance', { payments, totalRevenue, todayRevenue, activePage: 'finance', title: 'Финансы', breadcrumbs: 'Операции / Финансы' });
});

// Admin reports
app.get('/admin/reports', requireAdmin, async (req, res) => {
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
});

// Admin staff
app.get('/admin/staff', requireAdmin, async (req, res) => {
  const staff = await dbHelpers.all('SELECT * FROM users WHERE role IN ("admin", "mechanic", "receptionist") ORDER BY role, full_name', []);
  res.render('admin/staff', { staff, activePage: 'staff', title: 'Персонал', breadcrumbs: 'Управление / Персонал' });
});

app.post('/admin/staff', requireAdmin, async (req, res) => {
  const { email, password, full_name, phone, role } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  await dbHelpers.run('INSERT INTO users (email, password, role, full_name, phone) VALUES (?, ?, ?, ?, ?)', [email, hash, role, full_name, phone]);
  res.redirect('/admin/staff');
});

// Admin invoices
app.get('/admin/invoices', requireStaff, async (req, res) => {
  const invoices = await dbHelpers.getInvoices();
  const clients = await dbHelpers.all('SELECT id, full_name FROM users WHERE role = "client" ORDER BY full_name', []);
  res.render('admin/invoices', { invoices, clients, activePage: 'invoices', title: 'Счета', breadcrumbs: 'Операции / Счета' });
});

app.post('/admin/invoices', requireStaff, invoiceValidator, async (req, res) => {
  const { client_id, amount, description, due_date, order_id } = req.body;
  const invoiceNumber = 'INV-' + Date.now();
  await dbHelpers.run(
    'INSERT INTO invoices (invoice_number, client_id, order_id, amount, description, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [invoiceNumber, client_id, order_id || null, amount, description, due_date || null, req.session.user.id]
  );
  await dbHelpers.addNotification(client_id, 'invoice', 'Новый счёт', `Выставлен счёт ${invoiceNumber} на ₽${amount}`);
  res.redirect('/admin/invoices');
});

app.post('/admin/invoices/:id/pay', requireStaff, async (req, res) => {
  await dbHelpers.run('UPDATE invoices SET status = "paid", paid_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
  const invoice = await dbHelpers.get('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
  if (invoice) {
    await dbHelpers.run('INSERT INTO payments (client_id, invoice_id, amount, payment_method) VALUES (?, ?, ?, "cash")', [invoice.client_id, invoice.id, invoice.amount]);
  }
  res.redirect('/admin/invoices');
});

// Admin notifications
app.get('/admin/notifications', requireStaff, async (req, res) => {
  const notifications = await dbHelpers.getNotifications(req.session.user.id);
  await dbHelpers.markRead(req.session.user.id);
  res.render('admin/notifications', { notifications, activePage: 'notifications', title: 'Уведомления', breadcrumbs: 'Управление / Уведомления' });
});

// API
app.get('/api/cars/:clientId', requireAuth, async (req, res) => {
  res.json(await dbHelpers.getClientCars(req.params.clientId));
});

app.get('/api/stats', requireStaff, async (req, res) => {
  res.json(await dbHelpers.getStats());
});

app.get('/api/notifications/unread', requireAuth, async (req, res) => {
  res.json(await dbHelpers.getUnreadCount(req.session.user.id));
});

// Error handlers
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { message: 'Что-то пошло не так!' });
});

app.use((req, res) => {
  res.status(404).render('error', { message: 'Страница не найдена' });
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