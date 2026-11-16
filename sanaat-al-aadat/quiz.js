'use strict';
// الأسئلة التفاعلية (على طريقة H5P): اختيار من متعدد، صحيح/خطأ، ربط بسهم، ترتيب، سحب الكلمات، ملء الفراغ، تحديد الكلمات
// كل سؤال يُصحَّح وحده وله نتيجة بين 0 و1؛ نتيجة التحدّي = المتوسط، والنقاط = نقاط المهمة × النتيجة

const QTYPES = {
  mcq: { icon: '🔘', name: 'اختيار من متعدد' },
  tf: { icon: '⚖️', name: 'صحيح أم خطأ' },
  match: { icon: '🔗', name: 'اربط بسهم' },
  order: { icon: '↕️', name: 'رتّب' },
  drag: { icon: '🧩', name: 'اسحب الكلمات' },
  blank: { icon: '✍️', name: 'املأ الفراغ' },
  mark: { icon: '🖍️', name: 'حدّد الكلمات' },
};

// توحيد الكتابة العربية للمقارنة: دون تشكيل، الألف والتاء المربوطة والياء
const norm = (s) => String(s || '').replace(/[ً-ْٰـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/\s+/g, ' ').trim().toLowerCase();
const shuffle = (arr, seed = 1) => {
  // خلط ثابت (نفس الترتيب عند إعادة الرسم)
  const a = arr.map((x, i) => [x, i]);
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor((s / 233280) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  // لا نعرض الترتيب الصحيح نفسه
  if (a.length > 1 && a.every(([, i], k) => i === k)) a.push(a.shift());
  return a;
};
// نص فيه *كلمات* بين نجمتين: أجزاء عادية وفراغات
function parseStars(text) {
  const parts = [];
  String(text || '').split(/(\*[^*]+\*)/).forEach((p) => {
    if (/^\*[^*]+\*$/.test(p)) parts.push({ blank: true, answers: p.slice(1, -1).split('|').map((x) => x.trim()).filter(Boolean) });
    else if (p) parts.push({ text: p });
  });
  return parts;
}
const blanksOf = (text) => parseStars(text).filter((p) => p.blank);

// ---------- اللاعب ----------
// S.qz = { cid, i, seed, cur (إجابة السؤال الحالي), checked, scores: [] }
function quizQuestions(c) { return (c.meta?.questions || []).filter((q) => QTYPES[q.t]); }

function startQuiz(c) {
  S.qz = { cid: c.id, i: 0, seed: (Number(S.memberId) * 31 + c.id) % 997 || 7, cur: null, checked: false, scores: [] };
  drawQuiz();
}

function quizHtml(c) {
  const qs = quizQuestions(c);
  const z = S.qz;
  if (z.i >= qs.length) return quizEnd(c, qs);
  const q = qs[z.i];
  const dots = qs.map((_, k) => `<span class="qd ${k < z.i ? (z.scores[k] >= 1 ? 'ok' : z.scores[k] > 0 ? 'half' : 'ko') : k === z.i ? 'cur' : ''}"></span>`).join('');
  return `<div class="qz-top"><span class="qz-type">${QTYPES[q.t].icon} ${QTYPES[q.t].name}</span><span class="qz-n">${z.i + 1} / ${qs.length}</span></div>
    <div class="qz-dots">${dots}</div>
    ${q.q ? `<h3 class="qz-q">${esc(q.q)}</h3>` : ''}
    <div class="qz-body">${QRENDER[q.t](q, z)}</div>
    ${z.checked ? `<div class="qz-fb ${z.scores[z.i] >= 1 ? 'ok' : z.scores[z.i] > 0 ? 'half' : 'ko'}">${
      z.scores[z.i] >= 1 ? '✅ إجابة صحيحة، أحسنت!' : z.scores[z.i] > 0 ? `🟡 صحيحة جزئيًا (${Math.round(z.scores[z.i] * 100)}%)` : '❌ ليست صحيحة'}</div>
      <button class="btn big" type="button" data-qz-next>${z.i + 1 < qs.length ? 'السؤال التالي ←' : 'النتيجة 🏁'}</button>`
      : `<button class="btn big yellow" type="button" data-qz-check ${QREADY[q.t](q, z) ? '' : 'disabled'}>تحقّق</button>`}`;
}

function quizEnd(c, qs) {
  const score = qs.length ? S.qz.scores.reduce((a, b) => a + b, 0) / qs.length : 0;
  const pct = Math.round(score * 100);
  const stars = pct >= 90 ? 3 : pct >= 60 ? 2 : pct > 0 ? 1 : 0;
  const pts = Math.round((c.points ?? 1) * score);
  S.qz.final = score;
  return `<div class="qz-end">
    <div class="qz-stars">${[1, 2, 3].map((k) => `<span class="${k <= stars ? 'on' : ''}">★</span>`).join('')}</div>
    <h2>${pct >= 90 ? 'ممتاز! ما شاء الله' : pct >= 60 ? 'أحسنت!' : pct > 0 ? 'محاولة جيدة' : 'لا بأس، تعلّمنا اليوم'}</h2>
    <div class="qz-score"><b>${pct}%</b><small>${S.qz.scores.filter((s) => s >= 1).length} من ${qs.length} صحيحة</small></div>
    <button class="btn big yellow" type="button" data-qz-save>🎉 سجّل النتيجة (+${pts} نقطة)</button>
  </div>`;
}

function drawQuiz() {
  const box = $('#quiz-box');
  const c = S.challenges.find((x) => x.id === S.qz?.cid);
  if (!box || !c) return;
  box.innerHTML = quizHtml(c);
  const qs = quizQuestions(c);
  const q = qs[S.qz.i];
  if (q && QBIND[q.t]) QBIND[q.t](box, q, S.qz);
  box.querySelector('[data-qz-check]')?.addEventListener('click', () => {
    S.qz.scores[S.qz.i] = Math.max(0, Math.min(1, QSCORE[q.t](q, S.qz)));
    S.qz.checked = true;
    if (S.qz.scores[S.qz.i] >= 1) { FX.chime(); FX.buzz(); } else FX.buzz([60, 40, 60]);
    drawQuiz();
  });
  box.querySelector('[data-qz-next]')?.addEventListener('click', () => {
    S.qz.i++; S.qz.cur = null; S.qz.checked = false;
    drawQuiz();
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  box.querySelector('[data-qz-save]')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    await completeOnce(c, { value: Math.round(S.qz.final * 1000) / 1000, payload: { score: S.qz.final, answers: S.qz.scores } });
  });
  if (q?.t === 'match') requestAnimationFrame(() => drawLines(box, q, S.qz));
}
addEventListener('resize', () => { if (S.qz && $('#quiz-box') && !S.qz.checked) drawQuiz(); });

// سحب عام بالإصبع أو الفأرة: ينادي onDrop(العنصر تحت المؤشّر) أو onTap عند نقرة دون حركة
function draggable(el, { onTap, onDrop, onMove }) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const sx = e.clientX, sy = e.clientY;
    let ghost = null;
    const move = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 7) return;
      if (!ghost) {
        ghost = el.cloneNode(true);
        ghost.classList.add('drag-ghost');
        const r = el.getBoundingClientRect();
        ghost.style.width = r.width + 'px';
        document.body.appendChild(ghost);
        el.classList.add('dragging');
      }
      ghost.style.left = ev.clientX + 'px';
      ghost.style.top = ev.clientY + 'px';
      onMove?.(ev);
      ev.preventDefault();
    };
    const up = (ev) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      el.classList.remove('dragging');
      if (!ghost) return onTap?.();
      ghost.remove();
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      onDrop?.(target, ev);
    };
    addEventListener('pointermove', move, { passive: false });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  });
}

const QRENDER = {}, QBIND = {}, QSCORE = {}, QREADY = {};

// اختيار من متعدد (إجابة أو عدّة إجابات)
QRENDER.mcq = (q, z) => {
  const multi = (q.answer || []).length > 1;
  const sel = z.cur || [];
  return `${multi ? '<p class="qz-hint">اختر كل الإجابات الصحيحة</p>' : ''}<div class="choices">${q.choices
    .map((t, i) => {
      const on = sel.includes(i);
      const cls = z.checked ? (q.answer.includes(i) ? 'right' : on ? 'wrong' : '') : on ? 'picked' : '';
      return `<button class="choice ${cls}" type="button" data-ch="${i}" ${z.checked ? 'disabled' : ''}><span class="ch-box">${multi ? (on ? '☑' : '☐') : on ? '◉' : '○'}</span>${esc(t)}</button>`;
    }).join('')}</div>`;
};
QBIND.mcq = (box, q, z) => box.querySelectorAll('[data-ch]').forEach((b) => b.addEventListener('click', () => {
  const i = Number(b.dataset.ch);
  const multi = q.answer.length > 1;
  const sel = new Set(z.cur || []);
  if (multi) sel.has(i) ? sel.delete(i) : sel.add(i); else { sel.clear(); sel.add(i); }
  z.cur = [...sel];
  drawQuiz();
}));
QREADY.mcq = (q, z) => (z.cur || []).length > 0;
QSCORE.mcq = (q, z) => {
  const sel = new Set(z.cur || []);
  const ans = new Set(q.answer);
  if (ans.size === 1) return ans.has([...sel][0]) ? 1 : 0;
  let good = 0, bad = 0;
  sel.forEach((i) => (ans.has(i) ? good++ : bad++));
  return Math.max(0, (good - bad) / ans.size);
};

// صحيح أم خطأ
QRENDER.tf = (q, z) => `<div class="tf">${[[true, '✓ صحيح'], [false, '✗ خطأ']]
  .map(([v, t]) => {
    const on = z.cur === v;
    const cls = z.checked ? (q.answer === v ? 'right' : on ? 'wrong' : '') : on ? 'picked' : '';
    return `<button class="choice tf-b ${v ? 'yes' : 'no'} ${cls}" type="button" data-tf="${v}" ${z.checked ? 'disabled' : ''}>${t}</button>`;
  }).join('')}</div>`;
QBIND.tf = (box, q, z) => box.querySelectorAll('[data-tf]').forEach((b) => b.addEventListener('click', () => { z.cur = b.dataset.tf === 'true'; drawQuiz(); }));
QREADY.tf = (q, z) => typeof z.cur === 'boolean';
QSCORE.tf = (q, z) => (z.cur === q.answer ? 1 : 0);

// اربط بسهم: اسحب من نقطة اليمين إلى عنصر اليسار، أو اضغط على الاثنين
QRENDER.match = (q, z) => {
  const links = z.cur || {};
  const right = shuffle(q.pairs.map((p) => p[1]), z.seed + z.i);
  const used = new Set(Object.values(links));
  return `<p class="qz-hint">اسحب من كل عنصر إلى ما يناسبه (أو اضغط على الاثنين)</p>
  <div class="match" data-match>
    <svg class="match-lines" aria-hidden="true"><defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs></svg>
    <div class="m-col">${q.pairs.map((p, i) => {
      const linked = links[i] !== undefined;
      const ok = z.checked && linked && right[links[i]][1] === i;
      return `<button type="button" class="m-item m-a ${linked ? 'linked' : ''} ${z.sel === i ? 'sel' : ''} ${z.checked ? (ok ? 'right' : 'wrong') : ''}" data-ma="${i}" ${z.checked ? 'disabled' : ''}>
        <span>${esc(p[0])}</span><i class="m-dot"></i></button>`;
    }).join('')}</div>
    <div class="m-col">${right.map(([t], j) => `<button type="button" class="m-item m-b ${used.has(j) ? 'linked' : ''}" data-mb="${j}" ${z.checked ? 'disabled' : ''}>
        <i class="m-dot"></i><span>${esc(t)}</span></button>`).join('')}</div>
  </div>
  ${z.checked && QSCORE.match(q, z) < 1 ? `<div class="qz-solution"><b>الحلّ:</b> ${q.pairs.map((p) => `${esc(p[0])} ← ${esc(p[1])}`).join(' · ')}</div>` : ''}`;
};
QBIND.match = (box, q, z) => {
  const right = shuffle(q.pairs.map((p) => p[1]), z.seed + z.i);
  const link = (i, j) => {
    const links = { ...(z.cur || {}) };
    for (const k of Object.keys(links)) if (links[k] === j) delete links[k];
    links[i] = j;
    z.cur = links;
    z.sel = null;
    FX.buzz(15);
    drawQuiz();
  };
  box.querySelectorAll('[data-ma]').forEach((b) => {
    const i = Number(b.dataset.ma);
    const svgEl = box.querySelector('.match-lines');
    let temp = null;
    draggable(b, {
      onTap: () => {
        if (z.cur?.[i] !== undefined) { const l = { ...z.cur }; delete l[i]; z.cur = l; z.sel = null; return drawQuiz(); }
        z.sel = z.sel === i ? null : i;
        drawQuiz();
      },
      onMove: (ev) => {
        const host = box.querySelector('[data-match]').getBoundingClientRect();
        const dot = b.querySelector('.m-dot').getBoundingClientRect();
        if (!temp) { temp = document.createElementNS('http://www.w3.org/2000/svg', 'line'); temp.setAttribute('class', 'tmp'); svgEl.appendChild(temp); }
        temp.setAttribute('x1', dot.left + dot.width / 2 - host.left);
        temp.setAttribute('y1', dot.top + dot.height / 2 - host.top);
        temp.setAttribute('x2', ev.clientX - host.left);
        temp.setAttribute('y2', ev.clientY - host.top);
      },
      onDrop: (target) => {
        temp?.remove(); temp = null;
        const t = target?.closest?.('[data-mb]');
        if (t) link(i, Number(t.dataset.mb));
      },
    });
  });
  box.querySelectorAll('[data-mb]').forEach((b) => b.addEventListener('click', () => {
    if (z.sel !== null && z.sel !== undefined) link(z.sel, Number(b.dataset.mb));
  }));
  void right;
};
function drawLines(box, q, z) {
  const host = box.querySelector('[data-match]');
  const svgEl = box.querySelector('.match-lines');
  if (!host || !svgEl) return;
  const hr = host.getBoundingClientRect();
  svgEl.setAttribute('viewBox', `0 0 ${hr.width} ${hr.height}`);
  svgEl.querySelectorAll('line').forEach((l) => l.remove());
  const right = shuffle(q.pairs.map((p) => p[1]), z.seed + z.i);
  for (const [i, j] of Object.entries(z.cur || {})) {
    const a = box.querySelector(`[data-ma="${i}"] .m-dot`)?.getBoundingClientRect();
    const b = box.querySelector(`[data-mb="${j}"] .m-dot`)?.getBoundingClientRect();
    if (!a || !b) continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', a.left + a.width / 2 - hr.left);
    line.setAttribute('y1', a.top + a.height / 2 - hr.top);
    line.setAttribute('x2', b.left + b.width / 2 - hr.left);
    line.setAttribute('y2', b.top + b.height / 2 - hr.top);
    line.setAttribute('marker-end', 'url(#arr)');
    if (z.checked) line.setAttribute('class', right[j][1] === Number(i) ? 'ok' : 'ko');
    svgEl.appendChild(line);
  }
}
QREADY.match = (q, z) => Object.keys(z.cur || {}).length === q.pairs.length;
QSCORE.match = (q, z) => {
  const right = shuffle(q.pairs.map((p) => p[1]), z.seed + z.i);
  return Object.entries(z.cur || {}).filter(([i, j]) => right[j][1] === Number(i)).length / q.pairs.length;
};

// رتّب: اسحب العناصر أو استعمل الأسهم
QRENDER.order = (q, z) => {
  z.cur ??= shuffle(q.items, z.seed + z.i).map(([, i]) => i);
  return `<p class="qz-hint">اسحب لترتيب العناصر من الأول إلى الأخير</p><ol class="order">${z.cur
    .map((i, pos) => `<li class="o-item ${z.checked ? (i === pos ? 'right' : 'wrong') : ''}" data-oi="${pos}">
      <span class="o-handle" aria-hidden="true">⋮⋮</span><b>${pos + 1}</b><span class="o-t">${esc(q.items[i])}</span>
      ${z.checked ? '' : `<span class="o-btns"><button type="button" data-up="${pos}" ${pos ? '' : 'disabled'} aria-label="أعلى">▲</button><button type="button" data-down="${pos}" ${pos < z.cur.length - 1 ? '' : 'disabled'} aria-label="أسفل">▼</button></span>`}
    </li>`).join('')}</ol>
    ${z.checked && QSCORE.order(q, z) < 1 ? `<div class="qz-solution"><b>الترتيب الصحيح:</b> ${q.items.map((t, k) => `${k + 1}. ${esc(t)}`).join(' · ')}</div>` : ''}`;
};
QBIND.order = (box, q, z) => {
  const moveTo = (from, to) => { const a = [...z.cur]; const [x] = a.splice(from, 1); a.splice(to, 0, x); z.cur = a; FX.buzz(10); drawQuiz(); };
  box.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => moveTo(Number(b.dataset.up), Number(b.dataset.up) - 1)));
  box.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => moveTo(Number(b.dataset.down), Number(b.dataset.down) + 1)));
  if (z.checked) return;
  box.querySelectorAll('.o-item').forEach((li) => draggable(li, {
    onDrop: (t) => { const to = t?.closest?.('.o-item'); if (to) moveTo(Number(li.dataset.oi), Number(to.dataset.oi)); },
  }));
};
QREADY.order = () => true;
QSCORE.order = (q, z) => (z.cur || []).filter((i, pos) => i === pos).length / q.items.length;

// اسحب الكلمات إلى الفراغات
QRENDER.drag = (q, z) => {
  const parts = parseStars(q.text);
  const blanks = parts.filter((p) => p.blank);
  const bank = shuffle([...blanks.map((b) => b.answers[0]), ...(q.extra || [])], z.seed + z.i);
  const filled = z.cur || {};
  const used = new Set(Object.values(filled));
  let k = -1;
  return `<p class="qz-hint">اسحب كل كلمة إلى مكانها (أو اضغط على الكلمة ثم على الفراغ)</p>
  <div class="dz-text">${parts.map((p) => {
    if (!p.blank) return esc(p.text);
    k++;
    const w = filled[k];
    const ok = z.checked && w !== undefined && norm(bank[w][0]) === norm(p.answers[0]);
    return `<button type="button" class="dz ${w !== undefined ? 'full' : ''} ${z.checked ? (ok ? 'right' : 'wrong') : ''}" data-dz="${k}" ${z.checked ? 'disabled' : ''}>${w !== undefined ? esc(bank[w][0]) : '&nbsp;'}</button>`;
  }).join('')}</div>
  ${z.checked ? (QSCORE.drag(q, z) < 1 ? `<div class="qz-solution"><b>الحلّ:</b> ${blanks.map((b) => esc(b.answers[0])).join('، ')}</div>` : '')
    : `<div class="bank">${bank.map(([t], j) => `<button type="button" class="word ${used.has(j) ? 'used' : ''} ${z.pick === j ? 'sel' : ''}" data-w="${j}" ${used.has(j) ? 'disabled' : ''}>${esc(t)}</button>`).join('')}</div>`}`;
};
QBIND.drag = (box, q, z) => {
  const put = (k, j) => {
    const f = { ...(z.cur || {}) };
    for (const x of Object.keys(f)) if (f[x] === j) delete f[x];
    f[k] = j;
    z.cur = f; z.pick = null; FX.buzz(12);
    drawQuiz();
  };
  box.querySelectorAll('[data-w]').forEach((b) => draggable(b, {
    onTap: () => { z.pick = z.pick === Number(b.dataset.w) ? null : Number(b.dataset.w); drawQuiz(); },
    onDrop: (t) => { const dz = t?.closest?.('[data-dz]'); if (dz) put(Number(dz.dataset.dz), Number(b.dataset.w)); },
  }));
  box.querySelectorAll('[data-dz]').forEach((b) => b.addEventListener('click', () => {
    const k = Number(b.dataset.dz);
    if (z.pick !== null && z.pick !== undefined) return put(k, z.pick);
    if (z.cur?.[k] !== undefined) { const f = { ...z.cur }; delete f[k]; z.cur = f; drawQuiz(); }
  }));
};
QREADY.drag = (q, z) => Object.keys(z.cur || {}).length === blanksOf(q.text).length;
QSCORE.drag = (q, z) => {
  const blanks = blanksOf(q.text);
  const bank = shuffle([...blanks.map((b) => b.answers[0]), ...(q.extra || [])], z.seed + z.i);
  return blanks.filter((b, k) => z.cur?.[k] !== undefined && norm(bank[z.cur[k]][0]) === norm(b.answers[0])).length / blanks.length;
};

// املأ الفراغ بالكتابة (عدّة إجابات مقبولة: *أ|ب*)
QRENDER.blank = (q, z) => {
  const vals = z.cur || {};
  let k = -1;
  return `<p class="qz-hint">اكتب الكلمة المناسبة في كل فراغ</p><div class="dz-text">${parseStars(q.text).map((p) => {
    if (!p.blank) return esc(p.text);
    k++;
    const v = vals[k] || '';
    const ok = z.checked && p.answers.some((a) => norm(a) === norm(v));
    return `<input class="bl ${z.checked ? (ok ? 'right' : 'wrong') : ''}" data-bl="${k}" value="${esc(v)}" size="${Math.max(4, p.answers[0].length + 1)}" ${z.checked ? 'disabled' : ''} autocomplete="off">${
      z.checked && !ok ? `<small class="bl-sol">${esc(p.answers[0])}</small>` : ''}`;
  }).join('')}</div>`;
};
QBIND.blank = (box, q, z) => box.querySelectorAll('[data-bl]').forEach((inp) => inp.addEventListener('input', () => {
  z.cur = { ...(z.cur || {}), [inp.dataset.bl]: inp.value };
  const btn = box.querySelector('[data-qz-check]');
  if (btn) btn.disabled = !QREADY.blank(q, z);
}));
QREADY.blank = (q, z) => blanksOf(q.text).every((_, k) => String(z.cur?.[k] || '').trim());
QSCORE.blank = (q, z) => {
  const b = blanksOf(q.text);
  return b.filter((p, k) => p.answers.some((a) => norm(a) === norm(z.cur?.[k]))).length / b.length;
};

// حدّد الكلمات الصحيحة في النص
function markTokens(text) {
  const out = [];
  parseStars(text).forEach((p) => {
    if (p.blank) out.push({ w: p.answers[0], good: true });
    else p.text.split(/(\s+)/).forEach((w) => out.push(/^\s*$/.test(w) ? { space: w } : { w, good: false }));
  });
  return out;
}
QRENDER.mark = (q, z) => {
  const sel = new Set(z.cur || []);
  return `<p class="qz-hint">اضغط على الكلمات المطلوبة</p><div class="mk-text">${markTokens(q.text).map((t, k) => {
    if (t.space !== undefined) return ' ';
    const on = sel.has(k);
    const cls = z.checked ? (t.good && on ? 'right' : t.good ? 'missed' : on ? 'wrong' : '') : on ? 'on' : '';
    return `<button type="button" class="mk ${cls}" data-mk="${k}" ${z.checked ? 'disabled' : ''}>${esc(t.w)}</button>`;
  }).join('')}</div>`;
};
QBIND.mark = (box, q, z) => box.querySelectorAll('[data-mk]').forEach((b) => b.addEventListener('click', () => {
  const s = new Set(z.cur || []);
  const k = Number(b.dataset.mk);
  s.has(k) ? s.delete(k) : s.add(k);
  z.cur = [...s];
  drawQuiz();
}));
QREADY.mark = (q, z) => (z.cur || []).length > 0;
QSCORE.mark = (q, z) => {
  const toks = markTokens(q.text);
  const goodN = toks.filter((t) => t.good).length || 1;
  let good = 0, bad = 0;
  (z.cur || []).forEach((k) => (toks[k]?.good ? good++ : bad++));
  return Math.max(0, (good - bad) / goodN);
};

// ---------- منشئ الأسئلة (المشرف) ----------
// كل سؤال يُحرَّر بحقول نصّية بسيطة، ويُحوَّل إلى الشكل المخزَّن عند الحفظ
function qToRaw(q) {
  switch (q.t) {
    case 'mcq': return { t: 'mcq', q: q.q || '', a: (q.choices || []).join('\n'), b: (q.answer || []).map((i) => i + 1).join('، ') };
    case 'tf': return { t: 'tf', q: q.q || '', b: q.answer === false ? 'false' : 'true' };
    case 'match': return { t: 'match', q: q.q || '', a: (q.pairs || []).map((p) => `${p[0]} = ${p[1]}`).join('\n') };
    case 'order': return { t: 'order', q: q.q || '', a: (q.items || []).join('\n') };
    case 'drag': return { t: 'drag', q: q.q || '', a: q.text || '', b: (q.extra || []).join('، ') };
    default: return { t: q.t, q: q.q || '', a: q.text || '' };
  }
}
function rawToQ(r) {
  const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const nums = (s) => String(s || '').split(/[,،\s]+/).map((x) => Number(String(x).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))) - 1).filter((x) => x >= 0);
  switch (r.t) {
    case 'mcq': return { t: 'mcq', q: r.q, choices: lines(r.a).slice(0, 8), answer: [...new Set(nums(r.b))] };
    case 'tf': return { t: 'tf', q: r.q, answer: r.b !== 'false' };
    case 'match': return { t: 'match', q: r.q, pairs: lines(r.a).map((l) => l.split('=').map((x) => x.trim())).filter((p) => p.length === 2 && p[0] && p[1]).slice(0, 8) };
    case 'order': return { t: 'order', q: r.q, items: lines(r.a).slice(0, 10) };
    case 'drag': return { t: 'drag', q: r.q, text: r.a.trim(), extra: String(r.b || '').split(/[,،]/).map((x) => x.trim()).filter(Boolean).slice(0, 8) };
    default: return { t: r.t, q: r.q, text: String(r.a || '').trim() };
  }
}
// خطأ في السؤال؟ (رسالة) أو null
function qProblem(q, n) {
  const p = `السؤال ${n}: `;
  if (q.t === 'mcq' && (q.choices.length < 2 || !q.answer.length || q.answer.some((i) => i >= q.choices.length))) return p + 'اختياران على الأقل ورقم إجابة صحيح.';
  if ((q.t === 'mcq' || q.t === 'tf') && !q.q) return p + 'اكتب السؤال.';
  if (q.t === 'match' && q.pairs.length < 2) return p + 'زوجان على الأقل بالشكل: يمين = يسار';
  if (q.t === 'order' && q.items.length < 2) return p + 'عنصران على الأقل.';
  if (['drag', 'blank', 'mark'].includes(q.t) && !blanksOf(q.text).length) return p + 'ضع الكلمات المطلوبة بين نجمتين *هكذا*.';
  return null;
}
const QHELP = {
  mcq: ['السؤال', 'الاختيارات (كل اختيار في سطر)', 'رقم الإجابة الصحيحة (أو عدّة أرقام: 1، 3)'],
  tf: ['العبارة', '', ''],
  match: ['التعليمة (اختياري)', 'الأزواج، كل زوج في سطر: الصبح = ركعتان', ''],
  order: ['التعليمة (اختياري)', 'العناصر بالترتيب الصحيح (كل عنصر في سطر)، وتُخلَط للمشارك', ''],
  drag: ['التعليمة (اختياري)', 'النص، والكلمات المطلوبة بين نجمتين: الصلاة *عماد* الدين', 'كلمات زائدة للتمويه (اختياري، بينها فاصلة)'],
  blank: ['التعليمة (اختياري)', 'النص، والإجابة بين نجمتين، وعدّة إجابات مقبولة بـ |: عدد الصلوات *خمس|5*', ''],
  mark: ['التعليمة، مثال: حدّد أسماء الأنبياء', 'النص، والكلمات الصحيحة بين نجمتين: جاء *موسى* إلى المدينة', ''],
};
function quizBuilder(raws) {
  return `<fieldset class="box"><legend>🧩 الأسئلة (${raws.length})</legend>
    ${raws.map((r, k) => `<div class="qb" data-qb="${k}">
      <div class="qb-head"><b>${k + 1}. ${QTYPES[r.t].icon} ${QTYPES[r.t].name}</b>
        <span class="row nowrap"><button type="button" class="icon-btn sm" data-qbup="${k}" ${k ? '' : 'disabled'} aria-label="أعلى">▲</button>
        <button type="button" class="btn danger small" data-qbdel="${k}">حذف</button></span></div>
      <label>${QHELP[r.t][0]}<input data-f="q" maxlength="300" value="${esc(r.q)}"></label>
      ${r.t === 'tf' ? `<label>الإجابة<select data-f="b"><option value="true" ${r.b !== 'false' ? 'selected' : ''}>✓ صحيح</option><option value="false" ${r.b === 'false' ? 'selected' : ''}>✗ خطأ</option></select></label>`
        : `<label>${QHELP[r.t][1]}<textarea data-f="a" rows="${r.t === 'mcq' || r.t === 'match' || r.t === 'order' ? 4 : 3}">${esc(r.a)}</textarea></label>`}
      ${QHELP[r.t][2] && r.t !== 'tf' ? `<label>${QHELP[r.t][2]}<input data-f="b" value="${esc(r.b || '')}"></label>` : ''}
    </div>`).join('')}
    <b class="small">+ أضف سؤالًا:</b>
    <div class="chips">${Object.entries(QTYPES).map(([k, t]) => `<button type="button" class="pill" data-qbadd="${k}">${t.icon} ${t.name}</button>`).join('')}</div>
  </fieldset>`;
}
// قراءة حقول المنشئ إلى S.editing.raws
function readBuilder() {
  const f = S.editing;
  if (!f?.raws) return;
  document.querySelectorAll('[data-qb]').forEach((el) => {
    const r = f.raws[Number(el.dataset.qb)];
    el.querySelectorAll('[data-f]').forEach((inp) => (r[inp.dataset.f] = inp.value));
  });
}
function bindBuilder(v) {
  v.querySelectorAll('[data-qbadd]').forEach((b) => b.addEventListener('click', () => {
    readForm();
    S.editing.raws.push({ t: b.dataset.qbadd, q: '', a: '', b: b.dataset.qbadd === 'tf' ? 'true' : '' });
    render();
  }));
  v.querySelectorAll('[data-qbdel]').forEach((b) => b.addEventListener('click', () => { readForm(); S.editing.raws.splice(Number(b.dataset.qbdel), 1); render(); }));
  v.querySelectorAll('[data-qbup]').forEach((b) => b.addEventListener('click', () => {
    readForm();
    const k = Number(b.dataset.qbup);
    const r = S.editing.raws;
    [r[k - 1], r[k]] = [r[k], r[k - 1]];
    render();
  }));
}
