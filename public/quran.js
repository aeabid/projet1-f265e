'use strict';
// فضاء التحفيظ: الشيخ يتابع حفظ ومراجعة طلبته، والطالب يحدّد محفوظه ويسجّل مراجعته وقراءات درسه
// البيانات: quran-data.js (globalThis.QURAN)

const QD = globalThis.QURAN;
const Q_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const Q_RATING = { excellent: 'ممتاز', good: 'جيد', average: 'متوسط', weak: 'ضعيف' };
const Q_ATT = { present: 'حاضر', absent: 'غائب', excused: 'غائب بعذر' };
const Q_ATT_CLS = { present: 'good', absent: 'weak', excused: 'average' };
const Q_LEVELS = ['مبتدئ', 'متوسط', 'متقدم', 'حافظ'];
const isQuranStaff = () => ['admin', 'sheikh'].includes(state.user?.role);
const qDay = (d) => Q_DAYS[new Date(`${d}T00:00:00Z`).getUTCDay()];
const qShort = (d) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
const qAddDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const hizbTxt = (n) => `${String(Math.round((n || 0) * 10) / 10).replace('.', ',')} حزب`;
const bar = (done, total, cls = '') =>
  `<div class="q-bar ${cls}"><i style="width:${total ? Math.min(100, Math.round((done / total) * 100)) : 0}%"></i></div>`;
const ratingBadge = (v, label) => (v ? `<span class="badge ${v}">${label}: ${Q_RATING[v]}</span>` : '');
const ratingSelect = (name, label, value = '') =>
  `<label>${label}<select name="${name}"><option value="">—</option>${Object.entries(Q_RATING)
    .map(([k, l]) => `<option value="${k}" ${k === value ? 'selected' : ''}>${l}</option>`)
    .join('')}</select></label>`;
const daySelect = (name, value) =>
  `<select name="${name}">${Q_DAYS.map((d, i) => `<option value="${i}" ${Number(value) === i ? 'selected' : ''}>${d}</option>`).join('')}</select>`;

// ما يُنجز من الدرس اليوم حتى يبلغ الهدف قبل اللقاء الموالي
// مدة الدرس: حتى اليوم الذي يسبق اللقاء الموالي (بداية الأسبوع)
function lessonPace(lesson, day, weekStart) {
  const back = (new Date(`${lesson.assigned_on}T00:00:00Z`).getUTCDay() - weekStart + 7) % 7;
  const end = qAddDays(lesson.assigned_on, 6 - back);
  const daysLeft = Math.max(1, Math.round((Date.parse(end) - Date.parse(day)) / 864e5) + 1);
  const remaining = Math.max(0, lesson.target - lesson.total);
  return { remaining, perDay: Math.ceil(remaining / daysLeft), daysLeft };
}

// ---------- الرئيسية والنظرة العامة (الإدارة والشيخ) ----------
async function viewQuranHome(el, tab = '') {
  const d = await api('GET', '/api/quran/overview');
  const active = d.students.filter((s) => s.active);
  const exp = active.reduce((t, s) => t + (s.review_expected || 0), 0);
  const done = active.reduce((t, s) => t + (s.review_done || 0), 0);
  const reached = active.filter((s) => s.lesson && s.lesson.total >= s.lesson.target).length;
  const admin = state.user.role === 'admin';
  tab = tab || sessionStorage.getItem('qTab') || 'students';
  if (tab === 'sheikhs' && !admin) tab = 'students';
  sessionStorage.setItem('qTab', tab);
  el.innerHTML = `
    ${heroBanner({ sub: 'فضاء التحفيظ: تابع مراجعة طلبتك وحفظهم أسبوعًا بأسبوع.', art: '📖',
      actions: '<button type="button" class="btn" id="q-add-st">＋ طالب جديد</button><button type="button" class="btn ghost" id="q-add-g">＋ مجموعة</button>' })}
    <div class="kpis">
      <div class="kpi"><b>${active.length}</b><span>طالب</span></div>
      <div class="kpi"><b>${d.groups.length}</b><span>مجموعة</span></div>
      <div class="kpi"><b>${exp ? Math.round((done / exp) * 100) : 0}%</b><span>إنجاز المراجعة هذا الأسبوع<small>${done} من ${exp} حصة</small></span></div>
      <div class="kpi"><b class="in">${reached}</b><span>بلغ هدف قراءة الدرس</span></div>
    </div>
    <div class="board-tabs" role="tablist">
      <a href="#/quran/students" class="${tab === 'students' ? 'on' : ''}"><span>👥</span>الطلبة</a>
      <a href="#/quran/groups" class="${tab === 'groups' ? 'on' : ''}"><span>🕌</span>المجموعات</a>
      ${admin ? `<a href="#/quran/sheikhs" class="${tab === 'sheikhs' ? 'on' : ''}"><span>🧕🏻</span>المشايخ</a>` : ''}
    </div>
    <div id="q-page"></div>`;
  $('#q-add-st').addEventListener('click', () => quranStudentForm(null, d, () => viewQuranHome(el, 'students')));
  $('#q-add-g').addEventListener('click', () => quranGroupForm(null, d, () => viewQuranHome(el, 'groups')));
  const page = $('#q-page');
  if (tab === 'groups') return quranGroupsTab(page, d, el);
  if (tab === 'sheikhs') return quranSheikhsTab(page, d, el);
  return quranStudentsTab(page, d);
}

function quranStudentCard(s) {
  const l = s.lesson;
  return `<a class="card q-st ${s.active ? '' : 'q-off'}" href="#/quran/student/${s.id}">
    <div class="q-st-head">${avatar({ full_name: s.full_name }, 'md')}<div>
      <h3>${esc(s.full_name)}</h3>
      <span class="muted small">${[s.group_name && `🕌 ${esc(s.group_name)}`, s.level && esc(s.level), s.age && `${s.age} سنة`].filter(Boolean).join(' · ')}</span>
    </div>${s.active ? '' : '<span class="badge general">متوقف</span>'}</div>
    <div class="q-st-mem"><span class="q-dot s"></span>${hizbTxt(s.solid_hizb)} <span class="q-dot w"></span>${hizbTxt(s.weak_hizb)}</div>
    ${s.active ? `<div class="q-st-line"><span>المراجعة</span>${bar(s.review_done, s.review_expected)}<b>${s.review_done}/${s.review_expected}</b></div>
    <div class="q-st-line"><span>الدرس</span>${l ? `${bar(l.total, l.target, l.total >= l.target ? 'ok' : '')}<b>${l.total}/${l.target}</b>` : '<em class="muted small">لا درس</em>'}</div>` : ''}
    ${s.last_meeting ? `<div class="muted small">آخر لقاء: ${fmtDate(s.last_meeting.date)} <span class="badge ${Q_ATT_CLS[s.last_meeting.attendance]}">${Q_ATT[s.last_meeting.attendance]}</span></div>` : ''}
  </a>`;
}

function quranStudentsTab(page, d) {
  if (!d.students.length) {
    page.innerHTML = '<div class="card empty-state"><span>📖</span><p>لا يوجد طلبة بعد. أضف مجموعة ثم طالبًا جديدًا.</p></div>';
    return;
  }
  page.innerHTML = `<div class="q-filters">
      <input type="search" id="q-search" placeholder="بحث بالاسم…">
      <select id="q-group"><option value="">كل المجموعات</option>${d.groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}<option value="none">بلا مجموعة</option></select>
      <select id="q-sort"><option value="name">ترتيب بالاسم</option><option value="review">الأقل مراجعة أولًا</option><option value="hifz">الأكثر حفظًا أولًا</option></select>
    </div><div class="cards" id="q-list"></div>`;
  const render = () => {
    const s = $('#q-search').value.trim();
    const g = $('#q-group').value;
    const sort = $('#q-sort').value;
    let list = d.students.filter((x) => (!s || x.full_name.includes(s)) && (!g || (g === 'none' ? !x.group_id : String(x.group_id) === g)));
    const ratio = (x) => (x.review_expected ? x.review_done / x.review_expected : 1);
    if (sort === 'review') list = [...list].sort((a, b) => ratio(a) - ratio(b));
    if (sort === 'hifz') list = [...list].sort((a, b) => b.solid_hizb + b.weak_hizb - (a.solid_hizb + a.weak_hizb));
    $('#q-list').innerHTML = list.map(quranStudentCard).join('') || '<p class="muted">لا نتائج.</p>';
  };
  ['input', 'change'].forEach((ev) => page.addEventListener(ev, render));
  render();
}

function quranGroupsTab(page, d, root) {
  page.innerHTML = d.groups.length
    ? `<div class="cards">${d.groups
        .map(
          (g) => `<div class="card q-group">
        <div class="section-head"><h3>🕌 ${esc(g.name)}</h3>${g.level ? `<span class="pill">${esc(g.level)}</span>` : ''}</div>
        <p class="muted small">${g.sheikh_name ? `الشيخ: ${esc(g.sheikh_name)} · ` : ''}يوم اللقاء: <b>${Q_DAYS[g.meet_day]}</b> · ${g.students} طالب</p>
        ${g.notes ? `<p class="small">${esc(g.notes)}</p>` : ''}
        <div class="q-actions"><a class="btn small" href="#/quran/group/${g.id}">📋 حصة اللقاء</a>
          <button type="button" class="btn small ghost" data-edit="${g.id}">تعديل</button>
          <button type="button" class="btn small ghost danger" data-del="${g.id}">حذف</button></div>
      </div>`
        )
        .join('')}</div>`
    : '<div class="card empty-state"><span>🕌</span><p>لا توجد مجموعات. أنشئ مجموعة لكل مستوى (مبتدئ، متوسط، متقدم…).</p></div>';
  page.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => quranGroupForm(d.groups.find((g) => g.id === Number(b.dataset.edit)), d, () => viewQuranHome(root, 'groups')))
  );
  page.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirmAction('حذف المجموعة؟ (الطلبة يبقون بلا مجموعة)')) return;
      await api('DELETE', `/api/quran/groups/${b.dataset.del}`).catch((e) => toast(e.message, true));
      viewQuranHome(root, 'groups');
    })
  );
}

function quranGroupForm(g, d, onDone) {
  const admin = state.user.role === 'admin';
  openModal(
    g ? 'تعديل المجموعة' : 'مجموعة جديدة',
    `<label>اسم المجموعة<input name="name" required maxlength="80" value="${esc(g?.name || '')}"></label>
     <div class="row"><label>المستوى<input name="level" list="q-levels" value="${esc(g?.level || '')}"></label>
       <label>يوم اللقاء (بداية الأسبوع)${daySelect('meet_day', g?.meet_day ?? 6)}</label></div>
     <datalist id="q-levels">${Q_LEVELS.map((l) => `<option value="${l}">`).join('')}</datalist>
     ${admin ? `<label>الشيخ<select name="sheikh_id"><option value="">—</option>${d.sheikhs
       .map((s) => `<option value="${s.id}" ${g?.sheikh_id === s.id ? 'selected' : ''}>${esc(s.full_name)}</option>`)
       .join('')}</select></label>` : ''}
     <label>ملاحظات<textarea name="notes" rows="2">${esc(g?.notes || '')}</textarea></label>`,
    async (data) => {
      await api(g ? 'PUT' : 'POST', g ? `/api/quran/groups/${g.id}` : '/api/quran/groups', data);
      toast('تم الحفظ ✓');
      onDone();
    }
  );
}

function quranSheikhsTab(page, d, root) {
  page.innerHTML = `<div class="card"><div class="section-head"><h3>المشايخ</h3><button type="button" class="btn small" id="q-add-sh">＋ شيخ</button></div>
    ${d.sheikhs.length ? `<ul class="levels">${d.sheikhs
      .map((s) => `<li><span><b>${esc(s.full_name)}</b> <span class="muted small" dir="ltr">${esc(s.username)}</span>${s.phone ? ` · ${esc(s.phone)}` : ''}
          <span class="muted small">· ${d.groups.filter((g) => g.sheikh_id === s.id).length} مجموعة</span></span>
        <span class="row-actions"><button type="button" class="btn small ghost" data-edit="${s.id}">تعديل</button>
          <button type="button" class="btn small ghost danger" data-del="${s.id}">حذف</button></span></li>`)
      .join('')}</ul>` : '<p class="muted">لا يوجد مشايخ. أضف حسابًا لكل شيخ، وهو ينشئ مجموعاته وطلبته.</p>'}</div>`;
  const form = (s) =>
    openModal(
      s ? 'تعديل حساب الشيخ' : 'شيخ جديد',
      `<label>الاسم واللقب<input name="full_name" required value="${esc(s?.full_name || '')}"></label>
       ${s ? '' : '<label>اسم المستخدم<input name="username" required dir="ltr" autocomplete="off"></label>'}
       <label>الهاتف<input name="phone" type="tel" value="${esc(s?.phone || '')}"></label>
       <label>${s ? 'كلمة سر جديدة (اختياري)' : 'كلمة السر'}<input name="password" ${s ? '' : 'required'} minlength="6" autocomplete="new-password"></label>`,
      async (data) => {
        await api(s ? 'PUT' : 'POST', s ? `/api/quran/sheikhs/${s.id}` : '/api/quran/sheikhs', data);
        toast('تم الحفظ ✓');
        viewQuranHome(root, 'sheikhs');
      }
    );
  $('#q-add-sh').addEventListener('click', () => form(null));
  page.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => form(d.sheikhs.find((s) => s.id === Number(b.dataset.edit)))));
  page.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirmAction('حذف حساب الشيخ؟ مجموعاته وطلبته يبقون.')) return;
      await api('DELETE', `/api/quran/sheikhs/${b.dataset.del}`).catch((e) => toast(e.message, true));
      viewQuranHome(root, 'sheikhs');
    })
  );
}

// نموذج الطالب: الهوية، المجموعة، نسق المراجعة، الحساب
function quranStudentForm(s, d, onDone) {
  const admin = state.user.role === 'admin';
  openModal(
    s ? `تعديل: ${s.full_name}` : 'طالب جديد',
    `<div class="row"><label>الاسم<input name="first_name" required maxlength="60" value="${esc(s?.first_name || '')}"></label>
       <label>اللقب<input name="last_name" maxlength="60" value="${esc(s?.last_name || '')}"></label></div>
     <div class="row"><label>العمر<input name="age" type="number" min="3" max="99" value="${s?.age ?? ''}"></label>
       <label>المستوى<input name="level" list="q-levels" value="${esc(s?.level || '')}"></label></div>
     <datalist id="q-levels">${Q_LEVELS.map((l) => `<option value="${l}">`).join('')}</datalist>
     <label>المجموعة<select name="group_id"><option value="">— بلا مجموعة —</option>${d.groups
       .map((g) => `<option value="${g.id}" data-day="${g.meet_day}" ${s?.group_id === g.id ? 'selected' : ''}>${esc(g.name)} (${Q_DAYS[g.meet_day]})</option>`)
       .join('')}</select></label>
     ${admin && d.sheikhs.length ? `<label>الشيخ (إن لم تكن له مجموعة)<select name="sheikh_id"><option value="">—</option>${d.sheikhs
       .map((x) => `<option value="${x.id}" ${s?.sheikh_id === x.id ? 'selected' : ''}>${esc(x.full_name)}</option>`).join('')}</select></label>` : ''}
     <fieldset class="q-fs"><legend>نسق المراجعة</legend>
       <label>بداية الأسبوع (عادة يوم اللقاء مع الشيخ)${daySelect('week_start', s?.week_start ?? 6)}</label>
       <div class="row"><label>المحفوظ الجيد: يُختم كل<input name="solid_days" type="number" min="1" max="60" value="${s?.solid_days ?? 7}"> <small class="muted">يوم</small></label>
         <label>المحفوظ الذي يحتاج مراجعة: كل<input name="weak_days" type="number" min="1" max="60" value="${s?.weak_days ?? 7}"> <small class="muted">يوم</small></label></div>
       <label>عدد قراءات الدرس الجديد في الأسبوع<input name="lesson_target" type="number" min="1" max="1000" value="${s?.lesson_target ?? 70}"></label>
     </fieldset>
     <fieldset class="q-fs"><legend>حساب الطالب</legend>
       ${s ? `<p class="muted small">اسم المستخدم: <b dir="ltr">${esc(s.username)}</b></p>` : '<label>اسم المستخدم<input name="username" required dir="ltr" autocomplete="off"></label>'}
       <label>${s ? 'كلمة سر جديدة (اختياري)' : 'كلمة السر'}<input name="password" ${s ? '' : 'required'} minlength="6" autocomplete="new-password"></label>
       <label>هاتف (الطالب أو وليّه)<input name="phone" type="tel" value="${esc(s?.phone || '')}"></label>
       ${s ? `<label class="check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> يدرس حاليًا</label>` : ''}
     </fieldset>`,
    async (data) => {
      const r = await api(s ? 'PUT' : 'POST', s ? `/api/quran/students/${s.id}` : '/api/quran/students', data);
      toast('تم الحفظ ✓');
      onDone(r.student);
    }
  );
  // اختيار المجموعة: بداية الأسبوع = يوم لقائها
  const sel = $('#modal-form select[name=group_id]');
  sel.addEventListener('change', () => {
    const day = sel.selectedOptions[0]?.dataset.day;
    if (day !== undefined) $('#modal-form select[name=week_start]').value = day;
  });
}

// ---------- حصة اللقاء لمجموعة: الحضور ثم تقييم كل طالب ----------
async function viewQuranGroup(el, id) {
  const d = await api('GET', '/api/quran/overview');
  const g = d.groups.find((x) => x.id === id);
  if (!g) throw new Error('المجموعة غير موجودة');
  const members = d.students.filter((s) => s.group_id === id && s.active);
  const day = today();
  el.innerHTML = `<p><a href="#/quran/groups">→ المجموعات</a></p>
    <div class="card"><div class="section-head"><h2>📋 ${esc(g.name)}</h2><label class="q-date">تاريخ اللقاء <input type="date" id="qg-date" value="${day}" max="${day}"></label></div>
      <p class="muted small">سجّل الحضور، ثم اضغط «تقييم» لكل طالب حاضر: تقييم المراجعة، تسميع الدرس، الملاحظة والدرس الجديد.</p>
      ${members.length ? `<ul class="q-att">${members
        .map((s) => `<li><span class="q-att-name">${avatar({ full_name: s.full_name }, 'sm')} <a href="#/quran/student/${s.id}">${esc(s.full_name)}</a>
            ${s.lesson ? `<small class="muted">الدرس: ${s.lesson.total}/${s.lesson.target}</small>` : ''}</span>
          <span class="q-att-opts">${Object.entries(Q_ATT)
            .map(([k, l]) => `<label class="chip-check q-${k}"><input type="radio" name="a${s.id}" value="${k}" ${k === 'present' ? 'checked' : ''}> ${l}</label>`)
            .join('')}</span>
          <button type="button" class="btn small ghost" data-eval="${s.id}">✍️ تقييم</button></li>`)
        .join('')}</ul>
      <button type="button" class="btn" id="qg-save">حفظ الحضور</button>` : '<p class="muted">لا يوجد طلبة في هذه المجموعة.</p>'}
    </div>`;
  $('#qg-save')?.addEventListener('click', async () => {
    const marks = Object.fromEntries(members.map((s) => [s.id, el.querySelector(`input[name="a${s.id}"]:checked`)?.value]));
    try {
      const r = await api('POST', `/api/quran/groups/${id}/attendance`, { date: $('#qg-date').value, marks });
      toast(`تم حفظ حضور ${r.saved} طالب ✓`);
    } catch (e) {
      toast(e.message, true);
    }
  });
  el.querySelectorAll('[data-eval]').forEach((b) =>
    b.addEventListener('click', async () => {
      const full = await api('GET', `/api/quran/students/${b.dataset.eval}`);
      const att = el.querySelector(`input[name="a${b.dataset.eval}"]:checked`)?.value;
      quranMeetingForm(full, { date: $('#qg-date').value, attendance: att }, () => toast('تم الحفظ ✓'));
    })
  );
}

// نموذج اللقاء: الحضور، التقييمات، الملاحظة، وإملاء الدرس الجديد
function quranMeetingForm(full, preset = {}, onDone) {
  const st = full.student;
  const day = preset.date || today();
  const m = full.meetings.find((x) => x.date === day) || {};
  // الدرس المسمَّع: آخر درس قبل هذا اللقاء
  const prev = full.lessons.find((l) => l.assigned_on < day) || full.lessons.find((l) => l.assigned_on <= day);
  openModal(
    `✍️ لقاء ${st.full_name}`,
    `<div class="row"><label>التاريخ<input type="date" name="date" value="${day}" max="${today()}"></label>
       <label>الحضور<select name="attendance">${Object.entries(Q_ATT)
         .map(([k, l]) => `<option value="${k}" ${(preset.attendance || m.attendance || 'present') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
     <fieldset class="q-fs"><legend>المراجعة الأسبوعية</legend>
       <p class="muted small">أنجز ${st.review_done} من ${st.review_expected} حصة هذا الأسبوع.</p>
       ${ratingSelect('review_eval', 'تقييم المراجعة', m.review_eval)}</fieldset>
     <fieldset class="q-fs"><legend>تسميع الدرس</legend>
       ${full.lessons.length ? `<label>الدرس<select name="lesson_id"><option value="">—</option>${full.lessons
         .map((l) => `<option value="${l.id}" ${(m.lesson_id || prev?.id) === l.id ? 'selected' : ''}>${esc(l.content)} · ${fmtDate(l.assigned_on)} (${l.total}/${l.target})</option>`).join('')}</select></label>` : '<p class="muted small">لا درس سابق.</p>'}
       <div class="row">${ratingSelect('hifz_eval', 'الحفظ', m.hifz_eval)}${ratingSelect('ada_eval', 'الأداء', m.ada_eval)}</div>
       ${ratingSelect('tajweed_eval', 'التجويد والأحكام', m.tajweed_eval)}</fieldset>
     <label>ملاحظة يراها الطالب<textarea name="note" rows="2">${esc(m.note || '')}</textarea></label>
     <fieldset class="q-fs"><legend>📝 الدرس الجديد (اللوح)</legend>
       <label class="check"><input type="checkbox" name="new_lesson" ${m.id ? '' : 'checked'}> إملاء درس جديد لهذا الأسبوع</label>
       <label>المقطع<input name="content" placeholder="مثال: الملك 1–14" maxlength="300"></label>
       <div class="row"><label>عدد الأثمان<select name="athman"><option value="0.5">نصف ثمن</option><option value="1" selected>ثمن</option><option value="2">ثمنان</option><option value="3">3 أثمان</option><option value="4">ربع حزب</option></select></label>
         <label>عدد القراءات<input name="target" type="number" min="1" value="${st.lesson_target}"></label></div></fieldset>`,
    async (data) => {
      const { new_lesson, content, athman, target, ...meeting } = data;
      if (new_lesson && !String(content || '').trim()) throw new Error('اكتب مقطع الدرس الجديد، أو أزل علامة «إملاء درس جديد»');
      await api('POST', `/api/quran/students/${st.id}/meetings`, meeting);
      if (new_lesson) await api('POST', `/api/quran/students/${st.id}/lessons`, { content, athman: Number(athman), target, assigned_on: meeting.date });
      onDone();
    }
  );
}

function quranLessonForm(st, onDone) {
  openModal(
    '📝 درس جديد',
    `<label>المقطع<input name="content" required placeholder="مثال: الملك 1–14" maxlength="300"></label>
     <div class="row"><label>عدد الأثمان<select name="athman"><option value="0.5">نصف ثمن</option><option value="1" selected>ثمن</option><option value="2">ثمنان</option><option value="3">3 أثمان</option><option value="4">ربع حزب</option></select></label>
       <label>عدد القراءات<input name="target" type="number" min="1" value="${st.lesson_target}"></label></div>
     <label>بداية الأسبوع<input type="date" name="assigned_on" value="${today()}"></label>`,
    async (data) => {
      await api('POST', `/api/quran/students/${st.id}/lessons`, { ...data, athman: Number(data.athman) });
      toast('تم ✓');
      onDone();
    }
  );
}

// ---------- صفحة الطالب (الطالب نفسه، شيخه والإدارة) ----------
async function viewQuranStudent(el, id, week = '') {
  const full = await api('GET', `/api/quran/students/${id}${week ? `?week=${week}` : ''}`);
  const { student: st, lesson, today: day } = full;
  const staff = isQuranStaff();
  const me = state.user.role === 'talib';
  const todayRow = full.week.find((w) => w.date === day);
  const pace = lesson ? lessonPace(lesson, day, st.week_start) : null;
  const todayReps = lesson?.reps?.find((r) => r.date === day)?.count || 0;
  const reviewCard = (kind, title, cls) => {
    const p = todayRow?.[kind];
    if (!p) return '';
    return `<label class="q-task ${cls} ${p.done ? 'done' : ''}"><input type="checkbox" data-review="${kind}" data-date="${day}" ${p.done ? 'checked' : ''}>
      <span class="q-task-body"><small>${title} · اليوم ${p.day} من ${p.of}</small><b>${esc(p.label)}</b><em>≈ ${hizbTxt(p.size)}</em></span>
      <span class="q-tick">✓</span></label>`;
  };
  const prevWeek = qAddDays(full.week_start, -7);
  const nextWeek = qAddDays(full.week_start, 7);
  el.innerHTML = `
    ${me ? heroBanner({ sub: `${st.group_name ? `🕌 ${esc(st.group_name)} · ` : ''}أسبوعك يبدأ يوم <b>${Q_DAYS[st.week_start]}</b>.`, art: '📖' })
      : `<p><a href="#/quran">→ فضاء التحفيظ</a></p>
      <div class="card q-head">${avatar({ full_name: st.full_name }, 'md')}<div><h2>${esc(st.full_name)}</h2>
        <span class="muted small">${[st.group_name && `🕌 ${esc(st.group_name)}`, st.sheikh_name && `الشيخ ${esc(st.sheikh_name)}`, st.level && esc(st.level), st.age && `${st.age} سنة`, `الأسبوع يبدأ ${Q_DAYS[st.week_start]}`].filter(Boolean).join(' · ')}</span></div>
        <div class="q-actions"><button type="button" class="btn small" id="q-meet">✍️ اللقاء والتقييم</button><button type="button" class="btn small ghost" id="q-lesson">📝 درس جديد</button><button type="button" class="btn small ghost" id="q-edit">تعديل</button></div></div>`}

    <section class="card q-lesson">
      <div class="section-head"><h3>📝 الدرس الجديد</h3>${lesson ? `<span class="pill">${lesson.athman === 0.5 ? 'نصف ثمن' : lesson.athman === 1 ? 'ثمن' : lesson.athman === 2 ? 'ثمنان' : `${String(lesson.athman).replace('.', ',')} أثمان`}</span>` : ''}</div>
      ${lesson ? `<p class="q-lesson-txt">${esc(lesson.content)}</p>
        <div class="q-counter">
          <div class="q-ring ${lesson.total >= lesson.target ? 'ok' : ''}" style="--p:${Math.min(100, Math.round((lesson.total / lesson.target) * 100))}"><b id="q-total">${lesson.total}</b><small>من ${lesson.target}</small></div>
          <div class="q-counter-side">
            ${lesson.total >= lesson.target
              ? `<p class="q-goal">🎉 وصلت للهدف! قرأت الدرس <b>${lesson.total}</b> مرة.</p>`
              : `<p>اليوم: <b id="q-today">${todayReps}</b> قراءة · المطلوب اليوم <b>${Math.max(0, pace.perDay - todayReps)}</b> أخرى</p>
                 <p class="muted small">الباقي ${pace.remaining} قراءة في ${pace.daysLeft} ${pace.daysLeft > 1 ? 'أيام' : 'يوم'} (حوالي ${pace.perDay} في اليوم)</p>`}
            ${me || staff ? `<div class="q-count-btns"><button type="button" class="btn q-plus" data-add="1">＋1</button><button type="button" class="btn ghost" data-add="5">＋5</button>
              <button type="button" class="btn ghost" data-add="-1" title="تراجع">−1</button><button type="button" class="btn ghost" id="q-set">✏️ العدد</button></div>` : ''}
          </div></div>` : `<p class="muted">لا يوجد درس حاليًا. ${staff ? 'اضغط «درس جديد» أو «اللقاء والتقييم».' : 'الشيخ يملي الدرس في اللقاء.'}</p>`}
    </section>

    <section class="card">
      <div class="section-head"><h3>🔁 مراجعة اليوم · ${esc(qDay(day))}</h3><span class="muted small">${st.review_done}/${st.review_expected} هذا الأسبوع</span></div>
      ${todayRow && (todayRow.solid || todayRow.weak)
        ? `<div class="q-tasks">${reviewCard('solid', 'المحفوظ الجيد (قراءة من الحفظ)', 's')}${reviewCard('weak', 'تثبيت ما يحتاج مراجعة', 'w')}</div>`
        : `<p class="muted">لا توجد مراجعة: حدّد المحفوظ أولًا.</p>`}
    </section>

    <section class="card">
      <div class="section-head"><h3>📅 الأسبوع</h3><span class="q-weeknav"><a href="#/quran/student/${st.id}?week=${prevWeek}" title="الأسبوع السابق">→</a>
        <b>${qShort(full.week_start)} – ${qShort(qAddDays(full.week_start, 6))}</b>
        ${nextWeek <= day ? `<a href="#/quran/student/${st.id}?week=${nextWeek}" title="الأسبوع الموالي">←</a>` : '<span></span>'}</span></div>
      <div class="q-week">${full.week
        .map((w) => {
          const future = w.date > day;
          const cell = (k, cls) => (w[k] ? `<button type="button" class="q-cell ${cls} ${w[k].done ? 'done' : ''}" ${future || !(me || staff) ? 'disabled' : ''} data-review="${k}" data-date="${w.date}" data-on="${w[k].done ? 1 : 0}" title="${esc(w[k].label)}">${w[k].done ? '✓' : future ? '·' : '✗'}</button>` : '<span class="q-cell none">—</span>');
          return `<div class="q-day ${w.date === day ? 'today' : ''} ${future ? 'future' : ''}"><b>${qDay(w.date).replace('ال', '')}</b><small>${qShort(w.date)}</small>
            ${cell('solid', 's')}${cell('weak', 'w')}<span class="q-reps" title="قراءات الدرس">${w.reps || ''}</span></div>`;
        })
        .join('')}</div>
      <p class="muted small q-legend"><span class="q-dot s"></span> المحفوظ الجيد <span class="q-dot w"></span> ما يحتاج مراجعة · الرقم: قراءات الدرس. اضغط خانة يوم سابق لتسجيلها.</p>
    </section>

    <section class="card">
      <div class="section-head"><h3>📗 المحفوظ</h3><a class="btn small" href="#/quran/hifz/${st.id}">${me ? 'تحديد محفوظي' : 'تحديد المحفوظ'}</a></div>
      <div class="q-mem-sum"><div><span class="q-dot s"></span><b>${hizbTxt(st.solid_hizb)}</b><small>محفوظ جيد · يُختم كل ${st.solid_days} أيام</small></div>
        <div><span class="q-dot w"></span><b>${hizbTxt(st.weak_hizb)}</b><small>يحتاج مراجعة · يُكرَّر كل ${st.weak_days} أيام</small></div>
        <div><span class="q-dot"></span><b>${hizbTxt(st.solid_hizb + st.weak_hizb)}</b><small>من 60 حزبًا</small></div></div>
      ${bar(st.solid_hizb + st.weak_hizb, 60)}
    </section>

    <section class="card">
      <h3>🗒 اللقاءات وملاحظات الشيخ</h3>
      ${full.meetings.length ? `<ul class="notes">${full.meetings
        .map((m) => `<li class="note"><div class="note-head"><b>${fmtDate(m.date)}</b> <span class="badge ${Q_ATT_CLS[m.attendance]}">${Q_ATT[m.attendance]}</span>
            ${ratingBadge(m.review_eval, 'المراجعة')} ${ratingBadge(m.hifz_eval, 'الحفظ')} ${ratingBadge(m.ada_eval, 'الأداء')} ${ratingBadge(m.tajweed_eval, 'التجويد')}
            ${staff ? `<button type="button" class="link small danger" data-del-meet="${m.id}">حذف</button>` : ''}</div>
          ${m.lesson_content ? `<p class="muted small">الدرس المسمَّع: ${esc(m.lesson_content)}</p>` : ''}
          ${m.note ? `<p>${esc(m.note)}</p>` : ''}</li>`)
        .join('')}</ul>` : '<p class="muted">لا لقاءات مسجّلة بعد.</p>'}
    </section>

    ${full.lessons.length > 1 || staff ? `<section class="card"><h3>📚 الدروس السابقة</h3>
      ${full.lessons.length ? `<ul class="levels">${full.lessons
        .map((l) => `<li><span>${fmtDate(l.assigned_on)} — <b>${esc(l.content)}</b></span><span>${l.total}/${l.target} ${l.total >= l.target ? '✅' : ''}
          ${staff ? `<button type="button" class="link small danger" data-del-lesson="${l.id}">حذف</button>` : ''}</span></li>`)
        .join('')}</ul>` : '<p class="muted">لا دروس.</p>'}</section>` : ''}`;

  const reload = () => viewQuranStudent(el, id, week);
  // المراجعة: خانة اليوم أو أيام الأسبوع
  el.querySelectorAll('[data-review]').forEach((c) =>
    c.addEventListener(c.tagName === 'INPUT' ? 'change' : 'click', async () => {
      const done = c.tagName === 'INPUT' ? c.checked : c.dataset.on !== '1';
      try {
        await api('POST', `/api/quran/students/${id}/review`, { kind: c.dataset.review, date: c.dataset.date, done });
        if (done) toast('بارك الله فيك ✓');
        reload();
      } catch (e) {
        toast(e.message, true);
      }
    })
  );
  // العدّاد
  el.querySelectorAll('[data-add]').forEach((b) =>
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        const r = await api('PUT', `/api/quran/lessons/${lesson.id}/reps`, { add: Number(b.dataset.add) });
        if (r.reached && lesson.total < lesson.target) toast(`🎉 وصلت للهدف: ${r.total} قراءة`);
        reload();
      } catch (e) {
        toast(e.message, true);
        b.disabled = false;
      }
    })
  );
  $('#q-set')?.addEventListener('click', () =>
    openModal(
      '✏️ عدد القراءات',
      `<label>اليوم<input type="date" name="date" value="${day}" min="${lesson.assigned_on}" max="${day}"></label>
       <label>عدد القراءات في ذلك اليوم<input type="number" name="count" min="0" value="${todayReps}" required></label>
       <p class="muted small">المجموع الحالي: ${lesson.total} من ${lesson.target}.</p>`,
      async (data) => {
        await api('PUT', `/api/quran/lessons/${lesson.id}/reps`, data);
        reload();
      }
    )
  );
  if (staff) {
    $('#q-meet')?.addEventListener('click', () => quranMeetingForm(full, {}, () => (toast('تم الحفظ ✓'), reload())));
    $('#q-lesson')?.addEventListener('click', () => quranLessonForm(st, reload));
    $('#q-edit')?.addEventListener('click', async () => {
      const d = await api('GET', '/api/quran/overview');
      quranStudentForm(st, d, reload);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn ghost danger';
      del.textContent = 'حذف الطالب';
      $('#modal-form .actions').append(del);
      del.addEventListener('click', async () => {
        if (!confirmAction(`حذف ${st.full_name} وكل متابعته نهائيًا؟`)) return;
        await api('DELETE', `/api/quran/students/${st.id}`).catch((e) => toast(e.message, true));
        $('#modal').close();
        location.hash = '#/quran';
      });
    });
    el.querySelectorAll('[data-del-meet]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirmAction('حذف هذا اللقاء؟')) return;
        await api('DELETE', `/api/quran/meetings/${b.dataset.delMeet}`).catch((e) => toast(e.message, true));
        reload();
      })
    );
    el.querySelectorAll('[data-del-lesson]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirmAction('حذف هذا الدرس وعدّاد قراءاته؟')) return;
        await api('DELETE', `/api/quran/lessons/${b.dataset.delLesson}`).catch((e) => toast(e.message, true));
        reload();
      })
    );
  }
}

// ---------- تحديد المحفوظ: ربع ← جزء ← سورة ----------
async function viewQuranHifz(el, id) {
  const full = await api('GET', `/api/quran/students/${id}`);
  const st = full.student;
  const mem = { ...(st.memorized || {}) };
  let mode = 's';
  // ربع → أجزاء → سور (السورة قد تمتدّ على عدّة أجزاء: تظهر في كل جزء بآياتها)
  const tree = QD.QUARTERS.map((q) => {
    const segs = QD.segments.filter((g) => g.quarter === q.n);
    const juzs = [...new Set(segs.map((g) => g.juz))].map((j) => {
      const js = segs.filter((g) => g.juz === j);
      const suras = [...new Set(js.map((g) => g.sura))].map((s) => {
        const ss = js.filter((g) => g.sura === s);
        const from = ss[0].from;
        const to = ss[ss.length - 1].to;
        const whole = from === 1 && to === QD.AYAT[s - 1];
        return { sura: s, ids: ss.map((g) => g.id), name: QD.suraName(s), range: whole ? '' : `${from}–${to}` };
      });
      return { juz: j, ids: js.map((g) => g.id), hizbs: [...new Set(js.map((g) => g.hizb))], suras };
    });
    return { ...q, ids: segs.map((g) => g.id), juzs };
  });
  const stateOf = (ids) => {
    const v = ids.map((i) => mem[i] || '');
    if (v.every((x) => x === 's')) return 's';
    if (v.every((x) => x === 'w')) return 'w';
    if (v.every((x) => !x)) return '';
    return 'mix';
  };
  const size = (ids) => QD.sizeOf(ids);
  const apply = (ids) => {
    // نفس الحالة على كل العناصر = إلغاء، وإلا تطبيق الحالة المختارة
    const clear = mode === '' || stateOf(ids) === mode;
    for (const i of ids) clear ? delete mem[i] : (mem[i] = mode);
    render();
  };
  const open = new Set(JSON.parse(sessionStorage.getItem('qOpen') || '[]'));
  el.innerHTML = `<p><a href="#/quran/student/${id}">→ ${state.user.role === 'talib' ? 'متابعتي' : esc(st.full_name)}</a></p>
    <div class="card"><h2>📗 تحديد المحفوظ${state.user.role === 'talib' ? '' : ` — ${esc(st.full_name)}`}</h2>
      <p class="muted small">اختر الحالة، ثم اضغط على ربع كامل أو جزء أو سورة. الضغط مرة ثانية يلغي التحديد. افتح الربع لترى أجزاءه، والجزء لترى سوره.</p>
      <div class="q-modes" role="radiogroup">
        <button type="button" class="q-mode s on" data-mode="s">✓ محفوظ جيد<small>أقرؤه من حفظي</small></button>
        <button type="button" class="q-mode w" data-mode="w">↻ يحتاج مراجعة<small>لازمه تثبيت</small></button>
        <button type="button" class="q-mode c" data-mode="">✕ مسح<small>غير محفوظ</small></button>
      </div></div>
    <div id="q-tree"></div>
    <div class="q-savebar"><span id="q-sum"></span><button type="button" class="btn" id="q-save">حفظ المحفوظ</button></div>`;
  el.querySelectorAll('.q-mode').forEach((b) =>
    b.addEventListener('click', () => {
      mode = b.dataset.mode;
      el.querySelectorAll('.q-mode').forEach((x) => x.classList.toggle('on', x === b));
    })
  );
  function render() {
    const solid = Object.keys(mem).filter((k) => mem[k] === 's').map(Number);
    const weak = Object.keys(mem).filter((k) => mem[k] === 'w').map(Number);
    $('#q-sum').innerHTML = `<span class="q-dot s"></span> ${hizbTxt(size(solid))} <span class="q-dot w"></span> ${hizbTxt(size(weak))}`;
    $('#q-tree').innerHTML = tree
      .map((q) => {
        const sq = stateOf(q.ids);
        const memIds = q.ids.filter((i) => mem[i]);
        return `<details class="card q-quarter" data-key="q${q.n}" ${open.has(`q${q.n}`) ? 'open' : ''}>
          <summary><span class="q-num">${q.n}</span><span class="q-qname"><b>${q.name}</b><small>${hizbTxt(size(memIds))} من ${hizbTxt(size(q.ids))}</small>${bar(size(memIds), size(q.ids))}</span>
            <button type="button" class="q-pick ${sq}" data-ids="${q.ids.join(',')}" title="كل الربع">${sq === 's' ? '✓' : sq === 'w' ? '↻' : sq === 'mix' ? '◐' : '○'}</button></summary>
          ${q.juzs
            .map((j) => {
              const sj = stateOf(j.ids);
              return `<details class="q-juz" data-key="j${q.n}-${j.juz}" ${open.has(`j${q.n}-${j.juz}`) ? 'open' : ''}>
                <summary><span class="q-jname">الجزء ${j.juz} <small class="muted">· الحزب ${j.hizbs.join(' و')}</small></span>
                  <button type="button" class="q-pick ${sj}" data-ids="${j.ids.join(',')}" title="كل الجزء">${sj === 's' ? '✓' : sj === 'w' ? '↻' : sj === 'mix' ? '◐' : '○'}</button></summary>
                <div class="q-suras">${j.suras
                  .map((s) => `<button type="button" class="q-sura ${stateOf(s.ids)}" data-ids="${s.ids.join(',')}">${s.name}${s.range ? ` <small>${s.range}</small>` : ''}</button>`)
                  .join('')}</div></details>`;
            })
            .join('')}</details>`;
      })
      .join('');
    $('#q-tree').querySelectorAll('[data-ids]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        apply(b.dataset.ids.split(',').map(Number));
      })
    );
    $('#q-tree').querySelectorAll('details').forEach((d) =>
      d.addEventListener('toggle', () => {
        d.open ? open.add(d.dataset.key) : open.delete(d.dataset.key);
        sessionStorage.setItem('qOpen', JSON.stringify([...open]));
      })
    );
  }
  render();
  $('#q-save').addEventListener('click', async () => {
    try {
      await api('PUT', `/api/quran/students/${id}/memorized`, { memorized: mem });
      toast('تم حفظ المحفوظ ✓ وتحديث خطة المراجعة');
      location.hash = `#/quran/student/${id}`;
    } catch (e) {
      toast(e.message, true);
    }
  });
}

// المسارات (تُضاف لقائمة app.js)
routes.unshift(
  [/^#\/quran(?:\/(students|groups|sheikhs))?$/, (el, tab) => (state.user.role === 'talib' ? viewQuranStudent(el, state.user.id) : viewQuranHome(el, tab || ''))],
  [/^#\/quran\/student\/(\d+)(?:\?week=(\d{4}-\d{2}-\d{2}))?$/, (el, id, week) => viewQuranStudent(el, Number(id), week || '')],
  [/^#\/quran\/hifz\/(\d+)$/, (el, id) => viewQuranHifz(el, Number(id))],
  [/^#\/quran\/group\/(\d+)$/, (el, id) => viewQuranGroup(el, Number(id))],
  [/^#\/my-hifz$/, (el) => viewQuranHifz(el, state.user.id)]
);
