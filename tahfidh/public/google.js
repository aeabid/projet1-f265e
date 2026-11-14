'use strict';
// الدخول والتسجيل بحساب Google: الطالب الجديد يرسل طلبًا، والمشرف يقبله

let gConfig = null;
let gCredential = null;
async function loadGoogle() {
  try {
    gConfig ??= await api('GET', '/api/auth/config');
  } catch {
    return false;
  }
  if (!gConfig.google_client_id) return false;
  await new Promise((resolve, reject) => {
    if (window.google?.accounts) return resolve();
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client';
    sc.onload = resolve;
    sc.onerror = reject;
    document.head.appendChild(sc);
  }).catch(() => null);
  return !!window.google?.accounts;
}
async function renderGoogleButton(host, callback, text = 'continue_with') {
  if (!(await loadGoogle()) || !host.isConnected) return false;
  google.accounts.id.initialize({ client_id: gConfig.google_client_id, callback: ({ credential }) => callback(credential) });
  google.accounts.id.renderButton(host, { theme: 'outline', size: 'large', text, shape: 'pill', locale: 'ar', width: Math.min(320, host.clientWidth || 320) });
  return true;
}

// صفحة الدخول
async function setupGoogleLogin() {
  const box = $('#google-box');
  if (!box) return;
  if (await renderGoogleButton($('#google-btn'), onGoogleLogin)) box.hidden = false;
}
async function onGoogleLogin(credential) {
  try {
    const r = await api('POST', '/api/auth/google', { credential });
    if (r.user) {
      state.user = r.user;
      location.hash = '#/home';
      return;
    }
    gCredential = credential;
    viewSignup($('#view'), r);
  } catch (err) {
    const p = $('#login-error');
    if (p) (p.textContent = err.message), (p.hidden = false);
    else toast(err.message, true);
  }
}

// استمارة التسجيل، أو حالة الطلب
function viewSignup(el, r) {
  const waiting = (msg) => `<div class="login"><img src="logo.svg" alt="" class="login-logo">
      <div class="card"><p class="signup-state">${msg}</p><p class="muted small">${esc(r.google.email)}</p>
      <a class="btn ghost" href="#/login" onclick="location.reload()">رجوع</a></div></div>`;
  if (r.status === 'pending') {
    el.innerHTML = waiting('⏳ طلب تسجيلك في انتظار موافقة الشيخ.<br>عند القبول ادخل بنفس حساب Google.');
    return;
  }
  const [first, ...rest] = String(r.google.name || '').split(' ');
  el.innerHTML = `<div class="login"><img src="logo.svg" alt="" class="login-logo">
    <h1>تسجيل طالب جديد</h1>
    ${r.status === 'rejected' ? '<p class="error">لم يُقبل طلبك السابق. يمكنك إعادة الإرسال أو الاتصال بالشيخ.</p>' : ''}
    <form id="signup-form" class="card">
      <p class="muted small">حساب Google: <b dir="ltr">${esc(r.google.email)}</b></p>
      <div class="row"><label>الاسم<input name="first_name" required maxlength="60" value="${esc(first || '')}"></label>
        <label>اللقب<input name="last_name" maxlength="60" value="${esc(rest.join(' '))}"></label></div>
      <div class="row"><label>العمر<input name="age" type="number" min="3" max="99"></label>
        <label>الهاتف (أو هاتف الولي)<input name="phone" type="tel"></label></div>
      ${r.groups.length ? `<label>الحلقة<select name="group_id"><option value="">— لا أعرف —</option>${r.groups
        .map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label>` : ''}
      <label>ملاحظة للشيخ (اختياري)<textarea name="note" rows="2" maxlength="300"></textarea></label>
      <p class="error" id="signup-error" hidden></p>
      <button class="btn block" type="submit">إرسال طلب التسجيل</button>
    </form>
    <p class="muted small">الشيخ يراجع الطلب ويؤكّده، ثم تدخل بنفس حساب Google.</p></div>`;
  $('#signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await api('POST', '/api/auth/google/signup', { ...formData(e.target), credential: gCredential });
      viewSignup(el, { ...r, status: 'pending' });
    } catch (err) {
      $('#signup-error').textContent = /التحقق|Google/.test(err.message) ? 'انتهت صلاحية الدخول، أعد الضغط على زر Google.' : err.message;
      $('#signup-error').hidden = false;
      btn.disabled = false;
    }
  });
}

// «حسابي»: ربط حساب Google
async function googleAccountCard(box) {
  const u = state.user;
  if (u.google_email) {
    box.innerHTML = `<h3>حساب Google</h3><p>مربوط بـ <b dir="ltr">${esc(u.google_email)}</b>: يمكنك الدخول به.</p>
      <button type="button" class="btn small ghost danger" id="g-unlink">فكّ الربط</button>`;
    $('#g-unlink').addEventListener('click', async () => {
      if (!confirmAction('فكّ ربط حساب Google؟')) return;
      await api('DELETE', '/api/me/google').catch((e) => toast(e.message, true));
      state.user = (await api('GET', '/api/me')).user;
      googleAccountCard(box);
    });
    return;
  }
  box.innerHTML = '<h3>حساب Google</h3><p class="muted small">اربط حسابك بـ Google لتدخل دون كلمة سر.</p><div id="g-link"></div>';
  const ok = await renderGoogleButton($('#g-link'), async (credential) => {
    try {
      await api('POST', '/api/me/google', { credential });
      state.user = (await api('GET', '/api/me')).user;
      toast('تم ربط حساب Google ✓');
      googleAccountCard(box);
    } catch (e) {
      toast(e.message, true);
    }
  });
  if (!ok) box.remove();
}

// ---------- المشرف: طلبات التسجيل ----------
async function signupsTab(page, groups) {
  gConfig ??= await api('GET', '/api/auth/config').catch(() => null);
  const { signups } = await api('GET', '/api/signups');
  const pending = signups.filter((s) => s.status === 'pending');
  const done = signups.filter((s) => s.status !== 'pending');
  const card = (s) => `<li class="signup">
      <div><b>${esc([s.first_name, s.last_name].filter(Boolean).join(' '))}</b>${s.age ? ` <span class="muted small">· ${s.age} سنة</span>` : ''}
        <small class="q-what" dir="ltr">${esc(s.google_email)}</small>
        <small class="q-what">${[s.phone && `📞 ${esc(s.phone)}`, s.group_name && `🕌 ${esc(s.group_name)}`, fmtDate(String(s.created_at).slice(0, 10))].filter(Boolean).join(' · ')}</small>
        ${s.note ? `<p class="small">${esc(s.note)}</p>` : ''}</div>
      ${s.status === 'pending'
        ? `<span class="q-actions"><button type="button" class="btn small" data-accept="${s.id}">✓ قبول</button><button type="button" class="btn small ghost danger" data-reject="${s.id}">رفض</button></span>`
        : `<span class="badge ${s.status === 'accepted' ? 'good' : 'weak'}">${s.status === 'accepted' ? 'مقبول' : 'مرفوض'}</span>`}</li>`;
  page.innerHTML = `<div class="card"><h3>📝 طلبات التسجيل بـ Google</h3>
      ${pending.length ? `<ul class="signups">${pending.map(card).join('')}</ul>` : '<p class="muted">لا توجد طلبات جديدة.</p>'}
      ${gConfig?.google_client_id === null ? '<p class="error small">الدخول بـ Google غير مفعّل بعد في إعدادات الموقع.</p>' : ''}</div>
    ${done.length ? `<details class="card"><summary>الطلبات السابقة (${done.length})</summary><ul class="signups">${done.map(card).join('')}</ul></details>` : ''}`;
  const reload = () => signupsTab(page, groups);
  page.querySelectorAll('[data-accept]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = signups.find((x) => x.id === Number(b.dataset.accept));
      openModal(
        `قبول ${[s.first_name, s.last_name].filter(Boolean).join(' ')}`,
        `<div class="row"><label>الاسم<input name="first_name" required value="${esc(s.first_name)}"></label>
           <label>اللقب<input name="last_name" value="${esc(s.last_name || '')}"></label></div>
         <label>المجموعة<select name="group_id"><option value="">— بلا مجموعة —</option>${groups
           .map((g) => `<option value="${g.id}" ${s.group_id === g.id ? 'selected' : ''}>${esc(g.name)} (${Q_DAYS[g.meet_day]})</option>`).join('')}</select></label>
         <p class="muted small">يُنشأ حساب الطالب مربوطًا بـ <b dir="ltr">${esc(s.google_email)}</b>، ويدخل به مباشرة.</p>`,
        async (data) => {
          await api('POST', `/api/signups/${s.id}/accept`, data);
          toast('تم قبول الطالب ✓');
          reload();
          refreshSignupBadge();
        }
      );
    })
  );
  page.querySelectorAll('[data-reject]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirmAction('رفض هذا الطلب؟')) return;
      await api('POST', `/api/signups/${b.dataset.reject}/reject`).catch((e) => toast(e.message, true));
      reload();
      refreshSignupBadge();
    })
  );
}
async function refreshSignupBadge() {
  const el = $('#signup-badge');
  if (!el || state.user?.role !== 'admin') return;
  try {
    const { pending } = await api('GET', '/api/signups/count');
    el.textContent = pending;
    el.hidden = !pending;
    const al = $('#signup-alert');
    if (al) {
      al.hidden = !pending;
      al.querySelector('span').textContent = pending === 1 ? 'طلب تسجيل جديد في انتظار موافقتك' : `${pending} طلبات تسجيل جديدة في انتظار موافقتك`;
    }
  } catch {}
}
