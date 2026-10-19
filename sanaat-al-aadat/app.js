'use strict';
// صناعة العادات: تسجيل (Google أو إيميل)، عاداتي، الترتيب، والإدارة

const DAYS = ['إث', 'ثل', 'أر', 'خم', 'جم', 'سب', 'أح'];
const MEDALS = ['🥇', '🥈', '🥉'];
const PERIODS = { week: 'هذا الأسبوع', month: 'هذا الشهر', all: 'منذ البداية' };
const EDIT_DAYS = 7;

const sb = supabase.createClient(window.APP_CONFIG.supabaseUrl, window.APP_CONFIG.supabaseKey);

const S = {
  session: null, me: null, challenges: [], myLogs: new Set(), ranks: {},
  tab: 'habits', week: 0, period: 'week', boardId: null, board: null,
  detailId: null, month: null, details: null, editing: null, pending: null, authMode: 'login',
};

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const diff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
// اليوم بتوقيت تونس (نفس توقيت قاعدة البيانات)
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis' }).format(new Date());
const weekStart = (s) => addDays(s, -((parse(s).getDay() + 6) % 7));
const fmt = (s) => { const [, m, d] = s.split('-'); return `${d}/${m}`; };
const medal = (r, done) => (done && r <= 3 ? MEDALS[r - 1] : r);
const key = (cid, day) => `${cid}|${day}`;
const openChallenges = () => S.challenges.filter((c) => c.active && c.start_date <= today());

function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' err' : '');
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 2800);
}

const AUTH_ERRORS = {
  'Invalid login credentials': 'الإيميل أو كلمة السر غير صحيحة.',
  'Email not confirmed': 'أكّد بريدك أولًا من الرسالة التي وصلتك.',
  'User already registered': 'هذا الإيميل مسجّل، ادخل بكلمة السر.',
};
const authError = (e) => AUTH_ERRORS[e?.message] || (/at least 6/.test(e?.message || '') ? 'كلمة السر 6 أحرف على الأقل.' : e?.message || 'حدث خطأ');

// ---------- التسجيل والدخول ----------
function renderAuth() {
  $('#tabs').hidden = true;
  $('#logout').hidden = true;
  $('#who').textContent = '';
  const signup = S.authMode === 'signup';
  const reset = S.authMode === 'reset';
  $('#view').innerHTML = `<div class="auth">
    <div class="card" style="display:grid;gap:.4rem">
      <h2>كل عادة يومية تحدٍّ</h2>
      <p class="muted small" style="margin:0">صلاة الصبح في المسجد، ورد القرآن، الأذكار… سجّل أيامك وشاهد سلسلتك وترتيبك بين المشاركين.</p>
    </div>
    <div class="card" style="display:grid;gap:.8rem">
      <button class="btn google" type="button" id="google">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        الدخول بحساب Google</button>
      <div class="or">أو بالإيميل</div>
      ${reset ? '' : `<div class="seg"><button type="button" data-mode="login" aria-pressed="${!signup}">دخول</button><button type="button" data-mode="signup" aria-pressed="${signup}">حساب جديد</button></div>`}
      <form id="auth-form" novalidate>
        ${signup ? '<label>الاسم (يظهر في الترتيب)<input id="a-name" maxlength="60" required autocomplete="name"></label>' : ''}
        <label>الإيميل<input id="a-email" type="email" required autocomplete="email" dir="ltr"></label>
        ${reset ? '' : `<label>كلمة السر<input id="a-pass" type="password" minlength="6" required autocomplete="${signup ? 'new-password' : 'current-password'}" dir="ltr"></label>`}
        <p class="error" id="a-err" hidden></p>
        <button class="btn" type="submit">${reset ? 'إرسال رابط تغيير كلمة السر' : signup ? 'إنشاء الحساب' : 'دخول'}</button>
        ${reset ? '<button class="link small" type="button" data-mode="login">→ رجوع للدخول</button>' : signup ? '' : '<button class="link small" type="button" data-mode="reset">نسيت كلمة السر؟</button>'}
      </form>
    </div>
  </div>`;
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { S.authMode = b.dataset.mode; renderAuth(); }));
  $('#google').addEventListener('click', async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    if (error) showErr(error);
  });
  const showErr = (e) => { $('#a-err').textContent = authError(e); $('#a-err').hidden = false; };
  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#a-email').value.trim();
    const btn = e.submitter || $('#auth-form button[type=submit]');
    btn.disabled = true;
    try {
      if (reset) {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        toast('أرسلنا لك رابطًا على بريدك');
      } else if (signup) {
        const name = $('#a-name').value.trim();
        if (!name) throw new Error('الاسم إجباري');
        const { data, error } = await sb.auth.signUp({
          email, password: $('#a-pass').value,
          options: { data: { display_name: name }, emailRedirectTo: location.origin + location.pathname },
        });
        if (error) throw error;
        if (!data.session) {
          $('#view').innerHTML = `<div class="auth"><div class="card"><h3>تحقّق من بريدك 📩</h3>
            <p class="muted">أرسلنا رسالة تأكيد إلى <b dir="ltr">${esc(email)}</b>. اضغط على الرابط فيها ثم ادخل.</p></div></div>`;
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password: $('#a-pass').value });
        if (error) throw error;
      }
    } catch (err) {
      showErr(err);
    } finally {
      btn.disabled = false;
    }
  });
}

function renderNewPassword() {
  $('#view').innerHTML = `<div class="auth"><form class="card" id="np-form" style="display:grid;gap:.7rem">
    <h3>كلمة سر جديدة</h3>
    <label>كلمة السر<input id="np" type="password" minlength="6" required dir="ltr" autocomplete="new-password"></label>
    <p class="error" id="np-err" hidden></p>
    <button class="btn" type="submit">حفظ</button></form></div>`;
  $('#np-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: $('#np').value });
    if (error) { $('#np-err').textContent = authError(error); $('#np-err').hidden = false; return; }
    toast('تم تغيير كلمة السر');
    S.recovery = false;
    start();
  });
}

// ---------- تحميل البيانات ----------
async function loadMe() {
  const uid = S.session.user.id;
  let { data } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
  // الحساب قد يُنشأ قبل لحظة من الملف الشخصي
  for (let i = 0; !data && i < 3; i++) {
    await new Promise((r) => setTimeout(r, 600));
    ({ data } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle());
  }
  S.me = data;
}

async function loadHabits() {
  const [{ data: ch }, { data: logs }] = await Promise.all([
    sb.from('challenges').select('*').order('sort').order('id'),
    sb.from('habit_logs').select('challenge_id, day').eq('user_id', S.me.id),
  ]);
  S.challenges = ch || [];
  S.myLogs = new Set((logs || []).map((l) => key(l.challenge_id, l.day)));
  const boards = await Promise.all(openChallenges().map((c) => sb.rpc('leaderboard', { p_challenge: c.id, p_period: 'all' })));
  S.ranks = {};
  openChallenges().forEach((c, i) => {
    const rows = ranked(boards[i].data || []);
    S.ranks[c.id] = { me: rows.find((r) => r.is_me), count: rows.length };
  });
}

function ranked(rows) {
  rows.forEach((r, i) => (r.rank = i && r.days === rows[i - 1].days && r.streak === rows[i - 1].streak ? rows[i - 1].rank : i + 1));
  return rows;
}

function myStats(c) {
  const now = today();
  const last = c.end_date && c.end_date < now ? c.end_date : now;
  const has = (d) => S.myLogs.has(key(c.id, d));
  let streak = 0;
  let d = has(last) ? last : addDays(last, -1);
  while (d >= c.start_date && has(d)) { streak++; d = addDays(d, -1); }
  let done = 0;
  let first = S.me.joined_on;
  for (const k of S.myLogs) {
    const [cid, day] = k.split('|');
    if (Number(cid) === c.id && day >= c.start_date && day <= last) { done++; if (day < first) first = day; }
  }
  const from = first > c.start_date ? first : c.start_date;
  const total = Math.max(last < from ? 0 : diff(from, last) + 1, done);
  return { streak, done, percent: total ? Math.round((done / total) * 100) : 0 };
}

// ---------- العرض ----------
async function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
  $('#tab-admin').hidden = !S.me.is_admin;
  const v = $('#view');
  if (S.tab === 'habits') v.innerHTML = renderHabits();
  else if (S.tab === 'board') v.innerHTML = await renderBoard();
  else v.innerHTML = await renderAdmin();
  bind();
}

function renderHabits() {
  const list = openChallenges();
  const now = today();
  const start = addDays(weekStart(now), S.week * 7);
  const week = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  if (!list.length) {
    return `<div class="card"><h3>لا توجد عادات بعد</h3><p class="muted">${
      S.me.is_admin ? 'أضف أول تحدٍّ من تبويب «الإدارة».' : 'ستظهر هنا العادات عندما يضيفها المشرف.'
    }</p></div>`;
  }
  return `<div class="weeknav">
      <button class="btn ghost small" type="button" data-week="-1">→ الأسبوع السابق</button>
      <span class="small muted">${fmt(week[0])} — ${fmt(week[6])}</span>
      <button class="btn ghost small" type="button" data-week="1" ${S.week >= 0 ? 'disabled' : ''}>الأسبوع التالي ←</button>
    </div>
    ${list
      .map((c) => {
        const st = myStats(c);
        const r = S.ranks[c.id];
        return `<section class="card habit">
          <div class="row"><h3>${esc(c.icon || '⭐')} ${esc(c.title)}</h3>
            <button class="rank-link" type="button" data-board="${c.id}">🏆 ${r?.me && r.me.days ? `الترتيب ${r.me.rank}/${r.count}` : 'الترتيب'}</button></div>
          <div class="stats muted">السلسلة: <b>${st.streak}</b> 🔥 &nbsp;|&nbsp; الإجمالي: <b>${st.percent}%</b> &nbsp;|&nbsp; <span>${st.done} يوم</span></div>
          ${c.description ? `<p class="muted small" style="margin:0">${esc(c.description)}</p>` : ''}
          <div class="days">${week
            .map((d, i) => {
              const done = S.myLogs.has(key(c.id, d));
              const ok = d <= now && d >= c.start_date && (!c.end_date || d <= c.end_date) && (S.me.is_admin || diff(d, now) < EDIT_DAYS);
              return `<button type="button" class="day ${done ? 'done' : ''} ${d === now ? 'today' : ''}" data-c="${c.id}" data-d="${d}"
                aria-pressed="${done}" aria-label="${DAYS[i]} ${fmt(d)}" ${ok ? '' : 'disabled'}>${DAYS[i]}${d === now ? '<small>اليوم</small>' : ''}</button>`;
            })
            .join('')}</div>
        </section>`;
      })
      .join('')}
    <p class="muted small">اضغط على دائرة اليوم لتسجيله منجزًا (أو لإلغائه). يمكن تسجيل آخر ${EDIT_DAYS} أيام.</p>`;
}

async function renderBoard() {
  const list = openChallenges();
  if (!list.length) return '<div class="card"><h3>لا توجد تحديات بعد</h3></div>';
  if (!list.some((c) => c.id === S.boardId)) S.boardId = list[0].id;
  const { data, error } = await sb.rpc('leaderboard', { p_challenge: S.boardId, p_period: S.period });
  if (error) return `<div class="card error">${esc(error.message)}</div>`;
  const rows = ranked(data || []);
  return `<div class="card" style="display:grid;gap:.7rem">
      <label>التحدي<select id="board-c">${list.map((x) => `<option value="${x.id}" ${x.id === S.boardId ? 'selected' : ''}>${esc(x.icon || '⭐')} ${esc(x.title)}</option>`).join('')}</select></label>
      <div class="chips">${Object.entries(PERIODS).map(([k, t]) => `<button class="chip" type="button" data-period="${k}" aria-pressed="${k === S.period}">${t}</button>`).join('')}</div>
      <p class="muted small" style="margin:0">الترتيب حسب عدد الأيام المنجزة ثم أطول سلسلة.</p>
    </div>
    <ol class="board">${rows
      .map((r) => {
        const pct = r.total ? Math.min(100, Math.round((r.days / r.total) * 100)) : 0;
        return `<li class="${r.is_me ? 'mine' : ''}">
          <span class="pos">${medal(r.rank, r.days)}</span>
          <div style="min-width:0"><span class="name">${esc(r.display_name)}</span> ${r.is_me ? '<span class="tag">أنا</span>' : ''}
            <div class="bar"><span style="width:${pct}%"></span></div></div>
          <div class="num"><b>${r.days}</b> <span class="small muted">يوم</span><div class="small muted">${r.streak ? r.streak + ' 🔥' : '—'} · ${pct}%</div></div>
        </li>`;
      })
      .join('')}</ol>`;
}

function challengeForm(c) {
  return `<form class="card" id="ch-form" style="display:grid;gap:.7rem">
    <h3>${c.id ? 'تعديل التحدي' : 'تحدٍّ جديد'}</h3>
    <div class="grid2">
      <label>الرمز<input id="f-icon" maxlength="8" value="${esc(c.icon || '')}" placeholder="🕌"></label>
      <label>العنوان<input id="f-title" maxlength="80" value="${esc(c.title || '')}" placeholder="صلاة الصبح في المسجد" required></label>
    </div>
    <label>الوصف (اختياري)<input id="f-desc" maxlength="300" value="${esc(c.description || '')}" placeholder="متى يُعتبر اليوم منجزًا؟"></label>
    <div class="grid2">
      <label>البداية<input type="date" id="f-start" value="${esc(c.start_date || today())}" required></label>
      <label>النهاية (اختياري)<input type="date" id="f-end" value="${esc(c.end_date || '')}"></label>
    </div>
    <label class="check"><input type="checkbox" id="f-active" ${c.active !== false ? 'checked' : ''}> مفتوح للمشاركين</label>
    <div class="row"><button class="btn" type="submit">حفظ</button><button class="btn ghost" type="button" id="f-cancel">إلغاء</button></div>
  </form>`;
}

async function renderAdmin() {
  if (!S.me.is_admin) return '';
  if (S.editing) return challengeForm(S.editing);
  const now = today();
  const c = S.challenges.find((x) => x.id === S.detailId) || S.challenges[0];
  let details = '';
  if (c) {
    S.detailId = c.id;
    const month = S.month || now.slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const days = Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${month}-${pad(i + 1)}`);
    const [{ data: people }, { data: logs }, { data: board }] = await Promise.all([
      sb.from('profiles').select('id, display_name, joined_on').order('display_name'),
      sb.from('habit_logs').select('user_id, day, created_at').eq('challenge_id', c.id).gte('day', days[0]).lte('day', days[days.length - 1]),
      sb.rpc('leaderboard', { p_challenge: c.id, p_period: 'all' }),
    ]);
    const rows = ranked(board || []);
    const byUser = {};
    for (const l of logs || []) (byUser[l.user_id] ??= {})[l.day] = l.created_at;
    S.details = { c, people: people || [] };
    const avg = rows.length ? Math.round(rows.reduce((t, r) => t + (r.total ? r.days / r.total : 0), 0) / rows.length * 100) : 0;
    details = `<div class="card" style="display:grid;gap:.7rem">
        <h2>التفاصيل</h2>
        <div class="grid2">
          <label>التحدي<select id="d-c">${S.challenges.map((x) => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${esc(x.icon || '⭐')} ${esc(x.title)}</option>`).join('')}</select></label>
          <label>الشهر<input type="month" id="d-month" value="${month}"></label>
        </div>
        <div class="kpis">
          <div class="kpi"><b>${rows.length}</b><span class="small muted">مشارك</span></div>
          <div class="kpi"><b>${Object.keys(byUser).length}</b><span class="small muted">سجّل هذا الشهر</span></div>
          <div class="kpi"><b>${rows.filter((r) => !r.days).length}</b><span class="small muted">لم يسجّل أبدًا</span></div>
          <div class="kpi"><b>${avg}%</b><span class="small muted">متوسط المواظبة</span></div>
        </div>
        ${S.pending ? `<div class="confirm card"><span>${esc(S.pending.label)}</span>
          <button class="btn small" type="button" id="p-yes">تأكيد</button><button class="btn ghost small" type="button" id="p-no">إلغاء</button></div>` : ''}
        <p class="muted small" style="margin:0">✔ = يوم منجز (مرّر على الخانة لترى وقت التسجيل). اضغط على خانة لتصحيح يوم لأي مشارك.</p>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th class="name">الاسم</th>${days.map((d) => `<th class="${d === now ? 'today' : ''}">${Number(d.slice(8))}</th>`).join('')}<th>الشهر</th><th>الإجمالي</th><th>🔥</th></tr></thead>
        <tbody>${rows
          .map((r) => {
            const mine = byUser[r.user_id] || {};
            const pct = r.total ? Math.round((r.days / r.total) * 100) : 0;
            return `<tr><td class="name">${medal(r.rank, r.days)} ${esc(r.display_name)}</td>${days
              .map((d) => {
                const out = d > now || d < c.start_date || (c.end_date && d > c.end_date);
                const at = mine[d] ? new Date(mine[d]).toLocaleString('fr-TN', { timeZone: 'Africa/Tunis' }) : '';
                return `<td class="cell ${mine[d] ? 'done' : ''} ${out ? 'out' : ''}" title="${at ? 'سُجّل في ' + esc(at) : fmt(d)}" ${out ? '' : `data-u="${r.user_id}" data-d="${d}" data-n="${esc(r.display_name)}"`}>${mine[d] ? '✔' : ''}</td>`;
              })
              .join('')}<td><b>${Object.keys(mine).length}</b></td><td>${r.days}/${r.total} · ${pct}%</td><td>${r.streak}</td></tr>`;
          })
          .join('')}</tbody></table></div>`;
  }
  return `<div class="card" style="display:grid;gap:.6rem">
      <div class="row"><h2>التحديات</h2><button class="btn" type="button" id="add-c">+ تحدٍّ جديد</button></div>
      ${S.challenges
        .map(
          (x) => `<div class="row" style="border-top:1px solid var(--line);padding-top:.5rem">
            <div style="min-width:0"><b>${esc(x.icon || '⭐')} ${esc(x.title)}</b> ${x.active ? '' : '<span class="small muted">(متوقف)</span>'}
              <div class="small muted">من ${fmt(x.start_date)}${x.end_date ? ` إلى ${fmt(x.end_date)}` : ''}</div></div>
            <div class="row"><button class="btn ghost small" type="button" data-edit="${x.id}">تعديل</button>
              <button class="btn danger small" type="button" data-del="${x.id}">حذف</button></div>
          </div>`
        )
        .join('') || '<p class="muted">لا توجد تحديات بعد.</p>'}
      <p class="muted small" style="margin:0">المشاركون يرون الترتيب فقط. أنت ترى هنا كل يوم لكل مشارك.</p>
    </div>
    ${details}`;
}

async function toggle(userId, cid, day, done) {
  const { error } = done
    ? await sb.from('habit_logs').insert({ user_id: userId, challenge_id: cid, day })
    : await sb.from('habit_logs').delete().match({ user_id: userId, challenge_id: cid, day });
  if (error && error.code !== '23505') {
    toast(error.code === '42501' ? 'لا يمكن تسجيل هذا اليوم.' : 'تعذّر الحفظ، أعد المحاولة.', true);
    return false;
  }
  return true;
}

function bind() {
  const v = $('#view');
  v.querySelectorAll('[data-week]').forEach((b) => b.addEventListener('click', () => { S.week += Number(b.dataset.week); render(); }));
  v.querySelectorAll('.day').forEach((b) =>
    b.addEventListener('click', async () => {
      const cid = Number(b.dataset.c);
      const done = !b.classList.contains('done');
      b.disabled = true;
      const k = key(cid, b.dataset.d);
      done ? S.myLogs.add(k) : S.myLogs.delete(k);
      b.classList.toggle('done', done);
      if (await toggle(S.me.id, cid, b.dataset.d, done)) {
        if (done) toast('بارك الله فيك 👏');
      } else {
        done ? S.myLogs.delete(k) : S.myLogs.add(k);
      }
      await loadHabits();
      render();
    })
  );
  v.querySelectorAll('[data-board]').forEach((b) => b.addEventListener('click', () => { S.boardId = Number(b.dataset.board); S.tab = 'board'; render(); }));
  $('#board-c')?.addEventListener('change', (e) => { S.boardId = Number(e.target.value); render(); });
  v.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => { S.period = b.dataset.period; render(); }));
  // الإدارة
  $('#add-c')?.addEventListener('click', () => { S.editing = { start_date: today(), active: true }; render(); });
  v.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => { S.editing = { ...S.challenges.find((x) => x.id === Number(b.dataset.edit)) }; render(); }));
  v.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => {
      const x = S.challenges.find((c) => c.id === Number(b.dataset.del));
      S.pending = {
        label: `حذف «${x.title}» وكل الأيام المسجّلة فيه؟ (للإخفاء فقط: عدّل وألغِ «مفتوح»)`,
        run: async () => { const { error } = await sb.from('challenges').delete().eq('id', x.id); if (error) toast(error.message, true); await loadHabits(); },
      };
      render();
    })
  );
  $('#f-cancel')?.addEventListener('click', () => { S.editing = null; render(); });
  $('#ch-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const row = {
      icon: $('#f-icon').value.trim() || null, title: $('#f-title').value.trim(), description: $('#f-desc').value.trim() || null,
      start_date: $('#f-start').value || today(), end_date: $('#f-end').value || null, active: $('#f-active').checked,
    };
    if (!row.title) return toast('العنوان إجباري.', true);
    if (row.end_date && row.end_date < row.start_date) return toast('تاريخ النهاية قبل البداية.', true);
    const { error } = S.editing.id
      ? await sb.from('challenges').update(row).eq('id', S.editing.id)
      : await sb.from('challenges').insert({ ...row, sort: S.challenges.length + 1 });
    if (error) return toast(error.message, true);
    S.editing = null;
    toast('تم الحفظ');
    await loadHabits();
    render();
  });
  $('#d-c')?.addEventListener('change', (e) => { S.detailId = Number(e.target.value); S.pending = null; render(); });
  $('#d-month')?.addEventListener('change', (e) => { S.month = e.target.value || null; S.pending = null; render(); });
  v.querySelectorAll('td.cell[data-u]').forEach((td) =>
    td.addEventListener('click', () => {
      const done = !td.classList.contains('done');
      const cid = S.detailId;
      S.pending = {
        label: `${done ? 'تسجيل' : 'إلغاء'} يوم ${fmt(td.dataset.d)} لـ ${td.dataset.n}؟`,
        run: async () => { await toggle(td.dataset.u, cid, td.dataset.d, done); await loadHabits(); },
      };
      render();
    })
  );
  $('#p-yes')?.addEventListener('click', async () => { const p = S.pending; S.pending = null; await p.run(); render(); });
  $('#p-no')?.addEventListener('click', () => { S.pending = null; render(); });
}

// تبديل الاسم: اضغط على اسمك في الأعلى
$('#who').addEventListener('click', () => {
  if (!S.me) return;
  $('#view').innerHTML = `<form class="card" id="name-form" style="display:grid;gap:.7rem">
    <h3>اسمك في الترتيب</h3>
    <input id="nm" maxlength="60" value="${esc(S.me.display_name)}" required>
    <div class="row"><button class="btn" type="submit">حفظ</button><button class="btn ghost" type="button" id="nm-cancel">إلغاء</button></div></form>`;
  $('#nm-cancel').addEventListener('click', render);
  $('#name-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#nm').value.trim();
    if (!name) return;
    const { error } = await sb.from('profiles').update({ display_name: name }).eq('id', S.me.id);
    if (error) return toast(error.message, true);
    S.me.display_name = name;
    $('#who').textContent = name + ' ✎';
    toast('تم الحفظ');
    render();
  });
});

document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; S.pending = null; S.editing = null; render(); }));
$('#logout').addEventListener('click', () => sb.auth.signOut());

async function start() {
  if (S.recovery) return renderNewPassword();
  if (!S.session) return renderAuth();
  await loadMe();
  if (!S.me) {
    $('#view').innerHTML = '<div class="card error">تعذّر تحميل حسابك. أعد تحميل الصفحة.</div>';
    return;
  }
  $('#tabs').hidden = false;
  $('#logout').hidden = false;
  $('#who').textContent = S.me.display_name + ' ✎';
  $('#who').style.cursor = 'pointer';
  await loadHabits();
  render();
}

let started = null;
sb.auth.onAuthStateChange((event, session) => {
  const changed = (S.session?.user.id || null) !== (session?.user.id || null);
  S.session = session;
  if (event === 'PASSWORD_RECOVERY') S.recovery = true;
  if (event === 'PASSWORD_RECOVERY' || changed || !started) {
    if (!session) S.me = null;
    started = setTimeout(start, 0);
  }
});
