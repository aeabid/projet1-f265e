'use strict';
// ركن الفوائد: «من الشيخ» (فوائد لكل المجموعة أو لكل الطلبة) و«ملاحظاتي» (ما يكتبه الطالب لنفسه)

const fmtWhen = (ts) => {
  const d = new Date(ts);
  return `${Q_DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};
// نص منسّق بسيط: «# عنوان»، «## عنوان فرعي»، «- نقطة»، «> اقتباس»، **عريض**، والروابط
function richText(src) {
  const inline = (t) =>
    esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const out = [];
  let list = null;
  const flush = () => {
    if (list) out.push(`<ul>${list.join('')}</ul>`);
    list = null;
  };
  for (const raw of String(src || '').split('\n')) {
    const line = raw.trim();
    let m;
    if ((m = /^[-•*]\s+(.*)$/.exec(line))) {
      (list ||= []).push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    flush();
    if (!line) out.push('<div class="rt-gap"></div>');
    else if ((m = /^##\s+(.*)$/.exec(line))) out.push(`<h5 class="rt-h2">${inline(m[1])}</h5>`);
    else if ((m = /^#\s+(.*)$/.exec(line))) out.push(`<h4 class="rt-h1">${inline(m[1])}</h4>`);
    else if ((m = /^>\s?(.*)$/.exec(line))) out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    else out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join('');
}
// تصغير صورة قبل الرفع (أطول ضلع 1280 بكسل، JPEG)
function shrinkImage(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('تعذّرت قراءة الصورة'));
    img.src = URL.createObjectURL(file);
  });
}
const ytBox = (id) => `<button type="button" class="yt" data-yt="${esc(id)}" aria-label="تشغيل الفيديو">
    <img src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" alt="" loading="lazy"><span class="yt-play">▶</span></button>`;
// ---------- البحث بالكلمات المفتاحية ----------
// تطبيع النص مع خريطة المواضع (لتلوين الكلمة في النص الأصلي)
function arNorm(str) {
  let n = '';
  const map = [];
  for (let i = 0; i < str.length; i++) {
    let c = str[i];
    if (/[ً-ْٰـ]/.test(c)) continue; // التشكيل والتطويل
    c = c.replace(/[أإآٱ]/, 'ا').replace('ى', 'ي').replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي').toLowerCase();
    n += c;
    map.push(i);
  }
  return { n, map };
}
const searchWords = (q) => arNorm(String(q || '').trim()).n.split(/\s+/).filter(Boolean);
const plainBody = (b) => String(b.body || '').split('\n').map((l) => l.replace(/^\s*(#{1,2}|[-•*]|>)\s+/, '').replace(/\*\*/g, '')).join(' ').replace(/\s+/g, ' ').trim();
// تلوين الكلمات المطابقة
function hl(text, words) {
  const str = String(text || '');
  if (!words?.length) return esc(str);
  const { n, map } = arNorm(str);
  const ranges = [];
  for (const w of words) for (let i = n.indexOf(w); i !== -1; i = n.indexOf(w, i + 1)) ranges.push([map[i], map[i + w.length - 1] + 1]);
  if (!ranges.length) return esc(str);
  ranges.sort((a, b) => a[0] - b[0]);
  let out = '';
  let at = 0;
  for (const [a, z] of ranges) {
    if (a < at) continue;
    out += esc(str.slice(at, a)) + `<mark>${esc(str.slice(a, z))}</mark>`;
    at = z;
  }
  return out + esc(str.slice(at));
}
// مقتطف من النص حول أول كلمة مطابقة
function snippet(text, words) {
  const { n, map } = arNorm(text);
  const pos = Math.min(...words.map((w) => n.indexOf(w)).filter((i) => i >= 0));
  if (!Number.isFinite(pos)) return '';
  const o = map[pos];
  const a = Math.max(0, o - 45);
  const z = Math.min(text.length, o + 75);
  return `${a > 0 ? '…' : ''}${hl(text.slice(a, z), words)}${z < text.length ? '…' : ''}`;
}

// عنوان الفائدة (أو أول سطر من نصّها إن لم يكن لها عنوان)
const benTitle = (b) =>
  (b.title || String(b.body || '').split('\n').map((l) => l.replace(/^\s*(#{1,2}|[-•*]|>)\s+/, '').replace(/\*\*/g, '').trim()).find(Boolean) || 'فائدة').slice(0, 100);
const benefitCard = (b, admin = false, folders = [], words = null) => {
  const f = folders.find((x) => x.id === b.folder_id);
  const snip = words?.length ? snippet(plainBody(b), words) : '';
  const rx = (b.reactions || []).reduce((t, r) => t + r.count, 0);
  const meta = [f && `${f.icon} ${esc(f.name)}`, b.group_name ? `🕌 ${esc(b.group_name)}` : '👥 للجميع', fmtWhen(b.created_at)].filter(Boolean).join(' · ');
  return `<details class="ben-card ben-fold" data-ben="${b.id}">
    <summary><span class="bf-main"><b>${hl(benTitle(b), words)}</b>${snip ? `<span class="bf-snip">${snip}</span>` : ''}
        <small>${meta}${b.images?.length ? ' · 🖼' : ''}${b.youtube?.length ? ' · ▶️' : ''}${rx ? ` · ${(b.reactions || []).map((r) => r.emoji).join('')} ${rx}` : ''}</small></span>
      <span class="bf-chev" aria-hidden="true"></span></summary>
    <div class="bf-body">
      ${b.body ? `<div class="rich">${richText(b.body)}</div>` : ''}
      ${b.images?.length ? `<div class="ben-imgs n${Math.min(b.images.length, 3)}">${b.images.map((i) => `<img src="/api/quran/benefit-images/${i}" alt="" loading="lazy" data-full="/api/quran/benefit-images/${i}">`).join('')}</div>` : ''}
      ${b.youtube?.length ? `<div class="ben-yts">${b.youtube.map(ytBox).join('')}</div>` : ''}
      ${b.by_name ? `<small class="muted bf-by">— ${esc(b.by_name)}</small>` : ''}
      <div class="ben-react" data-rx="${b.id}">${rxBar(b)}</div>
      ${admin ? `<div class="q-actions"><button type="button" class="btn small ghost" data-ben-edit="${b.id}">✏️ تعديل</button>
        <button type="button" class="btn small ghost danger" data-ben-del="${b.id}">حذف</button></div>` : ''}
    </div></details>`;
};
// مكتبة الفوائد: الملفات (المواضيع) في الأعلى، ثم الفوائد مطويّة
function benefitsLibrary(box, benefits, folders, admin, onBind) {
  const KEY = 'benFolder';
  let cur = '';
  try { cur = sessionStorage.getItem(KEY) || ''; } catch {}
  if (cur && cur !== 'none' && !folders.some((f) => String(f.id) === cur)) cur = '';
  const count = (id) => benefits.filter((b) => (id === 'none' ? !b.folder_id : b.folder_id === id)).length;
  const none = count('none');
  let q = '';
  // نص كل فائدة جاهزًا للبحث: العنوان والنص واسم الملف
  const hay = new Map(benefits.map((b) => [b.id, arNorm(`${b.title || ''} ${plainBody(b)} ${folders.find((f) => f.id === b.folder_id)?.name || ''}`).n]));
  box.innerHTML = `${benefits.length ? `<div class="bf-search"><span aria-hidden="true">🔍</span>
      <input type="search" id="bf-q" placeholder="ابحث بكلمة مفتاحية… (مثال: الإخلاص، المدّ)" autocomplete="off">
      <button type="button" id="bf-x" aria-label="مسح البحث" hidden>✕</button></div>` : ''}<div class="bf-out"></div>`;
  const out = box.querySelector('.bf-out');
  const results = () => {
    const words = searchWords(q);
    const list = benefits.filter((b) => words.every((w) => hay.get(b.id).includes(w)));
    out.innerHTML = `<p class="bf-count">${list.length ? `${list.length} ${list.length === 1 ? 'نتيجة' : list.length === 2 ? 'نتيجتان' : list.length <= 10 ? 'نتائج' : 'نتيجة'} لـ «${esc(q.trim())}»` : `لا نتائج لـ «${esc(q.trim())}». جرّب كلمة أخرى.`}</p>
      <div class="ben-list">${list.map((b) => benefitCard(b, admin, folders, words)).join('')}</div>`;
    bindBenefitMedia(out);
    bindReactions(out, benefits);
    onBind?.(out, cur);
  };
  const search = box.querySelector('#bf-q');
  let timer;
  search?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      q = search.value;
      box.querySelector('#bf-x').hidden = !q;
      searchWords(q).length ? results() : draw();
    }, 150);
  });
  box.querySelector('#bf-x')?.addEventListener('click', () => {
    search.value = q = '';
    box.querySelector('#bf-x').hidden = true;
    draw();
    search.focus();
  });
  const draw = () => {
    const chips = [['', '📚', 'الكل', benefits.length], ...folders.map((f) => [String(f.id), f.icon, f.name, count(f.id)]), ...(none && folders.length ? [['none', '📄', 'بلا ملف', none]] : [])];
    const list = benefits.filter((b) => (!cur ? true : cur === 'none' ? !b.folder_id : String(b.folder_id) === cur));
    // في «الكل»: أقسام حسب الملفات
    const sections = !cur && folders.length
      ? [...folders.map((f) => [f, list.filter((b) => b.folder_id === f.id)]), [null, list.filter((b) => !b.folder_id)]].filter(([, l]) => l.length)
      : [[cur && cur !== 'none' ? folders.find((f) => String(f.id) === cur) : null, list]];
    out.innerHTML = `${folders.length || admin ? `<div class="bf-chips">${chips.map(([k, i, n, c]) => `<button type="button" class="bf-chip ${k === cur ? 'on' : ''}" data-f="${k}"><span>${i}</span>${esc(n)}<b>${c}</b></button>`).join('')}
        ${admin ? '<button type="button" class="bf-chip add" id="bf-manage">⚙️ الملفات</button>' : ''}</div>` : ''}
      ${list.length ? sections.map(([f, l]) => `<section class="bf-sec">
          ${!cur && folders.length ? `<h4 class="bf-h">${f ? `${f.icon} ${esc(f.name)}` : '📄 بلا ملف'}<small>${l.length}</small></h4>` : ''}
          <div class="ben-list">${l.map((b) => benefitCard(b, admin, folders)).join('')}</div></section>`).join('')
        : `<div class="card empty-state"><span>📂</span><p>${benefits.length ? 'لا فوائد في هذا الملف بعد.' : admin ? 'لم تُكتب أي فائدة بعد.' : 'لا توجد فوائد بعد. ما يكتبه الشيخ لمجموعتك يظهر هنا.'}</p></div>`}`;
    out.querySelectorAll('[data-f]').forEach((c) =>
      c.addEventListener('click', () => {
        cur = c.dataset.f;
        try { sessionStorage.setItem(KEY, cur); } catch {}
        draw();
      })
    );
    const on = out.querySelector('.bf-chip.on');
    if (on) on.parentElement.scrollLeft = on.offsetLeft - (on.parentElement.clientWidth - on.offsetWidth) / 2;
    bindBenefitMedia(out);
    bindReactions(out, benefits);
    onBind?.(out, cur);
  };
  draw();
}

// ---------- التفاعل مع الفوائد ----------
const RX = [['👍', 'أعجبني'], ['❤️', 'أحببته'], ['🤲', 'آمين'], ['👀', 'قرأته'], ['✅', 'سأعمل به']];
const rxNames = (b) => (b.reactions || []).flatMap((r) => r.names);
function rxBar(b) {
  const total = (b.reactions || []).reduce((t, r) => t + r.count, 0);
  const names = rxNames(b);
  const who = !total ? '' : names.length <= 2 ? names.map(esc).join(' و') : `${esc(names[0])} و${esc(names[1])} و${total - 2} ${total - 2 > 2 ? 'آخرين' : 'آخر'}`;
  return `<div class="rx-row">
      ${(b.reactions || []).map((r) => `<button type="button" class="rx-chip ${b.my_reaction === r.emoji ? 'mine' : ''}" data-e="${r.emoji}" title="${esc(r.names.join('، '))}">${r.emoji}<b>${r.count}</b></button>`).join('')}
      <button type="button" class="rx-add ${b.my_reaction ? 'has' : ''}" data-open aria-label="تفاعل">${b.my_reaction ? b.my_reaction : '<span>☺</span>'}<small>${b.my_reaction ? 'تفاعلك' : 'تفاعل'}</small></button>
    </div>
    <div class="rx-pick" hidden>${RX.map(([e, l]) => `<button type="button" data-e="${e}" class="${b.my_reaction === e ? 'on' : ''}"><span>${e}</span><small>${l}</small></button>`).join('')}</div>
    ${total ? `<button type="button" class="rx-who" data-who>${who} ${total === 1 ? 'تفاعل' : 'تفاعلوا'} ‹</button>` : ''}`;
}
function bindReactions(root, list) {
  root.querySelectorAll('[data-rx]').forEach((box) => {
    const b = list.find((x) => x.id === Number(box.dataset.rx));
    if (!b) return;
    const draw = () => (box.innerHTML = rxBar(b));
    box.addEventListener('click', async (e) => {
      if (e.target.closest('[data-open]')) {
        const p = box.querySelector('.rx-pick');
        p.hidden = !p.hidden;
        return;
      }
      if (e.target.closest('[data-who]')) {
        recSheet(`<h3 class="rx-title">التفاعلات (${rxNames(b).length})</h3>
          <div class="rx-list">${b.reactions.map((r) => `<div><span class="rx-big">${r.emoji}</span><b>${RX.find((x) => x[0] === r.emoji)?.[1] || ''} · ${r.count}</b>
            <p>${r.names.map((n) => `<span class="pill">${esc(n)}</span>`).join(' ')}</p></div>`).join('')}</div>`);
        return;
      }
      const btn = e.target.closest('[data-e]');
      if (!btn) return;
      const emoji = btn.dataset.e === b.my_reaction ? null : btn.dataset.e;
      try {
        const r = await api('PUT', `/api/quran/benefits/${b.id}/react`, { emoji });
        b.reactions = r.reactions;
        b.my_reaction = r.my_reaction;
        draw();
        if (emoji) box.querySelector(`.rx-chip[data-e="${emoji}"]`)?.classList.add('pop');
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
}

// تشغيل يوتيوب داخل البطاقة، وفتح الصورة بالحجم الكامل
function bindBenefitMedia(root) {
  root.querySelectorAll('[data-yt]').forEach((b) =>
    b.addEventListener('click', () => {
      b.outerHTML = `<div class="yt"><iframe src="https://www.youtube-nocookie.com/embed/${b.dataset.yt}?autoplay=1&rel=0" title="YouTube"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
    })
  );
  root.querySelectorAll('[data-full]').forEach((img) =>
    img.addEventListener('click', () => {
      const ov = document.createElement('div');
      ov.className = 'img-view';
      ov.innerHTML = `<img src="${img.dataset.full}" alt=""><button type="button" aria-label="إغلاق">✕</button>`;
      ov.addEventListener('click', () => ov.remove());
      document.body.append(ov);
    })
  );
}

// ---------- الطالب ----------
async function viewBenefits(el, tab = '') {
  if (state.user.role === 'admin') {
    const { groups } = await api('GET', '/api/quran/overview');
    el.innerHTML = '<div id="ben-admin"></div>';
    return benefitsTab($('#ben-admin'), groups);
  }
  tab = tab === 'mine' ? 'mine' : 'sheikh';
  el.innerHTML = `<div class="page-head"><h2>💡 الفوائد</h2></div>
    <div class="q-seg rec-seg" role="tablist">
      <a role="tab" href="#/benefits?sheikh" class="${tab === 'sheikh' ? 'on' : ''}">من الشيخ</a>
      <a role="tab" href="#/benefits?mine" class="${tab === 'mine' ? 'on' : ''}">ملاحظاتي</a>
      <span></span></div>
    <div id="ben-page"></div>`;
  el.querySelector('.rec-seg').style.gridTemplateColumns = '1fr 1fr';
  el.querySelector('.rec-seg span').remove();
  const page = $('#ben-page');
  if (tab === 'sheikh') {
    const [{ benefits }, { folders }] = await Promise.all([api('GET', '/api/quran/benefits'), api('GET', '/api/quran/benefit-folders')]);
    benefitsLibrary(page, benefits, folders, false);
    return;
  }
  const load = async () => {
    const { notes } = await api('GET', '/api/quran/my-notes');
    page.innerHTML = `<form class="card note-new" id="note-form">
        <label>ملاحظة جديدة<textarea name="body" rows="3" maxlength="5000" placeholder="مثال: الانتباه إلى المدّ في آية… / مواضع المتشابهات بين البقرة وآل عمران…"></textarea></label>
        <button class="btn" type="submit">＋ إضافة</button>
        <p class="muted small">ملاحظاتك خاصة بك، لا يراها غيرك.</p></form>
      ${notes.length ? `<div class="ben-list">${notes
        .map((n) => `<article class="ben-card mine"><div class="ben-head"><small class="muted">${fmtWhen(n.created_at)}${n.updated_at ? ' · عُدّلت' : ''}</small>
            <span class="q-actions"><button type="button" class="link small" data-note-edit="${n.id}">تعديل</button><button type="button" class="link small danger" data-note-del="${n.id}">حذف</button></span></div>
          <p class="ben-body">${esc(n.body)}</p></article>`)
        .join('')}</div>` : '<p class="muted center">لا ملاحظات بعد.</p>'}`;
    $('#note-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('POST', '/api/quran/my-notes', formData(e.target));
        toast('تمت الإضافة ✓');
        load();
      } catch (err) {
        toast(err.message, true);
      }
    });
    page.querySelectorAll('[data-note-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        const n = notes.find((x) => x.id === Number(b.dataset.noteEdit));
        openModal('تعديل الملاحظة', `<label>الملاحظة<textarea name="body" rows="6" maxlength="5000">${esc(n.body)}</textarea></label>`, async (data) => {
          await api('PUT', `/api/quran/my-notes/${n.id}`, data);
          load();
        });
      })
    );
    page.querySelectorAll('[data-note-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirmAction('حذف هذه الملاحظة؟')) return;
        await api('DELETE', `/api/quran/my-notes/${b.dataset.noteDel}`).catch((e) => toast(e.message, true));
        load();
      })
    );
  };
  await load();
}

// ---------- المشرف: كتابة الفوائد ----------
async function benefitsTab(page, groups) {
  const [{ benefits }, { folders }] = await Promise.all([api('GET', '/api/quran/benefits'), api('GET', '/api/quran/benefit-folders')]);
  page.innerHTML = `<div class="page-head"><h2>💡 الفوائد</h2><button type="button" class="btn small" id="ben-add">＋ فائدة جديدة</button></div>
    <div id="ben-lib"></div>`;
  let curFolder = '';
  const TOOLS = [['# ', 'عنوان'], ['## ', 'عنوان فرعي'], ['- ', '• نقطة'], ['> ', '❝ اقتباس'], ['**', 'عريض']];
  const form = (b) => {
    let keep = [...(b?.images || [])];
    let fresh = [];
    openModal(
      b ? 'تعديل الفائدة' : '💡 فائدة جديدة',
      `<label>الملف (الموضوع)<select name="folder_id"><option value="">📄 بلا ملف</option>${folders
        .map((f) => `<option value="${f.id}" ${(b ? b.folder_id === f.id : curFolder === String(f.id)) ? 'selected' : ''}>${f.icon} ${esc(f.name)}</option>`).join('')}</select></label>
       <label>لمن؟<select name="group_id"><option value="">👥 لكل الطلبة</option>${groups
        .map((g) => `<option value="${g.id}" ${b?.group_id === g.id ? 'selected' : ''}>🕌 ${esc(g.name)}</option>`).join('')}</select></label>
       <label>العنوان<input name="title" maxlength="150" value="${esc(b?.title || '')}" placeholder="مثال: من آداب حامل القرآن"></label>
       <label>النص</label>
       <div class="rt-tools">${TOOLS.map(([m, l]) => `<button type="button" data-md="${esc(m)}">${l}</button>`).join('')}</div>
       <textarea name="body" id="ben-body" rows="7" maxlength="8000" placeholder="# عنوان&#10;نص الفائدة…&#10;- نقطة&#10;- نقطة">${esc(b?.body || '')}</textarea>
       <label>🖼 صور (6 على الأكثر)</label>
       <div class="ben-pics" id="ben-pics"></div>
       <label class="btn small ghost file-btn">＋ إضافة صور<input type="file" id="ben-files" accept="image/*" multiple hidden></label>
       <label>▶ روابط يوتيوب (رابط في كل سطر)<textarea name="youtube" rows="2" dir="ltr" placeholder="https://youtu.be/...">${(b?.youtube || []).map((id) => `https://youtu.be/${id}`).join('\n')}</textarea></label>
       <details class="rt-help"><summary>كيف أكتب عنوانًا أو نقاطًا؟</summary>
         <p><code># عنوان</code> · <code>## عنوان فرعي</code> · <code>- نقطة</code> · <code>&gt; اقتباس</code> · <code>**عريض**</code></p></details>`,
      async (data) => {
        const youtube = String(data.youtube || '').split(/\s+/).filter(Boolean);
        await api(b ? 'PUT' : 'POST', b ? `/api/quran/benefits/${b.id}` : '/api/quran/benefits', {
          group_id: data.group_id, folder_id: data.folder_id, title: data.title, body: data.body, youtube, images: fresh, keep_images: keep,
        });
        toast('تم الحفظ ✓');
        benefitsTab(page, groups);
      }
    );
    const pics = $('#ben-pics');
    const drawPics = () => {
      pics.innerHTML =
        keep.map((i) => `<span class="ben-pic"><img src="/api/quran/benefit-images/${i}" alt=""><button type="button" data-rm-old="${i}">✕</button></span>`).join('') +
        fresh.map((d, k) => `<span class="ben-pic"><img src="${d}" alt=""><button type="button" data-rm-new="${k}">✕</button></span>`).join('');
      pics.querySelectorAll('[data-rm-old]').forEach((x) => x.addEventListener('click', () => ((keep = keep.filter((i) => i !== Number(x.dataset.rmOld))), drawPics())));
      pics.querySelectorAll('[data-rm-new]').forEach((x) => x.addEventListener('click', () => (fresh.splice(Number(x.dataset.rmNew), 1), drawPics())));
    };
    drawPics();
    $('#ben-files').addEventListener('change', async (e) => {
      for (const f of [...e.target.files]) {
        if (keep.length + fresh.length >= 6) {
          toast('6 صور على الأكثر', true);
          break;
        }
        try {
          fresh.push(await shrinkImage(f));
        } catch (err) {
          toast(err.message, true);
        }
      }
      e.target.value = '';
      drawPics();
    });
    // أزرار التنسيق: تضيف العلامة في بداية السطر (أو حول النص المحدّد للعريض)
    const ta = $('#ben-body');
    $('#modal-form .rt-tools').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-md]');
      if (!btn) return;
      const m = btn.dataset.md;
      const { selectionStart: a, selectionEnd: z, value: v } = ta;
      if (m === '**') {
        const sel = v.slice(a, z) || 'نص عريض';
        ta.value = v.slice(0, a) + `**${sel}**` + v.slice(z);
      } else {
        const ls = v.lastIndexOf('\n', a - 1) + 1;
        ta.value = v.slice(0, ls) + m + v.slice(ls);
      }
      ta.focus();
    });
  };
  $('#ben-add').addEventListener('click', () => form(null));
  const reload = () => benefitsTab(page, groups);
  benefitsLibrary($('#ben-lib'), benefits, folders, true, (box, cur) => {
    curFolder = cur;
    $('#bf-manage')?.addEventListener('click', () => manageFolders(folders, reload));
    box.querySelectorAll('[data-ben-edit]').forEach((x) => x.addEventListener('click', () => form(benefits.find((b) => b.id === Number(x.dataset.benEdit)))));
    box.querySelectorAll('[data-ben-del]').forEach((x) =>
      x.addEventListener('click', async () => {
        if (!confirmAction('حذف هذه الفائدة؟')) return;
        await api('DELETE', `/api/quran/benefits/${x.dataset.benDel}`).catch((e) => toast(e.message, true));
        reload();
      })
    );
  });
}

// إدارة الملفات: إضافة، تغيير الاسم والأيقونة، حذف
const BF_ICONS = ['📘', '📗', '📙', '📕', '📿', '🕌', '🤲', '⭐', '💎', '🌙', '🧠', '❤️'];
function manageFolders(folders, onDone) {
  const iconPick = (name, v) => `<span class="bf-icons">${BF_ICONS.map((i) => `<label><input type="radio" name="${name}" value="${i}" ${i === v ? 'checked' : ''}><span>${i}</span></label>`).join('')}</span>`;
  openModal(
    '📁 ملفات الفوائد',
    `${folders.length ? `<ul class="bf-manage">${folders.map((f) => `<li><span>${f.icon} <b>${esc(f.name)}</b></span>
        <span class="q-actions"><button type="button" class="link small" data-fe="${f.id}">تعديل</button><button type="button" class="link small danger" data-fd="${f.id}">حذف</button></span></li>`).join('')}</ul>
      <p class="muted small">حذف الملف لا يحذف فوائده: تبقى «بلا ملف».</p>` : '<p class="muted">لا ملفات بعد. أنشئ ملفًا لكل موضوع (آداب، تجويد، تفسير…).</p>'}
     <fieldset class="q-fs"><legend>＋ ملف جديد</legend>
       <label>الاسم<input name="name" maxlength="60" placeholder="مثال: أحكام التجويد"></label>
       <label>الأيقونة</label>${iconPick('icon', '📘')}</fieldset>`,
    async (data) => {
      if (!String(data.name || '').trim()) throw new Error('اكتب اسم الملف');
      await api('POST', '/api/quran/benefit-folders', { name: data.name, icon: data.icon });
      toast('تم إنشاء الملف ✓');
      onDone();
    }
  );
  const f = $('#modal-form');
  f.querySelectorAll('[data-fd]').forEach((x) =>
    x.addEventListener('click', async () => {
      if (!confirmAction('حذف هذا الملف؟ (فوائده تبقى بلا ملف)')) return;
      await api('DELETE', `/api/quran/benefit-folders/${x.dataset.fd}`).catch((e) => toast(e.message, true));
      $('#modal').close();
      onDone();
    })
  );
  f.querySelectorAll('[data-fe]').forEach((x) =>
    x.addEventListener('click', () => {
      const fo = folders.find((y) => y.id === Number(x.dataset.fe));
      openModal('تعديل الملف', `<label>الاسم<input name="name" required maxlength="60" value="${esc(fo.name)}"></label><label>الأيقونة</label>${iconPick('icon', fo.icon)}`, async (d) => {
        await api('PUT', `/api/quran/benefit-folders/${fo.id}`, d);
        toast('تم ✓');
        onDone();
      });
    })
  );
}

routes.unshift([/^#\/benefits(?:\?(sheikh|mine))?$/, (el, tab) => viewBenefits(el, tab || '')]);
