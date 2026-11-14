// بنية المصحف لفضاء التحفيظ: السور، بدايات الأحزاب، والمقاطع (سورة × حزب)
// يُستعمل في الواجهة (globalThis.QURAN) وفي الخادم (import لنفس الملف)
(function () {
  const NAMES = ['الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف', 'الأنفال', 'التوبة', 'يونس', 'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر', 'النحل', 'الإسراء', 'الكهف', 'مريم', 'طه', 'الأنبياء', 'الحج', 'المؤمنون', 'النور', 'الفرقان', 'الشعراء', 'النمل', 'القصص', 'العنكبوت', 'الروم', 'لقمان', 'السجدة', 'الأحزاب', 'سبأ', 'فاطر', 'يس', 'الصافات', 'ص', 'الزمر', 'غافر', 'فصلت', 'الشورى', 'الزخرف', 'الدخان', 'الجاثية', 'الأحقاف', 'محمد', 'الفتح', 'الحجرات', 'ق', 'الذاريات', 'الطور', 'النجم', 'القمر', 'الرحمن', 'الواقعة', 'الحديد', 'المجادلة', 'الحشر', 'الممتحنة', 'الصف', 'الجمعة', 'المنافقون', 'التغابن', 'الطلاق', 'التحريم', 'الملك', 'القلم', 'الحاقة', 'المعارج', 'نوح', 'الجن', 'المزمل', 'المدثر', 'القيامة', 'الإنسان', 'المرسلات', 'النبأ', 'النازعات', 'عبس', 'التكوير', 'الانفطار', 'المطففين', 'الانشقاق', 'البروج', 'الطارق', 'الأعلى', 'الغاشية', 'الفجر', 'البلد', 'الشمس', 'الليل', 'الضحى', 'الشرح', 'التين', 'العلق', 'القدر', 'البينة', 'الزلزلة', 'العاديات', 'القارعة', 'التكاثر', 'العصر', 'الهمزة', 'الفيل', 'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر', 'المسد', 'الإخلاص', 'الفلق', 'الناس'];
  const AYAT = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6];
  // بداية كل حزب من الستين: [السورة، الآية] (ترقيم المصحف المتداول)
  const HIZB = [[1, 1], [2, 75], [2, 142], [2, 203], [2, 253], [3, 15], [3, 93], [3, 171], [4, 24], [4, 88], [4, 148], [5, 27], [5, 82], [6, 36], [6, 111], [7, 1], [7, 88], [7, 171], [8, 41], [9, 34], [9, 93], [10, 26], [11, 6], [11, 84], [12, 53], [13, 19], [15, 1], [16, 51], [17, 1], [17, 99], [18, 75], [20, 1], [21, 1], [22, 1], [23, 1], [24, 21], [25, 21], [26, 111], [27, 56], [28, 51], [29, 46], [31, 22], [33, 31], [34, 24], [36, 28], [37, 145], [39, 32], [40, 41], [41, 47], [43, 24], [46, 1], [48, 18], [51, 31], [55, 1], [58, 1], [62, 1], [67, 1], [72, 1], [78, 1], [87, 1]];
  // الأرباع (كل ربع ربع المصحف تقريبًا)، تبدأ من هذه السور
  const QUARTERS = [
    { n: 1, name: 'ربع البقرة', from: 1 },
    { n: 2, name: 'ربع الأعراف', from: 7 },
    { n: 3, name: 'ربع مريم', from: 19 },
    { n: 4, name: 'ربع يس', from: 36 },
  ];
  const quarterOf = (sura) => QUARTERS.filter((q) => q.from <= sura).pop().n;

  // المقاطع: جزء سورة داخل حزب واحد. id = ترتيبه في المصحف
  const segments = [];
  for (let h = 0; h < 60; h++) {
    const [s0, a0] = HIZB[h];
    const [s1, a1] = h < 59 ? HIZB[h + 1] : [115, 1];
    const parts = [];
    for (let s = s0; s <= Math.min(s1, 114); s++) {
      const from = s === s0 ? a0 : 1;
      const to = s === s1 ? a1 - 1 : AYAT[s - 1];
      if (to >= from) parts.push({ sura: s, from, to });
    }
    const total = parts.reduce((t, p) => t + p.to - p.from + 1, 0);
    for (const p of parts) {
      segments.push({
        id: segments.length,
        hizb: h + 1,
        juz: Math.ceil((h + 1) / 2),
        quarter: quarterOf(p.sura),
        ...p,
        // الحجم بالأحزاب (تقريبي حسب عدد الآيات داخل الحزب)
        size: (p.to - p.from + 1) / total,
      });
    }
  }

  // اسم مختصر لمجموعة مقاطع:
  // جزء كامل ← «الجزء 30»، أجزاء متتالية ← «من الجزء 28 إلى الجزء 30»
  // سور متتالية ← «من النبأ إلى البروج»، سورة واحدة ← «الملك» أو «البقرة 1–74»
  const suraName = (s) => NAMES[s - 1];
  const juzIds = {};
  for (const g of segments) (juzIds[g.juz] ||= []).push(g.id);
  function rangeLabel(segs) {
    const list = [...new Map(segs.filter(Boolean).map((g) => [g.id, g])).values()].sort((a, b) => a.id - b.id);
    if (!list.length) return '';
    const set = new Set(list.map((g) => g.id));
    const fullJuz = (j) => juzIds[j].every((id) => set.has(id));
    const tokens = [];
    let i = 0;
    while (i < list.length) {
      const g = list[i];
      if (g.id === juzIds[g.juz][0] && fullJuz(g.juz)) {
        let j = g.juz;
        while (juzIds[j + 1] && fullJuz(j + 1)) j++;
        tokens.push(j === g.juz ? `الجزء ${j}` : j === g.juz + 1 ? `الجزء ${g.juz} و${j}` : `من الجزء ${g.juz} إلى الجزء ${j}`);
        const last = juzIds[j][juzIds[j].length - 1];
        while (i < list.length && list[i].id <= last) i++;
        continue;
      }
      // سلسلة مقاطع متتالية (تتوقف عند بداية جزء كامل)
      let k = i;
      while (k + 1 < list.length && list[k + 1].id === list[k].id + 1 && !(list[k + 1].id === juzIds[list[k + 1].juz][0] && fullJuz(list[k + 1].juz))) k++;
      const a = list[i];
      const b = list[k];
      if (a.sura === b.sura) {
        tokens.push(a.from === 1 && b.to === AYAT[a.sura - 1] ? suraName(a.sura) : `${suraName(a.sura)} ${a.from}–${b.to}`);
      } else {
        const start = a.from === 1 ? suraName(a.sura) : `${suraName(a.sura)} ${a.from}`;
        const end = b.to === AYAT[b.sura - 1] ? suraName(b.sura) : `${suraName(b.sura)} ${b.to}`;
        tokens.push(`من ${start} إلى ${end}`);
      }
      i = k + 1;
    }
    return tokens.join('، ');
  }

  // تقسيم المحفوظ إلى n حصص متوازنة (حسب الحجم)، مع احترام ترتيب المصحف
  function splitPlan(ids, n) {
    const segs = ids.map((i) => segments[i]).filter(Boolean).sort((a, b) => a.id - b.id);
    const days = Array.from({ length: Math.max(1, n) }, () => []);
    if (!segs.length) return days;
    const total = segs.reduce((t, g) => t + g.size, 0);
    let acc = 0;
    let d = 0;
    for (const g of segs) {
      // ننتقل لليوم الموالي إذا تجاوز المجموع نصيب الأيام السابقة (منتصف المقطع)
      while (d < days.length - 1 && acc + g.size / 2 > (total * (d + 1)) / days.length) d++;
      days[d].push(g);
      acc += g.size;
    }
    return days.map((list) => ({ ids: list.map((g) => g.id), size: Math.round(list.reduce((t, g) => t + g.size, 0) * 100) / 100, label: rangeLabel(list) }));
  }

  // حجم المحفوظ بالأحزاب
  const sizeOf = (ids) => Math.round(ids.reduce((t, i) => t + (segments[i]?.size || 0), 0) * 10) / 10;

  globalThis.QURAN = { NAMES, AYAT, HIZB, QUARTERS, segments, rangeLabel, splitPlan, sizeOf, suraName };
})();
