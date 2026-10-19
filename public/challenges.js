'use strict';
// التحديات: عاداتي اليومية، الترتيب لكل تحدٍّ، وإدارة التحديات وتفاصيلها

const WEEK_DAYS = ['إث', 'ثل', 'أر', 'خم', 'جم', 'سب', 'أح'];
const AUDIENCE_LABELS = { students: 'التلاميذ (يسجّلها الولي)', team: 'الإطار (المعلمون والإدارة)' };
const PERIOD_LABELS = { week: 'هذا الأسبوع', month: 'هذا الشهر', all: 'منذ البداية' };
const MEDALS = ['🥇', '🥈', '🥉'];
const medal = (rank) => MEDALS[rank - 1] || rank;

const shiftDate = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);

// ---------- عاداتي ----------
async function viewHabits(el) {
  const week = sessionStorage.getItem('habitsWeek') || '';
  const data = await api('GET', '/api/habits' + (week ? '?week=' + week : ''));
  const isParent = state.user.role === 'parent';
  const thisWeek = data.week_start === shiftDate(data.today, -((new Date(Date.parse(data.today)).getUTCDay() + 6) % 7));
  el.innerHTML = `
    <div class="page-head">
      <h2>✅ ${isParent ? 'تحديات أبنائي' : 'عاداتي'}</h2>
      <div class="actions week-nav">
        <button class="btn ghost small" id="hb-prev">→ الأسبوع السابق</button>
        <span class="small">${fmtDate(data.week_start)} — ${fmtDate(shiftDate(data.week_start, 6))}</span>
        <button class="btn ghost small" id="hb-next" ${thisWeek ? 'disabled' : ''}>الأسبوع التالي ←</button>
      </div>
    </div>
    <p class="muted small">اضغط على دائرة اليوم لتسجيله منجزًا (أو لإلغائه). يمكن تسجيل آخر 7 أيام. <a href="#/leaderboard">🏆 الترتيب</a></p>
    ${
      data.participants.length
        ? data.participants
            .map(
              (p) => `<section class="habits-group">
                ${isParent ? `<h3>👦 ${esc(p.name)}</h3>` : ''}
                ${p.habits
                  .map(
                    (h) => `<div class="card habit" data-c="${h.id}" data-s="${p.student_id || ''}">
                      <div class="section-head">
                        <h3>${esc(h.icon || '⭐')} ${esc(h.title)}</h3>
                        <a class="small" href="#/leaderboard/${h.id}">🏆 ${h.rank ? `الترتيب ${h.rank}/${h.ranked}` : 'الترتيب'}</a>
                      </div>
                      <div class="habit-stats small">السلسلة: <b>${h.streak}</b> 🔥 | الإجمالي: <b>${h.percent}%</b> (${h.done}/${h.total} يوم)</div>
                      ${h.description ? `<p class="muted small">${esc(h.description)}</p>` : ''}
                      <div class="days">${h.week
                        .map(
                          (d, i) => `<button type="button" class="day ${d.done ? 'done' : ''} ${d.date === data.today ? 'today' : ''}"
                            data-date="${d.date}" ${d.editable ? '' : 'disabled'} aria-pressed="${d.done}" title="${fmtDate(d.date)}">
                            <span>${WEEK_DAYS[i]}</span>${d.date === data.today ? '<small>اليوم</small>' : ''}</button>`
                        )
                        .join('')}</div>
                    </div>`
                  )
                  .join('')}
              </section>`
            )
            .join('')
        : `<div class="card muted">لا توجد تحديات مفتوحة حاليًا${state.user.role === 'admin' ? ' لك. <a href="#/challenges">إضافة تحدٍّ</a>' : '.'}</div>`
    }`;
  const go = (n) => {
    sessionStorage.setItem('habitsWeek', shiftDate(data.week_start, n));
    viewHabits(el);
  };
  $('#hb-prev').addEventListener('click', () => go(-7));
  $('#hb-next').addEventListener('click', () => go(7));
  el.querySelectorAll('.habit .day').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const card = btn.closest('.habit');
      const done = !btn.classList.contains('done');
      btn.disabled = true;
      try {
        await api('POST', '/api/habits/check', {
          challenge_id: Number(card.dataset.c),
          student_id: Number(card.dataset.s) || undefined,
          date: btn.dataset.date,
          done,
        });
        if (done) toast('بارك الله فيك 👏');
        await viewHabits(el);
      } catch (err) {
        btn.disabled = false;
        toast(err.message, true);
      }
    })
  );
}

// ---------- الترتيب ----------
async function viewLeaderboard(el, id) {
  const { challenges } = await api('GET', '/api/challenges');
  const open = challenges.filter((c) => c.active);
  if (!id) {
    el.innerHTML = `
      <h2>🏆 الترتيب</h2>
      ${
        open.length
          ? `<div class="cards">${open
              .map(
                (c) => `<a class="card course" href="#/leaderboard/${c.id}">
                  <h3>${esc(c.icon || '⭐')} ${esc(c.title)}</h3>
                  <p class="muted small">${c.participants} مشارك</p>
                  <ol class="podium">${c.top
                    .filter((t) => t.done)
                    .map((t) => `<li><span>${medal(t.rank)}</span> ${esc(t.name)} <b>${t.done}</b> يوم</li>`)
                    .join('') || '<li class="muted small">لم يسجّل أحد بعد</li>'}</ol>
                </a>`
              )
              .join('')}</div>`
          : '<div class="card muted">لا توجد تحديات مفتوحة.</div>'
      }`;
    return;
  }
  const period = sessionStorage.getItem('lbPeriod') || 'week';
  const lb = await api('GET', `/api/challenges/${id}/leaderboard?period=${period}`);
  const c = lb.challenge;
  el.innerHTML = `
    <a href="#/leaderboard" class="muted small">→ كل التحديات</a>
    <div class="page-head">
      <h2>🏆 ${esc(c.icon || '')} ${esc(c.title)}</h2>
      ${state.user.role === 'admin' ? `<a class="btn ghost" href="#/challenges/${c.id}">🔍 التفاصيل الكاملة</a>` : ''}
    </div>
    <div class="filters">
      <select id="lb-c">${open.map((x) => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select>
      <div class="chips">${Object.entries(PERIOD_LABELS)
        .map(([k, v]) => `<button type="button" class="chip ${k === period ? 'on' : ''}" data-p="${k}">${v}</button>`)
        .join('')}</div>
    </div>
    <p class="muted small">من ${fmtDate(lb.from)} إلى ${fmtDate(lb.to)} — الترتيب حسب عدد الأيام المنجزة ثم أطول سلسلة.</p>
    ${
      lb.rows.length
        ? `<div class="table-wrap"><table class="leaderboard">
            <thead><tr><th>#</th><th>الاسم</th><th>الأيام</th><th>النسبة</th><th>السلسلة</th></tr></thead>
            <tbody>${lb.rows
              .map(
                (r) => `<tr class="${r.mine ? 'mine' : ''} ${r.rank <= 3 && r.done ? 'top' : ''}">
                  <td class="rank">${r.done ? medal(r.rank) : r.rank}</td>
                  <td><b>${esc(r.name)}</b>${r.mine ? ' <span class="badge good">أنا</span>' : ''}</td>
                  <td><b>${r.done}</b><span class="muted small">/${r.total}</span></td>
                  <td><div class="bar"><span style="width:${r.percent}%"></span></div><span class="small">${r.percent}%</span></td>
                  <td>${r.streak ? `${r.streak} 🔥` : '—'}</td>
                </tr>`
              )
              .join('')}</tbody></table></div>`
        : '<div class="card muted">لا يوجد مشاركون بعد.</div>'
    }`;
  $('#lb-c')?.addEventListener('change', (e) => (location.hash = `#/leaderboard/${e.target.value}`));
  el.querySelectorAll('.chip[data-p]').forEach((b) =>
    b.addEventListener('click', () => {
      sessionStorage.setItem('lbPeriod', b.dataset.p);
      viewLeaderboard(el, id);
    })
  );
}

// ---------- إدارة التحديات (الإدارة) ----------
async function viewChallenges(el) {
  const { challenges } = await api('GET', '/api/challenges');
  el.innerHTML = `
    <div class="page-head">
      <h2>🎯 التحديات</h2>
      <div class="actions"><button class="btn" id="ch-add">+ تحدٍّ جديد</button></div>
    </div>
    <p class="muted">كل تحدٍّ عادة يومية (الصلاة، ورد القرآن، الأذكار…): الولي يسجّل أيام ابنه، والمعلم يسجّل أيامه، والجميع يرى الترتيب. أنتم ترون كل التفاصيل.</p>
    ${
      challenges.length
        ? `<div class="table-wrap"><table>
            <thead><tr><th>التحدي</th><th>المشاركون</th><th>الفترة</th><th>الأوائل</th><th></th></tr></thead>
            <tbody>${challenges
              .map(
                (c) => `<tr class="${c.active ? '' : 'off'}">
                  <td><a href="#/challenges/${c.id}"><b>${esc(c.icon || '⭐')} ${esc(c.title)}</b></a>
                    ${c.active ? '' : ' <span class="badge status-left">متوقف</span>'}</td>
                  <td>${esc(AUDIENCE_LABELS[c.audience])}<div class="muted small">${c.participants} مشارك · ${c.logs} يوم مسجّل</div></td>
                  <td class="small">${fmtDate(c.start_date)}${c.end_date ? ` ← ${fmtDate(c.end_date)}` : ' ← مفتوح'}</td>
                  <td class="small">${c.top.filter((t) => t.done).map((t) => `${medal(t.rank)} ${esc(t.name)} (${t.done})`).join('<br>') || '—'}</td>
                  <td class="nowrap">
                    <a class="btn ghost small" href="#/challenges/${c.id}">التفاصيل</a>
                    <button class="btn ghost small" data-edit="${c.id}">تعديل</button>
                    <button class="btn danger small" data-del="${c.id}">حذف</button>
                  </td>
                </tr>`
              )
              .join('')}</tbody></table></div>`
        : `<div class="card muted">لا توجد تحديات بعد. أمثلة: صلاة الصبح في المسجد، ورد القرآن، أذكار الصباح والمساء، رياضة، القسم اليومي.</div>`
    }`;
  const reload = () => viewChallenges(el);
  const form = (c) =>
    openModal(
      c ? 'تعديل التحدي' : 'تحدٍّ جديد',
      `<div class="row">
         <label>الرمز<input name="icon" value="${esc(c?.icon || '')}" placeholder="🕌" maxlength="8"></label>
         <label>العنوان<input name="title" value="${esc(c?.title || '')}" placeholder="صلاة الصبح في المسجد" required></label>
       </div>
       <label>الوصف<textarea name="description" rows="2" placeholder="متى يُعتبر اليوم منجزًا؟">${esc(c?.description || '')}</textarea></label>
       <label>المشاركون<select name="audience">${Object.entries(AUDIENCE_LABELS)
         .map(([k, v]) => `<option value="${k}" ${(c?.audience || 'students') === k ? 'selected' : ''}>${v}</option>`)
         .join('')}</select></label>
       <div class="row">
         <label>البداية<input type="date" name="start_date" value="${esc(c?.start_date || today())}" required></label>
         <label>النهاية (اختياري)<input type="date" name="end_date" value="${esc(c?.end_date || '')}"></label>
       </div>
       <label class="check"><input type="checkbox" name="active" ${!c || c.active ? 'checked' : ''}> مفتوح (يظهر للجميع)</label>`,
      async (data) => {
        if (c) await api('PUT', `/api/challenges/${c.id}`, data);
        else await api('POST', '/api/challenges', data);
        toast('تم الحفظ');
        reload();
      }
    );
  $('#ch-add').addEventListener('click', () => form());
  el.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => form(challenges.find((c) => c.id === Number(b.dataset.edit))))
  );
  el.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirmAction('حذف التحدي وكل الأيام المسجّلة فيه؟')) return;
      await api('DELETE', `/api/challenges/${b.dataset.del}`);
      reload();
    })
  );
}

// ---------- تفاصيل تحدٍّ: كل مشارك وكل يوم، من سجّل ومتى ----------
async function viewChallengeDetails(el, id) {
  const month = sessionStorage.getItem('chMonth') || today().slice(0, 7);
  const d = await api('GET', `/api/challenges/${id}/details?month=${month}`);
  const c = d.challenge;
  const now = today();
  el.innerHTML = `
    <a href="#/challenges" class="muted small">→ كل التحديات</a>
    <div class="page-head">
      <h2>🔍 ${esc(c.icon || '')} ${esc(c.title)}</h2>
      <div class="actions"><input type="month" id="ch-month" value="${month}"><a class="btn ghost" href="#/leaderboard/${c.id}">🏆 الترتيب</a></div>
    </div>
    <p class="muted small">${esc(AUDIENCE_LABELS[c.audience])} · من ${fmtDate(c.start_date)}${c.end_date ? ` إلى ${fmtDate(c.end_date)}` : ''}${
      c.description ? ` · ${esc(c.description)}` : ''
    }</p>
    <div class="stats compact">
      <div class="stat"><b>${d.rows.length}</b><span>مشارك</span></div>
      <div class="stat good"><b>${d.rows.filter((r) => r.month_done).length}</b><span>سجّل هذا الشهر</span></div>
      <div class="stat warn"><b>${d.rows.filter((r) => !r.done).length}</b><span>لم يسجّل أبدًا</span></div>
      <div class="stat"><b>${d.rows.length ? Math.round(d.rows.reduce((t, r) => t + r.percent, 0) / d.rows.length) : 0}%</b><span>متوسط المواظبة</span></div>
    </div>
    <p class="muted small">✔ = يوم منجز (مرّر الفأرة أو اضغط لترى من سجّله ومتى). اضغط على خانة لتسجيل اليوم أو إلغائه.</p>
    <div class="table-wrap"><table class="habit-grid">
      <thead><tr><th>#</th><th>الاسم</th>${d.days.map((x) => `<th class="${x === now ? 'today' : ''}">${Number(x.slice(8))}</th>`).join('')}
        <th>الشهر</th><th>الإجمالي</th><th>السلسلة</th></tr></thead>
      <tbody>${d.rows
        .map(
          (r) => `<tr>
            <td>${r.done ? medal(r.rank) : r.rank}</td>
            <td class="nowrap">${r.student_id ? `<a href="#/students/${r.student_id}">${esc(r.name)}</a>` : esc(r.name)}</td>
            ${d.days
              .map((x) => {
                const log = r.logs[x];
                const out = x > now || x < c.start_date || (c.end_date && x > c.end_date);
                const tip = log ? `سجّله ${log.by || '—'}${log.by_role ? ` (${ROLE_LABELS[log.by_role]})` : ''} في ${log.at}` : fmtDate(x);
                return `<td class="cell ${log ? 'done' : ''} ${out ? 'out' : ''}" title="${esc(tip)}" ${out ? '' : `data-k="${r.key}" data-d="${x}"`}>${log ? '✔' : ''}</td>`;
              })
              .join('')}
            <td><b>${r.month_done}</b></td><td>${r.done}/${r.total} <span class="muted small">${r.percent}%</span></td>
            <td>${r.streak ? `${r.streak} 🔥` : '—'}</td>
          </tr>`
        )
        .join('')}</tbody></table></div>`;
  $('#ch-month').addEventListener('change', (e) => {
    sessionStorage.setItem('chMonth', e.target.value);
    viewChallengeDetails(el, id);
  });
  el.querySelectorAll('td.cell[data-k]').forEach((td) =>
    td.addEventListener('click', async () => {
      const r = d.rows.find((x) => x.key === td.dataset.k);
      const log = r.logs[td.dataset.d];
      if (!confirmAction(log ? `إلغاء يوم ${fmtDate(td.dataset.d)} لـ ${r.name}؟\n${td.title}` : `تسجيل يوم ${fmtDate(td.dataset.d)} منجزًا لـ ${r.name}؟`)) return;
      try {
        await api('POST', '/api/habits/check', {
          challenge_id: c.id, student_id: r.student_id || undefined, user_id: r.user_id || undefined, date: td.dataset.d, done: !log,
        });
        viewChallengeDetails(el, id);
      } catch (err) {
        toast(err.message, true);
      }
    })
  );
}
