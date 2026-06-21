const { body, param } = require('express-validator');

// Auth validators
const registerValidator = [
  body('email').isEmail().normalizeEmail().withMessage('Введите корректный email'),
  body('password').isLength({ min: 6 }).withMessage('Пароль минимум 6 символов'),
  body('full_name').trim().notEmpty().withMessage('ФИО обязательно').isLength({ max: 255 }),
  body('phone').optional().trim().matches(/^\+?[\d\s\-\(\)]{7,20}$/).withMessage('Неверный формат телефона'),
  body('company_name').optional().trim().isLength({ max: 255 }),
  body('inn').optional().trim().matches(/^\d{10,12}$/).withMessage('ИНН 10-12 цифр'),
  body('kpp').optional().trim().matches(/^\d{9}$/).withMessage('КПП 9 цифр')
];

const loginValidator = [
  body('email').isEmail().normalizeEmail().withMessage('Введите корректный email'),
  body('password').notEmpty().withMessage('Введите пароль')
];

// Car validators
const carValidator = [
  body('brand').trim().notEmpty().withMessage('Марка обязательна').isLength({ max: 100 }),
  body('model').trim().notEmpty().withMessage('Модель обязательна').isLength({ max: 100 }),
  body('year').optional().isInt({ min: 1900, max: 2030 }).withMessage('Год 1900-2030'),
  body('vin').optional().trim().matches(/^[A-HJ-NPR-Z0-9]{17}$/i).withMessage('VIN 17 символов'),
  body('license_plate').optional().trim().isLength({ max: 20 }),
  body('mileage').optional().isInt({ min: 0 }).withMessage('Пробег не может быть отрицательным')
];

// Service CRUD validators
const serviceCreateValidator = [
  body('code').trim().notEmpty().withMessage('Код работы обязателен').isLength({ max: 50 })
    .matches(/^[A-Z0-9\-]+$/).withMessage('Код: только заглавные буквы, цифры и дефис'),
  body('name').trim().notEmpty().withMessage('Название обязательно').isLength({ max: 255 }),
  body('category').trim().notEmpty().withMessage('Категория обязательна').isLength({ max: 100 }),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('labor_hours').isFloat({ min: 0.1, max: 1000 }).withMessage('Нормо-час 0.1-1000'),
  body('hourly_rate').optional().isInt({ min: 1 }).withMessage('Ставка от 1 рубля'),
  body('compatible_brands').optional().trim().isLength({ max: 500 })
];

const serviceUpdateValidator = [
  param('id').isInt({ min: 1 }).withMessage('ID должен быть числом'),
  body('code').trim().notEmpty().withMessage('Код работы обязателен').isLength({ max: 50 }),
  body('name').trim().notEmpty().withMessage('Название обязательно').isLength({ max: 255 }),
  body('category').trim().notEmpty().withMessage('Категория обязательна'),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('labor_hours').isFloat({ min: 0.1, max: 1000 }).withMessage('Нормо-час 0.1-1000'),
  body('hourly_rate').isInt({ min: 1 }).withMessage('Ставка от 1 рубля'),
  body('compatible_brands').optional().trim()
];

// Order validators
const orderValidator = [
  body('client_id').isInt({ min: 1 }).withMessage('Выберите клиента'),
  body('car_id').optional().isInt({ min: 1 }),
  body('mechanic_id').optional().isInt({ min: 1 }),
  body('post_number').optional().isInt({ min: 1, max: 20 }),
  body('status').isIn(['created', 'in_progress', 'waiting_parts', 'ready', 'completed', 'cancelled']).withMessage('Неверный статус'),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('scheduled_date').optional().isISO8601().withMessage('Неверный формат даты')
];

// Invoice validators
const invoiceValidator = [
  body('client_id').isInt({ min: 1 }).withMessage('Выберите клиента'),
  body('amount').isInt({ min: 1 }).withMessage('Сумма от 1 рубля'),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('due_date').optional().isISO8601(),
  body('order_id').optional().isInt({ min: 1 })
];

// Appointment validators
const appointmentValidator = [
  body('car_id').optional().isInt({ min: 1 }),
  body('service_id').optional().isInt({ min: 1 }),
  body('appointment_date').isISO8601().withMessage('Выберите дату'),
  body('appointment_time').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Неверное время'),
  body('notes').optional().trim().isLength({ max: 1000 })
];

// Part validators
const partValidator = [
  body('article').trim().notEmpty().withMessage('Артикул обязателен').isLength({ max: 100 }),
  body('name').trim().notEmpty().withMessage('Название обязательно').isLength({ max: 255 }),
  body('category').trim().notEmpty().withMessage('Категория обязательна'),
  body('stock_main').isInt({ min: 0 }).withMessage('Остаток не может быть отрицательным'),
  body('min_stock').isInt({ min: 0 }),
  body('purchase_price').isInt({ min: 0 }),
  body('sale_price').isInt({ min: 1 }).withMessage('Цена продажи от 1 рубля')
];

module.exports = {
  registerValidator,
  loginValidator,
  carValidator,
  serviceCreateValidator,
  serviceUpdateValidator,
  orderValidator,
  invoiceValidator,
  appointmentValidator,
  partValidator
};