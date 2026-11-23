'use strict';
// واجهات المعلّم: الطلبة (بطاقات + حضور الحصة)، السجل الشامل، التحديات، تقييم الحصة، وعرض التقييمات

const Q_ATT_ICON = { present: '✓', absent: '✗', excused: '!' };
const attChip = (a) => (a ? `<span class="att-chip ${a}">${Q_ATT_ICON[a]} ${Q_ATT[a]}</span>` : '<span class="att-chip none">—</span>');
const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const sessionOf = (d, ws) => qAddDays(d, -((dow(d) - ws + 7) % 7));
// التقييم: نقاط من 1 إلى 5 (والقيم القديمة تظهر كما هي)
const starsTxt = (v) => {
  if (!v) return '';
  if (/^[1-5]$/.test(v)) return `<span class="stars" title="${v} من 5">${'★'.repeat(+v)}<i>${'★'.repeat(5 - v)}</i></span>`;
  return `<span class="badge ${v}">${Q_RATING[v] || esc(v)}</span>`;
};
const starInput = (name, value = '') =>
  `<span class="star-in" data-name="${name}"><input type="hidden" name="${name}" value="${/^[1-5]$/.test(value || '') ? value : ''}">${[1, 2, 3, 4, 5]
    .map((n) => `<button type="button" data-v="${n}" aria-label="${n} من 5">★</button>`).join('')}</span>`;
function bindStars(root) {
  root.querySelectorAll('.star-in').forEach((box) => {
    const inp = box.querySelector('input');
    const paint = () => box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) <= Number(inp.value || 0)));
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      inp.value = inp.value === b.dataset.v ? '' : b.dataset.v;
      paint();
    });
    box._set = (v) => ((inp.value = /^[1-5]$/.test(v || '') ? v : ''), paint());
    paint();
  });
}
const attSeg = (name, value) =>
  `<span class="att-seg">${Object.entries(Q_ATT)
    .map(([k, l]) => `<label class="${k}"><input type="radio" name="${name}" value="${k}" ${value === k ? 'checked' : ''}><span>${Q_ATT_ICON[k]} ${l}</span></label>`).join('')}</span>`;

// ---------- الطلبة: بطاقات، وحضور حصة الأسبوع ----------
async function quranStudentsTab(page, d, root) {
  if (!d.students.length) {
    page.innerHTML = '<div class="card empty-state"><span>📖</span><p>لا يوجد طلبة بعد. أضف مجموعة ثم طالبًا جديدًا.</p></div>';
    return;
  }
  const t = today();
  let ref = t;
  page.innerHTML = `<div class="card ses-card">
      <div class="ses-nav"><button type="button" class="ses-btn" id="ses-prev" aria-label="الحصة السابقة">→</button>
        <div class="ses-label" id="ses-label"></div>
        <button type="button" class="ses-btn" id="ses-next" aria-label="الحصة الموالية">←</button></div>
      <div class="ses-sum" id="ov-sum"></div>
      <div class="ses-actions"><button type="button" class="btn small ghost" id="ov-all">✓ الكل حاضر</button><button type="button" class="btn small" id="ov-save">حفظ الحضور</button></div>
    </div>
    <div class="q-filters">
      <input type="search" id="q-search" placeholder="🔍 بحث بالاسم…">
      <select id="q-group"><option value="">كل المجموعات</option>${d.groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}<option value="none">بلا مجموعة</option></select>
      <select id="q-sort"><option value="name">ترتيب بالاسم</option><option value="review">الأقل وردًا أولًا</option><option value="hifz">الأكثر حفظًا أولًا</option><option value="absent">الغائبون أولًا</option></select>
    </div>
    <div class="st-cards" id="ov-body"></div>
    <label class="check small muted"><input type="checkbox" id="q-off"> إظهار الطلبة المتوقفين</label>`;
  let saved = {};
  let draft = {};
  let sessions = {};
  const visible = () => {
    const q = $('#q-search').value.trim();
    const g = $('#q-group').value;
    const sort = $('#q-sort').value;
    let list = d.students.filter((x) => (x.active || $('#q-off').checked) && (!q || x.full_name.includes(q)) && (!g || (g === 'none' ? !x.group_id : String(x.group_id) === g)));
    if (sort === 'review') list = [...list].sort((a, b) => (a.review?.percent ?? 101) - (b.review?.percent ?? 101));
    if (sort === 'hifz') list = [...list].sort((a, b) => b.solid_hizb + b.weak_hizb - (a.solid_hizb + a.weak_hizb));
    if (sort === 'absent') list = [...list].sort((a, b) => (draft[b.id] && draft[b.id] !== 'present') - (draft[a.id] && draft[a.id] !== 'present'));
    return list;
  };
  const mainSession = () => {
    const c = {};
    visible().forEach((s) => sessions[s.id] && (c[sessions[s.id]] = (c[sessions[s.id]] || 0) + 1));
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || sessionOf(ref, 6);
  };
  const header = () => {
    const ses = mainSession();
    const cur = ses === sessionOf(t, dow(ses));
    $('#ses-label').innerHTML = `<small>${cur ? 'حصة هذا الأسبوع' : 'حصة سابقة'}</small><b>${qDay(ses)} ${fmtDate(ses)}</b>`;
    $('#ses-next').disabled = qAddDays(ref, 7) > t;
  };
  const summary = () => {
    const list = visible().filter((x) => x.active);
    const n = (k) => list.filter((x) => draft[x.id] === k).length;
    const none = list.filter((x) => !draft[x.id]).length;
    const dirty = Object.keys({ ...saved, ...draft }).some((k) => saved[k] !== draft[k]);
    $('#ov-sum').innerHTML = `<span class="att-chip present">✓ ${n('present')} حاضر</span><span class="att-chip absent">✗ ${n('absent')} غائب</span>
      <span class="att-chip excused">! ${n('excused')} بعذر</span>${none ? `<span class="att-chip none">${none} لم يُسجَّل</span>` : ''}
      ${dirty ? '<b class="q-unsaved">● غير محفوظ</b>' : ''}`;
  };
  const main = () => mainSession();
  const render = () => {
    const ms = main();
    $('#ov-body').innerHTML = visible()
      .map((s) => {
        const r = s.review || {};
        const l = s.lesson;
        const a = draft[s.id] || '';
        const own = sessions[s.id] && sessions[s.id] !== ms ? `<small class="st-ses">حصته: ${qDay(sessions[s.id])} ${qShort(sessions[s.id])}</small>` : '';
        return `<article class="st-card ${a ? `att-${a}` : ''} ${s.active ? '' : 'off'}" data-id="${s.id}">
          <div class="st-top"><a href="#/quran/student/${s.id}" class="st-id">${avatar(s, 'md')}
            <span><b>${esc(s.full_name)}</b><small>${[s.group_name ? `🕌 ${esc(s.group_name)}` : 'بلا مجموعة', s.age && `${s.age} سنة`].filter(Boolean).join(' · ')}</small>${own}</span></a>
            ${s.active ? '' : '<span class="badge general">متوقف</span>'}
            <button type="button" class="st-del" data-del-st="${s.id}" title="حذف الطالب" aria-label="حذف الطالب">🗑</button></div>
          <div class="st-stats">
            <div><small>المحفوظ</small><b>${hizbTxt(s.solid_hizb + s.weak_hizb)}</b></div>
            <div><small>الورد هذا الأسبوع</small><b>${r.percent ?? 0}%</b>${bar(r.percent || 0, 100)}</div>
            <div><small>تكرار المقرر</small><b>${l ? `${l.week_total}/${l.target}` : '—'}</b>${l ? bar(l.week_total, l.target, l.week_total >= l.target ? 'ok' : '') : ''}</div>
          </div>
          ${s.active ? attSeg(`ov${s.id}`, a) : ''}
        </article>`;
      })
      .join('') || '<p class="muted">لا نتائج.</p>';
    $('#ov-body').querySelectorAll('[data-del-st]').forEach((x) =>
      x.addEventListener('click', async () => {
        const s = d.students.find((y) => y.id === Number(x.dataset.delSt));
        if (!confirmAction(`حذف ${s.full_name} وكل متابعته نهائيًا؟\n(إن كان سيعود لاحقًا فالأفضل تعديله إلى «متوقف»)`)) return;
        try {
          await api('DELETE', `/api/quran/students/${s.id}`);
          toast('تم حذف الطالب');
          viewQuranHome(root, 'students');
        } catch (e) {
          toast(e.message, true);
        }
      })
    );
    header();
    summary();
  };
  const load = async () => {
    const r = await api('GET', `/api/quran/attendance?week=${ref}`);
    saved = r.marks;
    sessions = r.sessions;
    draft = { ...saved };
    render();
  };
  ['q-search', 'q-group', 'q-sort', 'q-off'].forEach((id) => $(`#${id}`).addEventListener(id === 'q-search' ? 'input' : 'change', render));
  $('#ses-prev').addEventListener('click', () => ((ref = qAddDays(ref, -7)), load()));
  $('#ses-next').addEventListener('click', () => {
    ref = qAddDays(ref, 7) > t ? t : qAddDays(ref, 7);
    load();
  });
  $('#ov-body').addEventListener('change', (e) => {
    if (e.target.type !== 'radio') return;
    draft[e.target.name.slice(2)] = e.target.value;
    const card = e.target.closest('.st-card');
    card.classList.remove('att-present', 'att-absent', 'att-excused');
    card.classList.add(`att-${e.target.value}`);
    summary();
  });
  $('#ov-all').addEventListener('click', () => {
    for (const s of visible()) if (s.active && !draft[s.id]) draft[s.id] = 'present';
    render();
  });
  $('#ov-save').addEventListener('click', async () => {
    const out = Object.fromEntries(Object.entries(draft).filter(([k, v]) => saved[k] !== v));
    if (!Object.keys(out).length) return toast('لا يوجد تغيير للحفظ');
    try {
      const r = await api('POST', '/api/quran/attendance', { week: ref, marks: out });
      saved = { ...draft };
      summary();
      toast(`تم حفظ حضور ${r.saved} طالب ✓`);
    } catch (e) {
      toast(e.message, true);
    }
  });
  await load();
}

// ---------- السجل الشامل لمجموعة ----------
async function viewQuranRecord(el, gid, n = 4, to = '') {
  const r = await api('GET', `/api/quran/groups/${gid}/record?weeks=${n}${to ? `&to=${to}` : ''}`);
  const href = (nn, tt) => `#/quran/record/${gid}?w=${nn}${tt ? `&to=${tt}` : ''}`;
  const older = qAddDays(r.weeks[0], -1);
  const newer = qAddDays(r.weeks[r.weeks.length - 1], 7 * n);
  const order = r.weeks.map((w, i) => i).reverse();
  const cell = (w) => `<td class="rc ${w.att ? `att-${w.att}` : ''}">
      ${attChip(w.att)}
      <span class="rc-l" title="الورد: ما قرأه من محفوظه">📖 <b>${w.ward ?? 0}%</b> <small>${num(w.read)} ح</small></span>
      <span class="rc-l" title="تكرار المقرر">🔁 <b class="${w.reps >= r.target ? 'in' : ''}">${w.reps}</b><small>/${r.target}</small></span>
      ${w.hifz_eval || w.ada_eval ? `<span class="rc-l rc-ev">${starsTxt(w.hifz_eval)}${w.ada_eval ? ` ${starsTxt(w.ada_eval)}` : ''}</span>` : ''}</td>`;
  const total = (s) => {
    const p = s.weeks.filter((w) => w.att === 'present').length;
    const m = s.weeks.filter((w) => w.att).length;
    const read = s.weeks.reduce((t, w) => t + w.read, 0);
    const reps = s.weeks.reduce((t, w) => t + w.reps, 0);
    return `<td class="rc rc-tot"><span class="rc-l">🕌 <b>${p}</b><small>/${m || n}</small></span>
      <span class="rc-l">📖 <b>${s.memorized ? Math.round((read / (s.memorized * n)) * 100) : 0}%</b></span>
      <span class="rc-l">🔁 <b>${Math.round((reps / (r.target * n)) * 100)}%</b></span></td>`;
  };
  el.innerHTML = `<p><a href="#/quran/groups">→ السجل</a></p>
    <div class="page-head"><h2>📊 ${esc(r.group.name)}</h2><span class="muted small">حصة يوم ${Q_DAYS[r.group.meet_day]}</span></div>
    <div class="card rec-ctl">
      <span class="q-seg rec-seg rec-n">${[4, 6, 8].map((k) => `<a href="${href(k, to)}" class="${k === n ? 'on' : ''}">${k} أسابيع</a>`).join('')}</span>
      <span class="q-weeknav"><a href="${href(n, older)}" title="أسابيع أقدم">→</a>
        <b class="rec-range">من ${qShort(r.weeks[0])} إلى ${qShort(qAddDays(r.weeks[r.weeks.length - 1], 6))}</b>
        ${r.has_next ? `<a href="${href(n, newer > r.today ? '' : newer)}" title="أسابيع أحدث">←</a>` : '<span></span>'}</span>
      <p class="rec-legend"><span class="att-chip present">✓ حاضر</span><span class="att-chip absent">✗ غائب</span><span class="att-chip excused">! بعذر</span>
        <span>📖 الورد (من المحفوظ)</span><span>🔁 تكرار المقرر</span><span class="stars">★</span> الحفظ والأداء</p>
    </div>
    ${r.students.length ? `<div class="card rec-wrap"><table class="rec-table"><thead><tr><th class="rc-name">الطالب</th>
        ${order.map((i) => r.weeks[i]).map((w) => `<th>${qShort(w)}${w === sessionOf(r.today, r.group.meet_day) ? '<small>هذا الأسبوع</small>' : ''}</th>`).join('')}<th>المجموع</th></tr></thead>
      <tbody>${r.students.map((s) => `<tr><th class="rc-name"><a href="#/quran/student/${s.id}">${avatar(s, 'sm')}<span>${esc(s.full_name)}<small>${hizbTxt(s.memorized)}</small></span></a></th>
        ${order.map((i) => cell(s.weeks[i])).join('')}${total(s)}</tr>`).join('')}</tbody></table></div>`
      : '<div class="card empty-state"><span>👥</span><p>لا يوجد طلبة في هذه المجموعة.</p></div>'}`;
}

// ---------- التحديات: ترتيب طلبة المجموعة ----------
async function viewChallenges(el, qs = '') {
  const p = new URLSearchParams(qs);
  const period = p.get('period') || 'week';
  const r = await api('GET', `/api/quran/challenges?period=${period}${p.get('g') ? `&group_id=${p.get('g')}` : ''}`);
  const href = (per, g) => `#/challenges?period=${per}${g ? `&g=${g}` : ''}`;
  const gid = r.group?.id || '';
  const medal = (k) => (k === 1 ? '🥇' : k === 2 ? '🥈' : k === 3 ? '🥉' : k ?? '—');
  const board = (title, icon, list, key, detail) => `<section class="card rk-card"><h3>${icon} ${title}</h3>
    <ol class="rk-list">${list.map((x) => `<li class="${x.me ? 'me' : ''} ${x.rank && x.rank <= 3 ? `top top${x.rank}` : ''}">
        <span class="rk-pos">${medal(x.rank)}</span>${avatar(x, 'sm')}
        <span class="rk-name"><b>${esc(x.full_name)}${x.me ? ' <small>(أنت)</small>' : ''}</b><small>${detail(x)}</small>
          <span class="q-bar ${x[key] >= 100 ? 'ok' : ''}"><i style="width:${Math.min(100, x[key] || 0)}%"></i></span></span>
        <b class="rk-val">${x[key] === null ? '—' : `${x[key]}%`}</b></li>`).join('')}</ol></section>`;
  el.innerHTML = `<div class="page-head"><h2>🏆 التحديات</h2>${r.group ? `<span class="pill">🕌 ${esc(r.group.name)}</span>` : ''}</div>
    ${r.groups.length > 1 ? `<label class="rk-group">المجموعة<select id="rk-g">${r.groups.map((g) => `<option value="${g.id}" ${g.id === gid ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>` : ''}
    <div class="q-seg rec-seg rk-seg">${[['week', 'هذا الأسبوع'], ['month', 'هذا الشهر'], ['all', 'الإجمالي']]
      .map(([k, l]) => `<a href="${href(k, p.get('g'))}" class="${k === period ? 'on' : ''}">${l}</a>`).join('')}</div>
    ${!r.rankings ? '<div class="card empty-state"><span>🏆</span><p>التحديات تكون بين طلبة المجموعة الواحدة. لست في مجموعة بعد.</p></div>'
      : !r.rankings.attendance.length ? '<div class="card empty-state"><span>👥</span><p>لا يوجد طلبة في هذه المجموعة.</p></div>'
      : board('الحضور', '🕌', r.rankings.attendance, 'attendance', (x) => (x.marked ? `حضر ${x.present} من ${x.marked} ${x.marked > 2 ? 'حصص' : 'حصة'}` : 'لم يُسجَّل حضور بعد')) +
        board('تكرار المقرر', '🔁', r.rankings.lesson, 'lesson', (x) => `${x.reps} من ${x.reps_target} تكرارًا`) +
        board('الورد', '📖', r.rankings.ward, 'ward', (x) => (x.ward_target ? `قرأ ${num(x.read)} من ${num(x.ward_target)} حزبًا` : 'لم يحدّد محفوظه بعد'))}
    <p class="muted small">الورد: ما قرأه الطالب مقارنة بمحفوظه (من راجع محفوظه أكثر من مرة يتجاوز 100%). تكرار المقرر: الهدف 60 مرة في الأسبوع.</p>`;
  $('#rk-g')?.addEventListener('change', (e) => (location.hash = href(period, e.target.value)));
}

// ---------- تقييم الحصة ----------
function quranMeetingForm(full, preset = {}, onDone) {
  const st = full.student;
  const t = today();
  const cur = sessionOf(t, st.week_start);
  const list = Array.from({ length: 8 }, (_, i) => qAddDays(cur, -7 * i));
  const start = preset.date ? sessionOf(preset.date, st.week_start) : cur;
  if (!list.includes(start)) list.push(start);
  const mOf = (s) => full.meetings.find((x) => x.date >= s && x.date <= qAddDays(s, 6)) || {};
  const lessonOf = (s) => full.lessons.find((l) => l.assigned_on <= qAddDays(s, 6));
  const info = (s) => {
    const l = lessonOf(s);
    const wk = s === cur && full.lesson && l && full.lesson.id === l.id ? full.lesson.week_total : null;
    return `<div class="mf-info"><span class="mf-k">📝 المقرر (كما كتبه الطالب)</span>
      ${l ? `<b>${esc(l.content)}</b> <small class="muted">${athmanTxt(l.athman)} · أُملي ${fmtDate(l.assigned_on)}</small>
        ${wk !== null ? `<span class="mf-reps">🔁 ${wk}/${l.target} هذا الأسبوع</span>` : ''}` : '<span class="muted">لم يكتب الطالب مقررًا بعد.</span>'}
      ${s === cur ? `<span class="mf-k">📖 الورد هذا الأسبوع</span><b>${full.progress.percent ?? 0}%</b>` : ''}</div>`;
  };
  const m = mOf(start);
  openModal(
    `✍️ تقييم ${st.full_name}`,
    `<label>الحصة<select name="date" id="mf-date">${list.sort().reverse()
      .map((d) => `<option value="${d}" ${d === start ? 'selected' : ''}>${qDay(d)} ${fmtDate(d)}${d === cur ? ' (هذا الأسبوع)' : ''}${mOf(d).id ? ' ✓' : ''}</option>`).join('')}</select></label>
     <div class="mf-att">${attSeg('attendance', preset.attendance || m.attendance || 'present')}</div>
     <div id="mf-rates">
       <div class="mf-rate"><span>الحفظ</span>${starInput('hifz_eval', m.hifz_eval)}</div>
       <div class="mf-rate"><span>الأداء</span>${starInput('ada_eval', m.ada_eval)}</div></div>
     <label>ملاحظة للطالب<textarea name="note" rows="3" placeholder="تصل الطالب في الإشعارات">${esc(m.note || '')}</textarea></label>
     <div id="mf-info">${info(start)}</div>`,
    async (data) => {
      const absent = data.attendance !== 'present';
      await api('POST', `/api/quran/students/${st.id}/meetings`, {
        date: data.date, attendance: data.attendance, note: data.note,
        hifz_eval: absent ? '' : data.hifz_eval, ada_eval: absent ? '' : data.ada_eval,
      });
      onDone();
    }
  );
  const f = $('#modal-form');
  bindStars(f);
  const toggle = () => ($('#mf-rates').hidden = f.querySelector('input[name=attendance]:checked')?.value !== 'present');
  f.querySelectorAll('input[name=attendance]').forEach((x) => x.addEventListener('change', toggle));
  toggle();
  $('#mf-date').addEventListener('change', (e) => {
    const s = e.target.value;
    const mm = mOf(s);
    f.querySelectorAll('input[name=attendance]').forEach((x) => (x.checked = x.value === (mm.attendance || 'present')));
    f.querySelector('.star-in[data-name=hifz_eval]')._set(mm.hifz_eval);
    f.querySelector('.star-in[data-name=ada_eval]')._set(mm.ada_eval);
    f.querySelector('textarea[name=note]').value = mm.note || '';
    $('#mf-info').innerHTML = info(s);
    toggle();
  });
}

// ---------- عرض التقييمات والملاحظات (مطويّة عند الطالب) ----------
function meetingsList(meetings, staff) {
  if (!meetings.length) return '<p class="muted">لا تقييمات مسجّلة بعد.</p>';
  return `<div class="meets">${meetings
    .map((m, i) => `<details class="meet att-${m.attendance}" ${(staff || i === 0) && (m.note || m.hifz_eval || m.ada_eval) ? 'open' : ''}>
      <summary><span class="meet-date"><b>${qDay(m.date)}</b> ${fmtDate(m.date)}</span>${attChip(m.attendance)}
        ${m.hifz_eval && /^[1-5]$/.test(m.hifz_eval) ? starsTxt(m.hifz_eval) : ''}${m.note ? '<span class="meet-has">📝</span>' : ''}</summary>
      <div class="meet-body">
        ${m.hifz_eval || m.ada_eval ? `<div class="meet-rates">${m.hifz_eval ? `<span>الحفظ ${starsTxt(m.hifz_eval)}</span>` : ''}${m.ada_eval ? `<span>الأداء ${starsTxt(m.ada_eval)}</span>` : ''}
          ${m.review_eval ? `<span>المراجعة ${starsTxt(m.review_eval)}</span>` : ''}${m.tajweed_eval ? `<span>التجويد ${starsTxt(m.tajweed_eval)}</span>` : ''}</div>` : ''}
        ${m.lesson_content ? `<p class="muted small">📝 المقرر: ${esc(m.lesson_content)}</p>` : ''}
        ${m.note ? `<p class="meet-note">${esc(m.note)}</p>` : ''}
        ${!m.note && !m.hifz_eval && !m.ada_eval ? `<p class="muted small">${m.attendance === 'present' ? 'حضور فقط، بلا تقييم.' : 'لا ملاحظات.'}</p>` : ''}
        <div class="meet-foot"><small class="muted">${m.by_name ? `— ${esc(m.by_name)}` : ''}</small>
          ${staff ? `<button type="button" class="link small danger" data-del-meet="${m.id}">حذف</button>` : ''}</div></div></details>`)
    .join('')}</div>`;
}

routes.unshift(
  [/^#\/quran\/record\/(\d+)(?:\?w=(\d+)(?:&to=(\d{4}-\d{2}-\d{2}))?)?$/, (el, id, w, to) => viewQuranRecord(el, Number(id), Number(w) || 4, to || '')],
  [/^#\/challenges(?:\?(.*))?$/, (el, qs) => viewChallenges(el, qs || '')]
);
