'use strict';
// صناعة العادات: تسجيل (Google أو إيميل)، عاداتي، الترتيب، والإدارة

const DAYS = ['إث', 'ثل', 'أر', 'خم', 'جم', 'سب', 'أح'];
const MEDALS = ['🥇', '🥈', '🥉'];
const PERIODS = { week: 'هذا الأسبوع', month: 'هذا الشهر', all: 'منذ البداية' };
const WINDOWS = { 1: 'اليوم فقط (24 ساعة حتى نصف الليل)', 2: 'اليوم وأمس (48 ساعة)', 3: 'آخر 3 أيام', 7: 'آخر أسبوع' };
const COLORS = ['#61038d', '#20149a', '#ef207a', '#1f9d63', '#c26a00', '#0b7fa6', '#8a2be2', '#b0306a'];
const avatarColor = (id) => COLORS[Number(id) % COLORS.length];

// معرّف فيديو يوتيوب من أي شكل من أشكال الرابط
function youtubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/);
  return m ? m[1] : null;
}

const sb = supabase.createClient(window.APP_CONFIG.supabaseUrl, window.APP_CONFIG.supabaseKey);

const S = {
  session: null, me: null, challenges: [], members: [], memberId: null, myLogs: new Set(), ranks: {}, overall: null, sel: {}, google: false,
  rules: '', editDays: 2, video: {},
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
const key = (cid, day, item = 0) => `${cid}|${day}|${item}`;
const nItems = (c) => c.items?.length || 1;
const doneCount = (c, d) => { let n = 0; for (let i = 0; i < nItems(c); i++) if (S.myLogs.has(key(c.id, d, i))) n++; return n; };
const openChallenges = () => S.challenges.filter((c) => c.active && c.start_date <= today());
const member = () => S.members.find((m) => m.id === S.memberId);
const store = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const recall = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

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
      ${S.google ? `<button class="btn google" type="button" id="google">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        الدخول بحساب Google</button>
      <div class="or">أو بالإيميل</div>` : ''}
      ${reset ? '' : `<div class="seg"><button type="button" data-mode="login" aria-pressed="${!signup}">دخول</button><button type="button" data-mode="signup" aria-pressed="${signup}">حساب جديد</button></div>`}
      <form id="auth-form" novalidate>
        ${signup ? '<label>اسمك<input id="a-name" maxlength="60" required autocomplete="name"></label>' : ''}
        <label>الإيميل<input id="a-email" type="email" required autocomplete="email" dir="ltr"></label>
        ${reset ? '' : `<label>كلمة السر<input id="a-pass" type="password" minlength="6" required autocomplete="${signup ? 'new-password' : 'current-password'}" dir="ltr"></label>`}
        <p class="error" id="a-err" hidden></p>
        <button class="btn" type="submit">${reset ? 'إرسال رابط تغيير كلمة السر' : signup ? 'إنشاء الحساب' : 'دخول'}</button>
        ${reset ? '<button class="link small" type="button" data-mode="login">→ رجوع للدخول</button>' : signup ? '' : '<button class="link small" type="button" data-mode="reset">نسيت كلمة السر؟</button>'}
      </form>
    </div>
  </div>`;
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { S.authMode = b.dataset.mode; renderAuth(); }));
  $('#google')?.addEventListener('click', async () => {
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
        const password = $('#a-pass').value;
        // الحساب يُنشأ مؤكَّدًا (دون رسالة)، ثم ندخل مباشرة
        const { data, error } = await sb.functions.invoke('signup', { body: { email, password, name } });
        if (error) {
          let msg = 'تعذّر إنشاء الحساب';
          try { msg = (await error.context.json()).error || msg; } catch {}
          throw new Error(msg);
        }
        if (!data?.ok) throw new Error('تعذّر إنشاء الحساب');
        const { error: e2 } = await sb.auth.signInWithPassword({ email, password });
        if (e2) throw e2;
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

async function loadMembers() {
  const { data } = await sb.from('members').select('id, name, joined_on').eq('account_id', S.me.id).order('id');
  S.members = data || [];
  if (!member()) S.memberId = Number(recall('member')) || null;
  if (!member()) S.memberId = S.members[0]?.id ?? null;
}

async function loadHabits() {
  const [{ data: ch }, { data: logs }, { data: settings }] = await Promise.all([
    sb.from('challenges').select('*').order('sort').order('id'),
    S.memberId ? sb.from('habit_logs').select('challenge_id, day, item').eq('member_id', S.memberId) : Promise.resolve({ data: [] }),
    sb.from('app_settings').select('key, value'),
  ]);
  const set = Object.fromEntries((settings || []).map((x) => [x.key, x.value]));
  S.rules = typeof set.rules === 'string' ? set.rules : '';
  S.editDays = Math.max(1, Number(set.edit_days) || 2);
  S.challenges = ch || [];
  S.myLogs = new Set((logs || []).map((l) => key(l.challenge_id, l.day, l.item)));
  const list = openChallenges();
  const boards = await Promise.all([null, ...list.map((c) => c.id)].map((id) => sb.rpc('ranking', { p_challenge: id, p_period: 'all' })));
  const pick = (rows) => ({ me: rows.find((r) => r.member_id === S.memberId), count: rows.length });
  S.overall = pick(ranked(boards[0].data || []));
  S.ranks = {};
  list.forEach((c, i) => (S.ranks[c.id] = pick(ranked(boards[i + 1].data || []))));
}

function ranked(rows) {
  const same = (a, b) => a.points === b.points && a.days === b.days && a.streak === b.streak;
  rows.forEach((r, i) => (r.rank = i && same(r, rows[i - 1]) ? rows[i - 1].rank : i + 1));
  return rows;
}

function myStats(c) {
  const now = today();
  const last = c.end_date && c.end_date < now ? c.end_date : now;
  // يوم كامل = كل عناصر المهمة منجزة
  const full = (d) => doneCount(c, d) >= nItems(c);
  let streak = 0;
  let d = full(last) ? last : addDays(last, -1);
  while (d >= c.start_date && full(d)) { streak++; d = addDays(d, -1); }
  let first = member()?.joined_on || today();
  let items = 0;
  const days = new Set();
  for (const k of S.myLogs) {
    const [cid, day] = k.split('|');
    if (Number(cid) === c.id && day >= c.start_date && day <= last) { items++; days.add(day); if (day < first) first = day; }
  }
  const done = [...days].filter(full).length;
  const from = first > c.start_date ? first : c.start_date;
  const total = Math.max(last < from ? 0 : diff(from, last) + 1, done);
  return { streak, done, points: items * (c.points ?? 1), percent: total ? Math.round((done / total) * 100) : 0 };
}

// ---------- العرض ----------
async function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
  $('#tab-admin').hidden = !S.me.is_admin;
  const v = $('#view');
  if (S.tab === 'habits') v.innerHTML = renderHabits();
  else if (S.tab === 'board') v.innerHTML = await renderBoard();
  else if (S.tab === 'rules') v.innerHTML = renderRules();
  else v.innerHTML = await renderAdmin();
  bind();
}

function membersBar() {
  if (!S.members.length) return '';
  return `<div class="card row" style="padding:.6rem .8rem">
    <div class="chips">${S.members
      .map((m) => `<button class="chip" type="button" data-member="${m.id}" aria-pressed="${m.id === S.memberId}">👤 ${esc(m.name)}</button>`)
      .join('')}</div>
    <button class="link small" type="button" id="manage-members">+ إضافة / تعديل</button></div>`;
}

function renderMembers() {
  const first = !S.members.length;
  return `<form class="card" id="members-form" style="display:grid;gap:.7rem">
    <h3>${first ? 'من سيشارك في التحديات؟' : 'المشاركون في حسابك'}</h3>
    <p class="muted small" style="margin:0">أضف أبناءك (أو نفسك). كل مشارك له أيامه وترتيبه، وتسجّل له من هذا الحساب.</p>
    ${S.members
      .map((m) => `<div class="row" style="flex-wrap:nowrap"><input data-mname="${m.id}" maxlength="60" value="${esc(m.name)}" style="flex:1;min-width:0">
        <button class="btn danger small" type="button" data-mdel="${m.id}">حذف</button></div>`)
      .join('')}
    <div class="row" style="flex-wrap:nowrap"><input id="new-member" maxlength="60" placeholder="اسم المشارك، مثال: سارة" style="flex:1;min-width:0">
      <button class="btn ghost small" type="button" id="add-member">+ إضافة</button></div>
    ${S.pending ? `<div class="confirm card"><span>${esc(S.pending.label)}</span>
      <button class="btn small" type="button" id="p-yes">تأكيد</button><button class="btn ghost small" type="button" id="p-no">إلغاء</button></div>` : ''}
    ${first ? '' : '<div class="row"><button class="btn" type="submit">حفظ الأسماء</button><button class="btn ghost" type="button" id="m-done">رجوع</button></div>'}
  </form>`;
}

const editable = (c, d) => {
  const now = today();
  return d <= now && d >= c.start_date && (!c.end_date || d <= c.end_date) && (S.me.is_admin || diff(d, now) < S.editDays);
};
// اليوم المختار في مهمة بعناصر (اليوم افتراضيًا)
const selDay = (c, week) => {
  const d = S.sel[c.id];
  if (d && week.includes(d)) return d;
  return week.includes(today()) ? today() : week[6];
};
function itemsRow(c, d) {
  const ok = editable(c, d);
  return `<div class="items"><span class="small muted">${fmt(d)}:</span>${c.items
    .map((t, i) => {
      const on = S.myLogs.has(key(c.id, d, i));
      return `<button class="chip item ${on ? 'on' : ''}" type="button" data-ic="${c.id}" data-id="${d}" data-ii="${i}" aria-pressed="${on}" ${ok ? '' : 'disabled'}>${on ? '✔ ' : ''}${esc(t)}</button>`;
    })
    .join('')}</div>`;
}

function videoBlock(c) {
  const id = youtubeId(c.video_url);
  if (!id) return '';
  if (!S.video[c.id]) return `<button class="btn ghost small video-btn" type="button" data-video="${c.id}">▶ مشاهدة الفيديو</button>`;
  return `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0" title="${esc(c.title)}"
      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>
    <button class="link small" type="button" data-video="${c.id}">إخفاء الفيديو</button>`;
}

// القانون: يكتبه المشرف ويقرؤه الجميع
function renderRules() {
  const text = S.rules.trim();
  return `<div class="card rules" style="display:grid;gap:.7rem">
      <h2>📜 القانون</h2>
      ${text ? `<div class="rules-text">${esc(text)}</div>` : `<p class="muted">${S.me.is_admin ? 'لم تكتب القانون بعد. اكتبه هنا ليراه كل المشاركين.' : 'لم يُكتب القانون بعد.'}</p>`}
    </div>
    ${S.me.is_admin ? `<form class="card" id="rules-form" style="display:grid;gap:.6rem">
      <h3>تعديل القانون (المشرف)</h3>
      <textarea id="rules-text" rows="10" maxlength="10000" placeholder="1. تُسجَّل الصلاة في وقتها.&#10;2. الصدق في التسجيل.&#10;3. …">${esc(S.rules)}</textarea>
      <div class="row"><button class="btn" type="submit">حفظ القانون</button></div></form>` : ''}`;
}

function renderHabits() {
  if (S.editMembers || !S.members.length) return renderMembers();
  const list = openChallenges();
  const now = today();
  const start = addDays(weekStart(now), S.week * 7);
  const week = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  if (!list.length) {
    return `<div class="card"><h3>لا توجد عادات بعد</h3><p class="muted">${
      S.me.is_admin ? 'أضف أول تحدٍّ من تبويب «الإدارة».' : 'ستظهر هنا العادات عندما يضيفها المشرف.'
    }</p></div>`;
  }
  const o = S.overall?.me;
  return `${membersBar()}
    <div class="card row" style="padding:.7rem 1rem">
      <div><span class="muted small">مجموع نقاط ${esc(member()?.name || '')}</span><div class="points">${o?.points ?? 0} <span class="small muted">نقطة</span></div></div>
      <button class="rank-link" type="button" data-board="0">🏆 ${o?.points ? `الترتيب العام ${o.rank}/${S.overall.count}` : 'الترتيب العام'}</button>
    </div>
    <div class="weeknav">
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
            <button class="rank-link" type="button" data-board="${c.id}">🏆 ${r?.me && r.me.points ? `الترتيب ${r.me.rank}/${r.count}` : "الترتيب"}</button></div>
          <div class="stats muted">⭐ <b>${st.points}</b> نقطة &nbsp;|&nbsp; السلسلة: <b>${st.streak}</b> 🔥 &nbsp;|&nbsp; الإجمالي: <b>${st.percent}%</b></div>
          ${c.description ? `<p class="muted small" style="margin:0">${esc(c.description)}</p>` : ''}
          ${videoBlock(c)}
          <div class="days">${week
            .map((d, i) => {
              const n = doneCount(c, d);
              const full = n >= nItems(c);
              const multi = nItems(c) > 1;
              const ok = editable(c, d);
              const sel = multi && d === selDay(c, week);
              return `<button type="button" class="day ${full ? 'done' : n ? 'part' : ''} ${d === now ? 'today' : ''} ${sel ? 'sel' : ''}" data-c="${c.id}" data-d="${d}"
                aria-pressed="${multi ? sel : full}" aria-label="${DAYS[i]} ${fmt(d)}" ${ok || (multi && d <= now) ? '' : 'disabled'}>${multi && n && !full ? `${n}/${nItems(c)}` : DAYS[i]}${
                  d === now ? '<small>اليوم</small>' : ''}</button>`;
            })
            .join('')}</div>
          ${nItems(c) > 1 ? itemsRow(c, selDay(c, week)) : ''}
          <div class="small muted">+${c.points ?? 1} نقطة لكل ${nItems(c) > 1 ? 'عنصر' : 'يوم'}</div>
        </section>`;
      })
      .join('')}
    <p class="muted small">اضغط على دائرة اليوم لتسجيله منجزًا (أو لإلغائه). ${S.editDays === 1 ? 'يمكن تسجيل اليوم فقط (حتى نصف الليل).' : `يمكن تسجيل آخر ${S.editDays} أيام.`}</p>`;
}

async function renderBoard() {
  const list = openChallenges();
  if (!list.length) return '<div class="card"><h3>لا توجد تحديات بعد</h3></div>';
  if (S.boardId && !list.some((c) => c.id === S.boardId)) S.boardId = 0;
  const c = list.find((x) => x.id === S.boardId);
  const { data, error } = await sb.rpc('ranking', { p_challenge: c ? c.id : null, p_period: S.period });
  if (error) return `<div class="card error">${esc(error.message)}</div>`;
  const rows = ranked(data || []);
  const shown = Math.min(3, rows.filter((r) => r.points).length);
  return `<div class="board-filters">
      <div class="seg" role="group" aria-label="الفترة">${Object.entries(PERIODS)
        .map(([k, t]) => `<button type="button" data-period="${k}" aria-pressed="${k === S.period}">${t}</button>`)
        .join('')}</div>
      <div class="scroller" role="group" aria-label="المهمة">
        <button class="pill" type="button" data-board="0" aria-pressed="${!c}"><span>🏆</span>الكل</button>
        ${list.map((x) => `<button class="pill" type="button" data-board="${x.id}" aria-pressed="${x.id === S.boardId}"><span>${esc(x.icon || '⭐')}</span>${esc(x.title)}</button>`).join('')}
      </div>
    </div>
    <div class="board-title">
      <h2>${c ? `${esc(c.icon || '⭐')} أحسن المشاركين في ${esc(c.title)}` : '🏆 الترتيب العام'}</h2>
      <span class="small muted">${PERIODS[S.period]} · ${rows.length} مشارك</span>
    </div>
    ${podium(rows)}
    <ol class="board">${rows
      .slice(shown)
      .map((r) => {
        const pct = rows[0]?.points ? Math.round((r.points / rows[0].points) * 100) : 0;
        return `<li class="${r.is_mine ? 'mine' : ''}">
          <span class="pos">${medal(r.rank, r.points)}</span>
          <div style="min-width:0;display:flex;gap:.55rem;align-items:center"><span class="av sm" style="background:${avatarColor(r.member_id)}">${esc(r.name.trim().charAt(0))}</span><div style="min-width:0;flex:1"><span class="name">${esc(r.name)}</span> ${r.is_mine ? '<span class="tag">حسابي</span>' : ''}
            <div class="bar"><span style="width:${pct}%"></span></div></div></div>
          <div class="num"><b>${r.points}</b> <span class="small muted">نقطة</span><div class="small muted">${r.days} يوم · ${r.streak ? r.streak + ' 🔥' : '—'}</div></div>
        </li>`;
      })
      .join('')}</ol>`;
}

// منصّة الثلاثة الأوائل: الثاني، الأول، الثالث
function podium(rows) {
  const top = rows.filter((r) => r.points).slice(0, 3);
  if (!top.length) return '<div class="card muted" style="text-align:center">لم يجمع أحد نقاطًا في هذه الفترة بعد. كن الأول! 💪</div>';
  const place = (r, cls) => `<div class="place ${cls} ${r.is_mine ? 'mine' : ''}">
      <div class="crown">${cls === 'first' ? '👑' : ''}</div>
      <span class="av" style="background:${avatarColor(r.member_id)}">${esc(r.name.trim().charAt(0))}</span>
      <div class="pname">${esc(r.name)}</div>
      <div class="ppts">${r.points} <span>نقطة</span></div>
      <div class="step">${MEDALS[r.rank - 1] || r.rank}</div>
    </div>`;
  const order = [top[1] && place(top[1], 'second'), place(top[0], 'first'), top[2] && place(top[2], 'third')].filter(Boolean);
  return `<div class="podium" style="grid-template-columns:repeat(${order.length}, minmax(0, 1fr))">${order.join('')}</div>`;
}

function challengeForm(c) {
  return `<form class="card" id="ch-form" style="display:grid;gap:.7rem">
    <h3>${c.id ? 'تعديل التحدي' : 'تحدٍّ جديد'}</h3>
    <div class="grid2">
      <label>الرمز<input id="f-icon" maxlength="8" value="${esc(c.icon || '')}" placeholder="🕌"></label>
      <label>العنوان<input id="f-title" maxlength="80" value="${esc(c.title || '')}" placeholder="صلاة الصبح في المسجد" required></label>
    </div>
    <label>الوصف (اختياري)<input id="f-desc" maxlength="300" value="${esc(c.description || '')}" placeholder="متى يُعتبر اليوم منجزًا؟"></label>
    <label>رابط فيديو يوتيوب (اختياري)<input id="f-video" maxlength="300" dir="ltr" value="${esc(c.video_url || '')}" placeholder="https://www.youtube.com/watch?v=…"></label>
    <div class="grid2">
      <label>النقاط${(c.items || []).length ? ' لكل عنصر' : ' لكل يوم'}<input type="number" id="f-points" min="0" max="1000" value="${c.points ?? 1}" required></label>
      <label>العناصر (اختياري، كل عنصر في سطر)<textarea id="f-items" rows="3" placeholder="الصبح&#10;الظهر&#10;العصر&#10;المغرب&#10;العشاء">${esc((c.items || []).join('\n'))}</textarea></label>
    </div>
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
      sb.from('members').select('id, name, profiles(display_name)'),
      sb.from('habit_logs').select('member_id, day, item, created_at').eq('challenge_id', c.id).gte('day', days[0]).lte('day', days[days.length - 1]),
      sb.rpc('ranking', { p_challenge: c.id, p_period: 'all' }),
    ]);
    const rows = ranked(board || []);
    const byUser = {};
    // لكل مشارك ولكل يوم: العناصر المنجزة ووقت آخر تسجيل
    for (const l of logs || []) {
      const cell = ((byUser[l.member_id] ??= {})[l.day] ??= { items: [], at: l.created_at });
      cell.items.push(l.item);
      if (l.created_at > cell.at) cell.at = l.created_at;
    }
    const account = Object.fromEntries((people || []).map((m) => [m.id, m.profiles?.display_name || '']));
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
          <div class="kpi"><b>${rows.filter((r) => !r.points).length}</b><span class="small muted">لم يسجّل أبدًا</span></div>
          <div class="kpi"><b>${avg}%</b><span class="small muted">متوسط المواظبة</span></div>
        </div>
        ${S.pending && !S.pending.top ? `<div class="confirm card"><span>${esc(S.pending.label)}</span>
          <button class="btn small" type="button" id="p-yes">تأكيد</button><button class="btn ghost small" type="button" id="p-no">إلغاء</button></div>` : ''}
        <p class="muted small" style="margin:0">✔ = يوم منجز (مرّر على الخانة لترى وقت التسجيل). اضغط على خانة لتصحيح يوم لأي مشارك.</p>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th class="name">الاسم</th>${days.map((d) => `<th class="${d === now ? 'today' : ''}">${Number(d.slice(8))}</th>`).join('')}<th>الشهر</th><th>النقاط</th><th>الإجمالي</th><th>🔥</th></tr></thead>
        <tbody>${rows
          .map((r) => {
            const mine = byUser[r.member_id] || {};
            const pct = r.total ? Math.round((r.days / r.total) * 100) : 0;
            return `<tr><td class="name">${medal(r.rank, r.points)} ${esc(r.name)}${account[r.member_id] && account[r.member_id] !== r.name ? ` <span class="small muted">(${esc(account[r.member_id])})</span>` : ''}</td>${days
              .map((d) => {
                const out = d > now || d < c.start_date || (c.end_date && d > c.end_date);
                const cell = mine[d];
                const n = cell?.items.length || 0;
                const full = n >= nItems(c);
                const at = cell ? new Date(cell.at).toLocaleString('fr-TN', { timeZone: 'Africa/Tunis' }) : '';
                const what = cell && c.items ? ' — ' + cell.items.map((i) => c.items[i]).join('، ') : '';
                return `<td class="cell ${full ? 'done' : n ? 'part' : ''} ${out ? 'out' : ''}" title="${at ? esc('سُجّل في ' + at + what) : fmt(d)}" ${
                  out ? '' : `data-u="${r.member_id}" data-d="${d}" data-n="${esc(r.name)}" data-full="${full}"`}>${full ? '✔' : n ? `${n}/${nItems(c)}` : ''}</td>`;
              })
              .join('')}<td><b>${Object.values(mine).filter((x) => x.items.length >= nItems(c)).length}</b></td><td>⭐ ${r.points}</td><td>${r.days}/${r.total} · ${pct}%</td><td>${r.streak}</td></tr>`;
          })
          .join('')}</tbody></table></div>`;
  }
  const confirmTop = S.pending && S.pending.top ? `<div class="confirm card warnbox"><span>${esc(S.pending.label)}</span>
      <button class="btn small" type="button" id="p-yes">تأكيد الحذف</button><button class="btn ghost small" type="button" id="p-no">إلغاء</button></div>` : '';
  return `${confirmTop}
    <form class="card" id="window-form" style="display:grid;gap:.6rem">
      <h3>⏰ مدّة تعمير اليوم</h3>
      <p class="muted small" style="margin:0">إلى متى يبقى بإمكان المشاركين تسجيل يوم ما؟ (المشرف يصحّح أي يوم في كل الحالات)</p>
      <div class="row" style="flex-wrap:nowrap"><select id="edit-days" style="flex:1;min-width:0">${Object.entries(WINDOWS)
        .map(([k, t]) => `<option value="${k}" ${Number(k) === S.editDays ? 'selected' : ''}>${t}</option>`)
        .join('')}</select><button class="btn" type="submit">حفظ</button></div>
    </form>
    <div class="card" style="display:grid;gap:.6rem">
      <div class="row"><h2>التحديات</h2><button class="btn" type="button" id="add-c">+ تحدٍّ جديد</button></div>
      ${S.challenges
        .map(
          (x) => `<div class="row" style="border-top:1px solid var(--line);padding-top:.5rem">
            <div style="min-width:0"><b>${esc(x.icon || '⭐')} ${esc(x.title)}</b> ${x.active ? '' : '<span class="small muted">(متوقف)</span>'}
              <div class="small muted">⭐ ${x.points ?? 1} نقطة${x.items ? ` لكل عنصر (${x.items.map(esc).join('، ')})` : ''} · من ${fmt(x.start_date)}${x.end_date ? ` إلى ${fmt(x.end_date)}` : ''}</div></div>
            <div class="row"><button class="btn ghost small" type="button" data-edit="${x.id}">تعديل</button>
              <button class="btn danger small" type="button" data-del="${x.id}">حذف</button></div>
          </div>`
        )
        .join('') || '<p class="muted">لا توجد تحديات بعد.</p>'}
      <p class="muted small" style="margin:0">المشاركون يرون الترتيب فقط. أنت ترى هنا كل يوم لكل مشارك.</p>
    </div>
    ${details}`;
}

async function toggle(memberId, cid, day, done, item = 0) {
  const row = { member_id: Number(memberId), challenge_id: cid, day, item };
  const { error } = done ? await sb.from('habit_logs').insert(row) : await sb.from('habit_logs').delete().match(row);
  if (error && error.code !== '23505') {
    toast(error.code === '42501' ? 'لا يمكن تسجيل هذا اليوم.' : 'تعذّر الحفظ، أعد المحاولة.', true);
    return false;
  }
  return true;
}

function bind() {
  const v = $('#view');
  v.querySelectorAll('[data-member]').forEach((b) =>
    b.addEventListener('click', async () => { S.memberId = Number(b.dataset.member); store('member', String(S.memberId)); await loadHabits(); render(); })
  );
  $('#manage-members')?.addEventListener('click', () => { S.editMembers = true; render(); });
  $('#m-done')?.addEventListener('click', () => { S.editMembers = false; S.pending = null; render(); });
  $('#add-member')?.addEventListener('click', async () => {
    const name = $('#new-member').value.trim();
    if (!name) return toast('اكتب اسم المشارك.', true);
    const { data, error } = await sb.from('members').insert({ account_id: S.me.id, name }).select('id').single();
    if (error) return toast(error.code === '42501' ? 'وصلت إلى الحد الأقصى من المشاركين.' : 'تعذّر الإضافة.', true);
    await loadMembers();
    if (S.members.length === 1 || !S.memberId) S.memberId = data.id;
    await loadHabits();
    toast('تمت إضافة ' + name);
    render();
  });
  $('#new-member')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#add-member').click(); } });
  $('#members-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    for (const inp of v.querySelectorAll('[data-mname]')) {
      const m = S.members.find((x) => x.id === Number(inp.dataset.mname));
      const name = inp.value.trim();
      if (m && name && name !== m.name) {
        const { error } = await sb.from('members').update({ name }).eq('id', m.id);
        if (error) return toast('تعذّر الحفظ.', true);
      }
    }
    await loadMembers();
    S.editMembers = false;
    toast('تم الحفظ');
    render();
  });
  v.querySelectorAll('[data-mdel]').forEach((b) =>
    b.addEventListener('click', () => {
      const m = S.members.find((x) => x.id === Number(b.dataset.mdel));
      S.pending = {
        label: `حذف «${m.name}» وكل أيامه المسجّلة؟`,
        run: async () => {
          const { error } = await sb.from('members').delete().eq('id', m.id);
          if (error) toast('تعذّر الحذف.', true);
          if (S.memberId === m.id) S.memberId = null;
          await loadMembers();
          await loadHabits();
        },
      };
      render();
    })
  );
  v.querySelectorAll('[data-week]').forEach((b) => b.addEventListener('click', () => { S.week += Number(b.dataset.week); render(); }));
  v.querySelectorAll('.day').forEach((b) =>
    b.addEventListener('click', async () => {
      const cid = Number(b.dataset.c);
      const c = S.challenges.find((x) => x.id === cid);
      // مهمة بعناصر: الدائرة تختار اليوم، والعناصر تُسجَّل تحتها
      if (nItems(c) > 1) { S.sel[cid] = b.dataset.d; return render(); }
      const done = !b.classList.contains('done');
      b.disabled = true;
      const k = key(cid, b.dataset.d);
      done ? S.myLogs.add(k) : S.myLogs.delete(k);
      b.classList.toggle('done', done);
      if (await toggle(S.memberId, cid, b.dataset.d, done)) {
        if (done) toast('بارك الله فيك 👏');
      } else {
        done ? S.myLogs.delete(k) : S.myLogs.add(k);
      }
      await loadHabits();
      render();
    })
  );
  v.querySelectorAll('.item[data-ic]').forEach((b) =>
    b.addEventListener('click', async () => {
      const cid = Number(b.dataset.ic);
      const item = Number(b.dataset.ii);
      const done = b.getAttribute('aria-pressed') !== 'true';
      b.disabled = true;
      if (await toggle(S.memberId, cid, b.dataset.id, done, item) && done) toast('بارك الله فيك 👏');
      await loadHabits();
      render();
    })
  );
  v.querySelectorAll('[data-board]').forEach((b) => b.addEventListener('click', () => { S.boardId = Number(b.dataset.board); S.tab = 'board'; render(); }));
    v.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => { S.period = b.dataset.period; render(); }));
  // الإدارة
  $('#add-c')?.addEventListener('click', () => { S.editing = { start_date: today(), active: true }; render(); });
  v.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => { S.editing = { ...S.challenges.find((x) => x.id === Number(b.dataset.edit)) }; render(); }));
  v.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => {
      const x = S.challenges.find((c) => c.id === Number(b.dataset.del));
      S.pending = {
        top: true,
        label: `حذف «${x.title}» وكل الأيام المسجّلة فيه؟ (للإخفاء فقط: عدّل وألغِ «مفتوح»)`,
        run: async () => {
          const { data, error } = await sb.from('challenges').delete().eq('id', x.id).select('id');
          if (error || !data?.length) toast('تعذّر الحذف.', true);
          else toast('تم حذف «' + x.title + '»');
          if (S.detailId === x.id) S.detailId = null;
          await loadHabits();
        },
      };
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    })
  );
  $('#f-cancel')?.addEventListener('click', () => { S.editing = null; render(); });
  $('#ch-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const row = {
      icon: $('#f-icon').value.trim() || null, title: $('#f-title').value.trim(), description: $('#f-desc').value.trim() || null,
      start_date: $('#f-start').value || today(), end_date: $('#f-end').value || null, active: $('#f-active').checked,
      points: Math.max(0, Math.min(1000, Number($('#f-points').value) || 0)),
      items: $('#f-items').value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 10),
    };
    if (!row.items.length) row.items = null;
    row.video_url = $('#f-video').value.trim() || null;
    if (row.video_url && !youtubeId(row.video_url)) return toast('رابط يوتيوب غير صالح.', true);
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
      // تصحيح المشرف: يوم ناقص يُكمَّل (كل العناصر)، ويوم كامل يُلغى
      const done = td.dataset.full !== 'true';
      const c = S.challenges.find((x) => x.id === S.detailId);
      S.pending = {
        label: `${done ? 'تسجيل' : 'إلغاء'} يوم ${fmt(td.dataset.d)} لـ ${td.dataset.n}${c.items ? ' (كل العناصر)' : ''}؟`,
        run: async () => {
          for (let i = 0; i < nItems(c); i++) await toggle(td.dataset.u, c.id, td.dataset.d, done, i);
          await loadHabits();
        },
      };
      render();
    })
  );
  v.querySelectorAll('[data-video]').forEach((b) =>
    b.addEventListener('click', () => { const id = Number(b.dataset.video); S.video[id] = !S.video[id]; render(); })
  );
  $('#rules-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = $('#rules-text').value.slice(0, 10000);
    const { error } = await sb.from('app_settings').upsert({ key: 'rules', value, updated_at: new Date().toISOString() });
    if (error) return toast('تعذّر الحفظ.', true);
    S.rules = value;
    toast('تم حفظ القانون');
    render();
  });
  $('#window-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = Number($('#edit-days').value);
    const { error } = await sb.from('app_settings').upsert({ key: 'edit_days', value, updated_at: new Date().toISOString() });
    if (error) return toast('تعذّر الحفظ.', true);
    S.editDays = value;
    toast('تم الحفظ: ' + WINDOWS[value]);
  });
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
  await loadMembers();
  await loadHabits();
  render();
}

// الزر يظهر فقط إذا كان الدخول بـ Google مفعّلًا في Supabase
fetch(window.APP_CONFIG.supabaseUrl + '/auth/v1/settings', { headers: { apikey: window.APP_CONFIG.supabaseKey } })
  .then((r) => r.json())
  .then((st) => { S.google = !!st?.external?.google; if (!S.session) renderAuth(); })
  .catch(() => {});

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
