'use strict';
// حلقة التحفيظ: الأدوات المشتركة، الدخول، القائمة والتوجيه. صفحات المتابعة في quran.js

const state = { user: null };
const $ = (sel, root = document) => root.querySelector(sel);

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
function today() {
  // اليوم حسب ساعة الهاتف
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function avatar(u, cls = '') {
  return `<span class="avatar ${cls}">${esc((u.full_name || '?').trim().charAt(0))}</span>`;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') {
    state.user = null;
    location.hash = '#/login';
  }
  if (!res.ok) throw new Error(data.error || 'حدث خطأ');
  return data;
}

function toast(message, isError = false) {
  const el = $('#toast');
  const dlg = $('#modal');
  const host = dlg?.open ? dlg : document.body;
  if (el.parentNode !== host) host.append(el);
  el.textContent = message;
  el.className = 'toast' + (isError ? ' error' : '');
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 3000);
}

function formData(form) {
  const data = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') data[el.name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) data[el.name] = el.value;
    } else data[el.name] = el.value;
  }
  return data;
}

// نافذة منبثقة: onSubmit يرجع وعدًا، والخطأ يظهر داخل النافذة
function openModal(title, bodyHtml, onSubmit) {
  const dialog = $('#modal');
  const form = $('#modal-form');
  const error = $('#modal-error');
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHtml;
  form.querySelectorAll('.actions .extra').forEach((b) => b.remove());
  error.hidden = true;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await onSubmit(formData(form));
      dialog.close();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      btn.disabled = false;
    }
  };
  $('#modal-cancel').onclick = () => dialog.close();
  dialog.showModal();
}
const confirmAction = (message) => window.confirm(message);

function heroBanner({ sub = '', art = '📖', actions = '' } = {}) {
  const h = new Date().getHours();
  const hello = h < 12 ? 'صباح الخير' : 'مساء الخير';
  const first = esc(String(state.user?.full_name || '').split(' ')[0]);
  const day = new Date().toLocaleDateString('ar-TN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `<section class="hero"><div>
      <small>${esc(day)}</small>
      <h2>${hello}${first ? `، ${first}` : ''} 👋</h2>
      ${sub ? `<p>${sub}</p>` : ''}
      ${actions ? `<div class="hero-actions">${actions}</div>` : ''}
    </div><div class="hero-art" aria-hidden="true">${art}</div></section>`;
}

// ---------- الأيقونات ----------
const ICON_PATHS = {
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
};
const icon = (name) =>
  `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.grid}</svg>`;

const NAV = {
  admin: [['#/home', 'الرئيسية', 'home'], ['#/quran/overview', 'الإجمالية', 'star'], ['#/quran/students', 'الطلبة', 'users'], ['#/quran/groups', 'المجموعات', 'grid'], ['#/account', 'حسابي', 'user']],
  talib: [['#/home', 'متابعتي', 'home'], ['#/my-review', 'مراجعتي', 'star'], ['#/my-hifz', 'محفوظي', 'book'], ['#/account', 'حسابي', 'user']],
};

function renderTopbar() {
  const bar = $('#topbar');
  if (!state.user) {
    bar.hidden = true;
    $('#tabbar').hidden = true;
    document.body.classList.remove('shell');
    return;
  }
  bar.hidden = false;
  document.body.classList.add('shell');
  const current = location.hash.split('?')[0];
  const items = NAV[state.user.role] || [];
  const on = (h) => current === h;
  $('#nav').innerHTML = items.map(([h, l]) => `<a href="${h}" class="${on(h) ? 'active' : ''}">${l}</a>`).join('');
  $('#tabbar').hidden = false;
  $('#tabbar').innerHTML = items.map(([h, l, ic]) => `<a href="${h}" class="${on(h) ? 'on' : ''}">${icon(ic)}<span>${l}</span></a>`).join('');
  $('#who-name').textContent = `${state.user.full_name} · ${state.user.role_label}`;
}

$('#logout').addEventListener('click', async () => {
  await api('POST', '/api/logout').catch(() => {});
  state.user = null;
  location.hash = '#/login';
});

// ---------- الدخول ----------
function viewLogin(el) {
  el.innerHTML = `<div class="login">
    <img src="logo.svg" alt="" class="login-logo">
    <h1>حلقة التحفيظ</h1>
    <p class="muted">متابعة حفظ القرآن الكريم ومراجعته</p>
    <p class="ayah">﴿وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا﴾</p>
    <form id="login-form" class="card">
      <label>اسم المستخدم<input name="username" required autocomplete="username" dir="auto"></label>
      <label>كلمة السر<span class="pw"><input name="password" type="password" required autocomplete="current-password">
        <button type="button" class="pw-eye" id="pw-eye" aria-label="إظهار كلمة السر">👁</button></span></label>
      <p class="error" id="login-error" hidden></p>
      <button class="btn block" type="submit">دخول</button>
    </form>
    <div id="google-box" class="card google-box" hidden>
      <p><b>طالب جديد؟</b> سجّل بحساب Google، والشيخ يؤكّد تسجيلك. (ومن له حساب مربوط بـ Google يدخل به مباشرة.)</p>
      <div id="google-btn"></div></div>
    <p class="muted small">ليس لديك حساب؟ سجّل بـ Google أو اطلبه من شيخك.</p>
  </div>`;
  setupGoogleLogin();
  $('#pw-eye').addEventListener('click', () => {
    const i = $('#login-form input[name=password]');
    i.type = i.type === 'password' ? 'text' : 'password';
  });
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const { user } = await api('POST', '/api/login', formData(e.target));
      state.user = user;
      location.hash = '#/home';
    } catch (err) {
      $('#login-error').textContent = err.message;
      $('#login-error').hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
}

function viewAccount(el) {
  const u = state.user;
  el.innerHTML = `<div class="card narrow"><h2>حسابي</h2>
      <p>${avatar(u, 'md')} <b>${esc(u.full_name)}</b> · ${esc(u.role_label)} · <span dir="ltr" class="muted">${esc(u.username)}</span></p>
      <form id="me-form"><label>الاسم<input name="full_name" required value="${esc(u.full_name)}"></label>
        <label>الهاتف<input name="phone" type="tel" value="${esc(u.phone || '')}"></label>
        ${u.role !== 'talib' ? `<label>البريد الإلكتروني (يمكن الدخول به)<input name="email" type="email" dir="ltr" value="${esc(u.email || '')}"></label>` : ''}
        <button class="btn" type="submit">حفظ</button></form></div>
    <div class="card narrow"><h3>تغيير كلمة السر</h3>
      <form id="pw-form"><label>كلمة السر الحالية<input name="current" type="password" required autocomplete="current-password"></label>
        <label>كلمة السر الجديدة<input name="next" type="password" required minlength="6" autocomplete="new-password"></label>
        <button class="btn" type="submit">تغيير</button></form></div>
    <div class="card narrow" id="g-card"></div>
    ${u.role === 'admin' ? '<div class="card narrow" id="admins"></div>' : ''}`;
  googleAccountCard($('#g-card'));
  if (u.role === 'admin') adminsCard($('#admins'));
  $('#me-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      state.user = (await api('PUT', '/api/me', formData(e.target))).user;
      renderTopbar();
      toast('تم الحفظ ✓');
    } catch (err) {
      toast(err.message, true);
    }
  });
  $('#pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/api/me/password', formData(e.target));
      e.target.reset();
      toast('تم تغيير كلمة السر ✓');
    } catch (err) {
      toast(err.message, true);
    }
  });
}

// المشرفون (الشيخ والإدارة): نفس الصلاحيات
async function adminsCard(box) {
  const { admins } = await api('GET', '/api/admins');
  box.innerHTML = `<div class="section-head"><h3>المشرفون</h3><button type="button" class="btn small" id="adm-add">＋ مشرف</button></div>
    <p class="muted small">كل مشرف (الشيخ أو الإدارة) له نفس الصلاحيات: الطلبة، المجموعات، المحفوظ، المراجعة، التقييم.</p>
    <ul class="levels">${admins
      .map((a) => `<li><span><b>${esc(a.full_name)}</b> <span class="muted small" dir="ltr">${esc(a.username)}</span>${a.id === state.user.id ? ' <span class="pill">أنت</span>' : ''}</span>
        <span class="row-actions"><button type="button" class="btn small ghost" data-edit="${a.id}">تعديل</button>
        ${a.id === state.user.id ? '' : `<button type="button" class="btn small ghost danger" data-del="${a.id}">حذف</button>`}</span></li>`)
      .join('')}</ul>`;
  const form = (a) =>
    openModal(
      a ? 'تعديل حساب المشرف' : 'مشرف جديد',
      `<label>الاسم<input name="full_name" required value="${esc(a?.full_name || '')}" placeholder="مثال: الشيخ أيوب"></label>
       ${a ? '' : '<label>اسم المستخدم<input name="username" required dir="ltr" autocomplete="off"></label>'}
       <label>الهاتف<input name="phone" type="tel" value="${esc(a?.phone || '')}"></label>
       <label>${a ? 'كلمة سر جديدة (اختياري)' : 'كلمة السر'}<input name="password" ${a ? '' : 'required'} minlength="6" autocomplete="new-password"></label>`,
      async (data) => {
        await api(a ? 'PUT' : 'POST', a ? `/api/admins/${a.id}` : '/api/admins', data);
        toast('تم الحفظ ✓');
        adminsCard(box);
      }
    );
  $('#adm-add').addEventListener('click', () => form(null));
  box.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => form(admins.find((a) => a.id === Number(b.dataset.edit)))));
  box.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirmAction('حذف حساب هذا المشرف؟')) return;
      await api('DELETE', `/api/admins/${b.dataset.del}`).catch((e) => toast(e.message, true));
      adminsCard(box);
    })
  );
}

// ---------- التوجيه (quran.js يضيف مساراته) ----------
const routes = [
  [/^#\/login$/, viewLogin],
  [/^#\/account$/, viewAccount],
  [/^#\/home$/, (el) => (state.user.role === 'talib' ? viewQuranStudent(el, state.user.id) : viewQuranHome(el))],
];

let navCount = 0;
async function router() {
  const hash = location.hash || '#/';
  if (!state.user && hash !== '#/login') {
    try {
      state.user = (await api('GET', '/api/me')).user;
    } catch {
      location.hash = '#/login';
      return;
    }
  }
  if ($('#modal').open) $('#modal').close();
  if (state.user && (hash === '#/' || hash === '#/login')) {
    location.hash = '#/home';
    return;
  }
  renderTopbar();
  const nav = ++navCount;
  for (const [re, view] of routes) {
    const m = hash.match(re);
    if (!m) continue;
    const el = $('#view');
    el.innerHTML = '<p class="muted loading">جاري التحميل…</p>';
    try {
      await view(el, ...m.slice(1));
    } catch (err) {
      if (nav === navCount) el.innerHTML = `<div class="card"><p class="error">${esc(err.message)}</p><p><button class="btn small ghost" onclick="location.reload()">إعادة تحميل الصفحة</button></p></div>`;
    }
    window.scrollTo(0, 0);
    return;
  }
  location.hash = state.user ? '#/home' : '#/login';
}
window.addEventListener('hashchange', router);
