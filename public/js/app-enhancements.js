// ============================================================
// ВОСКАН АВТО — УЛУЧШЕННЫЙ JAVASCRIPT
// Тёмная тема | Автосохранение | Пуш-уведомления | Сравнение | Калькулятор
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  initTheme();
  initAutosave();
  initCalculator();
  initCompare();
  initPushNotifications();
  initReminders();
  initStarRating();
  initMobileMenu();
});

// ============================================================
// 1. ТЁМНАЯ ТЕМА
// ============================================================
function initTheme() {
  const themeToggle = document.getElementById('themeToggle');
  const html = document.documentElement;

  // Загрузка сохранённой темы
  const savedTheme = localStorage.getItem('voskanauto-theme') || 'light';
  html.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  if (themeToggle) {
    themeToggle.addEventListener('click', async function() {
      const current = html.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';

      html.setAttribute('data-theme', next);
      localStorage.setItem('voskanauto-theme', next);
      updateThemeIcon(next);

      // Сохранение на сервере
      try {
        await fetch('/api/theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme: next })
        });
      } catch(e) {}

      // Анимация переключения
      themeToggle.style.transform = 'scale(0.8) rotate(180deg)';
      setTimeout(() => {
        themeToggle.style.transform = 'scale(1) rotate(0deg)';
      }, 300);
    });
  }
}

function updateThemeIcon(theme) {
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;

  if (theme === 'dark') {
    toggle.innerHTML = '🌙';
    toggle.title = 'Переключить на светлую тему';
  } else {
    toggle.innerHTML = '☀️';
    toggle.title = 'Переключить на тёмную тему';
  }
}

// ============================================================
// 2. АВТОСОХРАНЕНИЕ ФОРМ
// ============================================================
function initAutosave() {
  const forms = document.querySelectorAll('form[data-autosave]');

  forms.forEach(form => {
    const formId = form.getAttribute('data-autosave');
    if (!formId) return;

    const storageKey = 'voskanauto_autosave_' + formId;
    const savedData = localStorage.getItem(storageKey);

    // Восстановление данных
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        Object.keys(data).forEach(key => {
          const input = form.querySelector('[name="' + key + '"]');
          if (input && !input.value && input.type !== 'password' && input.type !== 'file') {
            input.value = data[key];
            input.classList.add('autosave-restored');
          }
        });

        // Показать индикатор восстановления
        showAutosaveIndicator('Данные восстановлены', 'warning');
      } catch(e) {}
    }

    // Автосохранение при вводе
    const inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      input.addEventListener('input', debounce(function() {
        const data = {};
        inputs.forEach(i => {
          if (i.name && i.type !== 'password' && i.type !== 'file' && i.type !== 'hidden') {
            data[i.name] = i.value;
          }
        });
        localStorage.setItem(storageKey, JSON.stringify(data));
        showAutosaveIndicator('Сохранено автоматически');
      }, 800));
    });

    // Очистка при отправке
    form.addEventListener('submit', function() {
      localStorage.removeItem(storageKey);
      inputs.forEach(i => i.classList.remove('autosave-restored'));
    });
  });
}

function showAutosaveIndicator(text, type = 'success') {
  let indicator = document.getElementById('autosaveIndicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'autosaveIndicator';
    indicator.className = 'autosave-indicator';
    document.body.appendChild(indicator);
  }

  indicator.textContent = text;
  indicator.style.background = type === 'warning' ? 'var(--warning)' : 'var(--success)';
  indicator.classList.add('show');

  clearTimeout(indicator._timeout);
  indicator._timeout = setTimeout(() => {
    indicator.classList.remove('show');
  }, 2000);
}

function debounce(fn, ms) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ============================================================
// 3. КАЛЬКУЛЯТОР СТОИМОСТИ
// ============================================================
function initCalculator() {
  const calculators = document.querySelectorAll('[data-calculator]');

  calculators.forEach(calc => {
    const checkboxes = calc.querySelectorAll('input[type="checkbox"][data-price]');
    const totalEl = calc.querySelector('[data-total]');

    function calculate() {
      let total = 0;
      let selectedCount = 0;

      checkboxes.forEach(cb => {
        if (cb.checked) {
          const price = parseFloat(cb.dataset.price) || 0;
          const qty = parseInt(cb.dataset.qty) || 1;
          total += price * qty;
          selectedCount++;
        }
      });

      if (totalEl) {
        totalEl.textContent = total.toLocaleString('ru-RU') + ' ₽';
        totalEl.style.transform = 'scale(1.05)';
        setTimeout(() => totalEl.style.transform = 'scale(1)', 200);
      }

      // Обновить счётчик выбранных
      const counter = calc.querySelector('[data-selected-count]');
      if (counter) counter.textContent = selectedCount;
    }

    checkboxes.forEach(cb => {
      cb.addEventListener('change', calculate);
    });

    // Радиокнопки (для взаимоисключающих опций)
    const radios = calc.querySelectorAll('input[type="radio"][data-price]');
    radios.forEach(radio => {
      radio.addEventListener('change', calculate);
    });

    calculate();
  });
}

// ============================================================
// 4. СРАВНЕНИЕ УСЛУГ
// ============================================================
function initCompare() {
  window.compareList = JSON.parse(localStorage.getItem('voskanauto_compare') || '[]');
  updateCompareUI();
}

window.toggleCompare = function(serviceId) {
  const idx = window.compareList.indexOf(serviceId);

  if (idx > -1) {
    window.compareList.splice(idx, 1);
  } else if (window.compareList.length < 3) {
    window.compareList.push(serviceId);
  } else {
    showToast('Можно сравнить максимум 3 услуги', 'warning');
    return;
  }

  localStorage.setItem('voskanauto_compare', JSON.stringify(window.compareList));
  updateCompareUI();

  const btn = document.querySelector('.compare-btn[data-id="' + serviceId + '"]');
  if (btn) {
    btn.style.transform = 'scale(0.9)';
    setTimeout(() => btn.style.transform = 'scale(1)', 200);
  }
};

window.showCompare = async function() {
  if (window.compareList.length < 2) {
    showToast('Выберите минимум 2 услуги для сравнения', 'warning');
    return;
  }

  try {
    const response = await fetch('/api/services/compare?ids=' + window.compareList.join(','));
    const services = await response.json();

    const modal = document.getElementById('compareModal');
    const content = document.getElementById('compareContent');

    let html = '<div class="table-responsive"><table class="table"><thead><tr><th style="min-width:150px">Параметр</th>';
    services.forEach(s => {
      html += '<th style="min-width:180px">' + escapeHtml(s.name) + '</th>';
    });
    html += '</tr></thead><tbody>';

    const rows = [
      { label: 'Категория', key: 'category' },
      { label: 'Код', key: 'code' },
      { label: 'Норма часов', key: 'labor_hours' },
      { label: 'Ставка/час', key: 'hourly_rate', format: v => v.toLocaleString('ru-RU') + ' ₽' },
      { label: 'Стоимость работы', key: null, calc: s => (s.labor_hours * s.hourly_rate).toLocaleString('ru-RU') + ' ₽' },
      { label: 'Описание', key: 'description' }
    ];

    rows.forEach(row => {
      html += '<tr><td class="fw-bold">' + row.label + '</td>';
      services.forEach(s => {
        let val = '-';
        if (row.calc) {
          val = row.calc(s);
        } else if (row.format) {
          val = row.format(s[row.key]);
        } else {
          val = s[row.key] || '—';
        }
        html += '<td>' + escapeHtml(String(val)) + '</td>';
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';

    if (content) content.innerHTML = html;

    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();

  } catch(e) {
    showToast('Ошибка загрузки сравнения', 'danger');
  }
};

function updateCompareUI() {
  document.querySelectorAll('.compare-btn').forEach(btn => {
    const id = parseInt(btn.dataset.id);
    const isActive = window.compareList.includes(id);
    btn.classList.toggle('btn-primary', isActive);
    btn.classList.toggle('btn-outline-secondary', !isActive);
    btn.textContent = isActive ? '✓ В сравнении' : 'Сравнить';
  });

  const counter = document.getElementById('compareCounter');
  if (counter) {
    counter.textContent = window.compareList.length;
    counter.style.display = window.compareList.length > 0 ? 'inline' : 'none';
  }

  const bar = document.getElementById('compareBar');
  if (bar) {
    bar.style.display = window.compareList.length > 0 ? 'flex' : 'none';
  }
}

window.clearCompare = function() {
  window.compareList = [];
  localStorage.removeItem('voskanauto_compare');
  updateCompareUI();
};

// ============================================================
// 5. ПУШ-УВЕДОМЛЕНИЯ
// ============================================================
function initPushNotifications() {
  if (!('Notification' in window)) return;

  const enableBtn = document.getElementById('enablePush');
  if (enableBtn) {
    enableBtn.addEventListener('click', requestPushPermission);
  }

  // Проверяем статус
  if (Notification.permission === 'granted') {
    registerServiceWorker();
  }
}

async function requestPushPermission() {
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    registerServiceWorker();
    showToast('Уведомления включены!', 'success');
  } else {
    showToast('Уведомления отключены', 'warning');
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered:', registration);
  } catch(e) {
    console.error('SW registration failed:', e);
  }
}

// ============================================================
// 6. НАПОМИНАНИЯ
// ============================================================
function initReminders() {
  // Проверка напоминаний каждые 5 минут
  checkReminders();
  setInterval(checkReminders, 5 * 60 * 1000);
}

async function checkReminders() {
  try {
    const response = await fetch('/api/reminders/pending');
    const reminders = await response.json();

    reminders.forEach(r => {
      showToast('Напоминание: ' + r.text, 'warning', 10000);
    });
  } catch(e) {}
}

window.completeReminder = async function(id) {
  try {
    await fetch('/admin/reminders/' + id + '/complete', { method: 'POST' });
    const el = document.getElementById('reminder-' + id);
    if (el) el.remove();
    showToast('Напоминание выполнено', 'success');
  } catch(e) {
    showToast('Ошибка', 'danger');
  }
};

// ============================================================
// 7. ЗВЁЗДОЧКИ РЕЙТИНГА
// ============================================================
function initStarRating() {
  const containers = document.querySelectorAll('.star-rating-input');

  containers.forEach(container => {
    const input = container.querySelector('input[type="hidden"]');
    const stars = container.querySelectorAll('.star');
    let currentRating = 0;

    stars.forEach((star, index) => {
      star.addEventListener('mouseenter', () => {
        highlightStars(stars, index + 1);
      });

      star.addEventListener('mouseleave', () => {
        highlightStars(stars, currentRating);
      });

      star.addEventListener('click', () => {
        currentRating = index + 1;
        if (input) input.value = currentRating;
        highlightStars(stars, currentRating);

        // Анимация
        star.style.transform = 'scale(1.4)';
        setTimeout(() => star.style.transform = 'scale(1.2)', 200);
      });
    });
  });
}

function highlightStars(stars, count) {
  stars.forEach((star, index) => {
    star.classList.toggle('active', index < count);
  });
}

// ============================================================
// 8. МОБИЛЬНОЕ МЕНЮ
// ============================================================
function initMobileMenu() {
  const toggle = document.getElementById('mobileMenuToggle');
  const sidebar = document.querySelector('.sidebar');

  if (toggle && sidebar) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    // Закрыть при клике вне меню
    document.addEventListener('click', (e) => {
      if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }
}

// ============================================================
// УТИЛИТЫ
// ============================================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'toast align-items-center text-white bg-' + type + ' border-0';
  toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;min-width:250px;';
  toast.innerHTML = '<div class="d-flex"><div class="toast-body">' + escapeHtml(message) + '</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>';

  document.body.appendChild(toast);
  const bsToast = new bootstrap.Toast(toast, { delay: duration });
  bsToast.show();

  toast.addEventListener('hidden.bs.toast', () => toast.remove());
}

// ============================================================
// ПЕЧАТЬ
// ============================================================
window.printOrder = function() {
  window.print();
};

// ============================================================
// ПОДТВЕРЖДЕНИЕ ДЕЙСТВИЙ
// ============================================================
window.confirmAction = function(message, callback) {
  if (confirm(message)) {
    callback();
  }
};

// ============================================================
// КОПИРОВАНИЕ В БУФЕР
// ============================================================
window.copyToClipboard = async function(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Скопировано!', 'success');
  } catch(e) {
    showToast('Ошибка копирования', 'danger');
  }
};
