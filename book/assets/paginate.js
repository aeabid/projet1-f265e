// ترقيم الكتاب : توزيع الكتل على صفحات A4 ثابتة، ثمّ الأرقام والفهرس.
(async function () {
  await document.fonts.ready;
  const src = document.getElementById('src');
  const book = document.getElementById('book');
  const info = { pages: 0, readingCover: 0, overflow: [] };

  function newPage(ch) {
    const p = document.createElement('div');
    p.className = 'page flowpage';
    p.dataset.sec = ch.dataset.sec;
    const num = ch.dataset.num ? `<b>${ch.dataset.num}</b>` : '';
    p.innerHTML = `<div class="deco d1"></div><div class="deco d2"></div>
      <div class="tab"><small>${ch.dataset.tab}</small>${num}</div>
      <div class="content"></div>
      <div class="foot"><img src="assets/logo-color.png" alt=""><span class="pn"></span><span class="run">${ch.dataset.run}</span></div>`;
    book.appendChild(p);
    return p.querySelector('.content');
  }
  const overflows = (c) => c.scrollHeight > c.clientHeight + 1;
  const MM = 96 / 25.4;
  function addNotes(c) {
    const last = c.lastElementChild;
    if (!last) return;
    const free = c.clientHeight - (last.offsetTop + last.offsetHeight) - 4 * MM;
    if (free < 32 * MM) return;
    const n = document.createElement('div');
    n.className = 'notes';
    n.style.height = Math.min(free, 120 * MM) + 'px';
    n.innerHTML = '<b>✎ ملاحظاتي</b>';
    c.appendChild(n);
  }

  const items = Array.from(src.children);
  for (const el of items) {
    if (el.classList.contains('cover-page')) {
      el.classList.add('page');
      book.appendChild(el);
      continue;
    }
    const blocks = Array.from(el.children);
    let content = newPage(el);
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.innerHTML.includes('<!--pagebreak-->') && content.children.length) { addNotes(content); content = newPage(el); }
      content.appendChild(b);
      if (overflows(content)) {
        if (content.children.length === 1) {
          info.overflow.push(el.dataset.run + ' :: ' + b.textContent.slice(0, 60));
          continue;
        }
        const moved = [b];
        // العنوان لا يبقى وحده في أسفل الصّفحة
        let prev = b.previousElementSibling;
        while (prev && prev.innerHTML.includes('<!--keep-->') && content.children.length > moved.length + 1) {
          moved.unshift(prev);
          prev = prev.previousElementSibling;
        }
        content = newPage(el);
        moved.forEach((m) => content.appendChild(m));
        if (overflows(content) && content.children.length === 1) info.overflow.push(el.dataset.run + ' :: ' + b.textContent.slice(0, 60));
      }
    }
    if (el.dataset.sec !== 'front') addNotes(content);
  }
  src.remove();

  const pages = Array.from(book.children);
  pages.forEach((p, i) => {
    const pn = p.querySelector('.pn');
    if (pn) pn.textContent = i + 1;
  });
  const pageOf = (id) => {
    const t = document.getElementById(id);
    return t ? pages.indexOf(t.closest('.page')) + 1 : 0;
  };
  info.readingCover = pageOf('S-mutalaa');
  document.querySelectorAll('.pg[data-ref]').forEach((s) => (s.textContent = pageOf(s.dataset.ref) || ''));
  document.querySelectorAll('.pg[data-marja]').forEach((s) => {
    s.textContent = info.readingCover + 1 + (parseInt(s.dataset.marja, 10) - window.READING_START);
  });
  info.pages = pages.length;
  window.__info = info;
  window.__done = true;
})();
