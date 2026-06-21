const { dbHelpers } = require('../database');

function requireAuth(req, res, next) {
  if (!req.session.user) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ error: 'Требуется авторизация' });
      }
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('error', { message: 'Доступ запрещен' });
    }
    next();
  };
}

function requireAdmin(req, res, next) {
  return requireRole(['admin'])(req, res, next);
}

function requireStaff(req, res, next) {
  return requireRole(['admin', 'mechanic', 'receptionist'])(req, res, next);
}

function setUserLocals(req, res, next) {
  res.locals.user = req.session.user || null;
  res.locals.userRole = req.session.user ? req.session.user.role : null;
  res.locals.isAdmin = req.session.user?.role === 'admin';
  res.locals.isStaff = ['admin', 'mechanic', 'receptionist'].includes(req.session.user?.role);
  res.locals.isClient = req.session.user?.role === 'client';
  next();
}

module.exports = { requireAuth, requireRole, requireAdmin, requireStaff, setUserLocals };
