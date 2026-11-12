// فلوسي — فهم الطلبات الصوتية/المكتوبة بالذكاء الاصطناعي (Claude) وتحويلها إلى موعد أو عمليات مالية
// المفتاح ANTHROPIC_API_KEY في متغيرات بيئة Netlify (لا يصل إلى المتصفح أبدًا).
// الحفظ نفسه يتمّ من المتصفح عبر دوال Supabase العادية؛ هذه الدالة تفهم النص فقط.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

const SUPABASE_URL = 'https://wunachimbqwjdkgguhzf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_aJF0sOw7HpaDExTgg86czQ_b79Zxvkj';
const MODEL = 'claude-opus-5-5';

const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const toMin = (s) => { const m = TIME_RE.exec(s || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

const ApptSchema = z.object({
  items: z.array(z.object({
    title: z.string().describe('عنوان الموعد قصير وواضح بالعربية'),
    date: z.string().describe('YYYY-MM-DD'),
    start: z.string().describe('HH:MM بنظام 24 ساعة'),
    end: z.string().nullable().describe('HH:MM أو null إن لم تُذكر النهاية'),
    note: z.string().nullable().describe('تفاصيل إضافية: المكان، الشخص… أو null'),
    icon: z.string().describe('إيموجي واحد مناسب'),
  })),
  message: z.string().nullable().describe('ملاحظة قصيرة بالعربية للمستخدم إن كان شيء غير واضح، وإلا null'),
});
const MoneySchema = z.object({
  items: z.array(z.object({
    type: z.enum(['income', 'expense']),
    amount: z.number().describe('المبلغ بالدينار التونسي، بالأرقام'),
    category_id: z.number().int().describe('رقم النوع من القائمة'),
    date: z.string().describe('YYYY-MM-DD'),
    note: z.string().nullable().describe('ملاحظة قصيرة (مثلاً: قهوة مع صديق) أو null'),
  })),
  message: z.string().nullable().describe('ملاحظة قصيرة بالعربية إن كان شيء غير واضح، وإلا null'),
});

function systemPrompt(mode, ctx, cats) {
  const common = `You turn a short request from a user in Tunisia into structured data for a personal planner app called Flousi.
The request is usually spoken Tunisian Arabic (Derja), sometimes Modern Standard Arabic or French, and may come from speech recognition, so expect spelling mistakes and missing punctuation.
Today is ${ctx.weekday} ${ctx.today}; the user's local time now is ${ctx.now}. The week starts on Monday.
Resolve relative dates yourself: "اليوم" today, "غدوة"/"غدا" tomorrow, "بعد غدوة" the day after, "البارح" yesterday, "الثلاثاء الجاي" the coming Tuesday (if today is Tuesday, next week's), "السمانة الجاية" next week.
Return only what the user actually asked for; one request may contain several items. Never invent items. Write titles and notes in Arabic, short and natural.
If nothing usable is in the request, return an empty items list and explain briefly in message.`;
  if (mode === 'appt') {
    return `${common}
Task: extract appointments (مواعيد).
Times: "على العشرة" = 10:00, "العشرة ونص" = 10:30, "الخمسة غير ربع" = 16:45, "الصباح" morning, "العشية" afternoon, "الليل" evening.
When the hour alone is ambiguous, pick the plausible daytime hour: 1 to 7 without "الصباح" usually means 13:00 to 19:00; 8 to 12 means morning unless "الليل" or "العشية" is said.
If no time is given, use 09:00 and say so in message. Set end only if a duration or end time is said ("ساعة" = start + 60 minutes).`;
  }
  return `${common}
Task: extract money transactions. "صرفت/شريت/خلصت/دفعت" = expense; "خذيت/دخلي/جاتني/ربحت/الشهرية" = income.
Amounts: Tunisian dinar (د.ت), up to 3 decimals. In Tunisian speech "ألف/آلاف" usually means thousands of millimes, i.e. dinars: "عشرين ألف" = 20, "خمسة آلاف" = 5, "ألفين وخمسمية" = 2.5, "مية ألف" = 100. "دينار" is explicit dinars; "مليون" = 1000 dinars. Write amount as a plain number in dinars.
Date: today unless the user says otherwise.
Choose category_id only from this list (id: type — name); pick the closest match, or the "أخرى" category of the right type:
${cats}`;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST فقط' });
  if (!process.env.ANTHROPIC_API_KEY) {
    return json(503, { error: 'الذكاء الاصطناعي غير مفعّل بعد: يجب إضافة المفتاح ANTHROPIC_API_KEY في إعدادات Netlify', code: 'no_key' });
  }
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'طلب غير صالح' }); }
  const { token, mode } = body || {};
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!['appt', 'money'].includes(mode)) return json(400, { error: 'نوع الطلب غير صالح' });
  if (!text) return json(400, { error: 'قل أو اكتب ما تريد إضافته' });
  if (text.length > 600) return json(400, { error: 'الطلب طويل جدًا' });
  const today = DATE_RE.test(body.today || '') ? body.today : new Date().toISOString().slice(0, 10);
  const ctx = { today, weekday: String(body.weekday || '').slice(0, 12), now: TIME_RE.test(body.now || '') ? body.now : '12:00' };

  // الجلسة: حساب فلوسي صالح فقط (ونأخذ منه الأنواع)
  let state;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/flousi_state`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: typeof token === 'string' ? token : '' }),
    });
    if (!r.ok) return json(401, { error: 'يجب تسجيل الدخول', auth: true });
    state = await r.json();
  } catch {
    return json(502, { error: 'تعذّر الاتصال بقاعدة البيانات' });
  }
  const cats = state.categories.filter((c) => !c.archived);
  const catList = cats.map((c) => `${c.id}: ${c.type === 'income' ? 'income' : 'expense'} — ${c.name}`).join('\n');

  const client = new Anthropic();
  let msg;
  try {
    msg = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(mode === 'appt' ? ApptSchema : MoneySchema) },
      system: systemPrompt(mode, ctx, catList),
      messages: [{ role: 'user', content: text }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return json(503, { error: 'مفتاح الذكاء الاصطناعي غير صالح', code: 'bad_key' });
    if (err instanceof Anthropic.RateLimitError) return json(429, { error: 'طلبات كثيرة، أعد المحاولة بعد قليل' });
    if (err instanceof Anthropic.APIError) { console.error('anthropic', err.status, err.message); return json(502, { error: 'الذكاء الاصطناعي غير متاح الآن، أعد المحاولة' }); }
    console.error(err);
    return json(500, { error: 'خطأ في الخادم' });
  }
  if (msg.stop_reason === 'refusal') return json(422, { error: 'لم أستطع معالجة هذا الطلب' });
  const out = msg.parsed_output;
  if (!out) return json(422, { error: 'لم أفهم الطلب، أعد صياغته' });

  // تحقّق من كل عنصر قبل إرجاعه
  const minDate = new Date(Date.parse(today) - 400 * 864e5).toISOString().slice(0, 10);
  const maxDate = new Date(Date.parse(today) + 3650 * 864e5).toISOString().slice(0, 10);
  const okDate = (d) => DATE_RE.test(d) && !Number.isNaN(Date.parse(d)) && d >= minDate && d <= maxDate;
  let items = [];
  if (mode === 'appt') {
    for (const it of out.items.slice(0, 10)) {
      const start = toMin(it.start), end = toMin(it.end);
      const title = String(it.title || '').trim().slice(0, 80);
      if (!title || start == null || !okDate(it.date)) continue;
      items.push({ title, date: it.date, start, end: end != null && end > start ? end : null,
        note: it.note ? String(it.note).trim().slice(0, 300) || null : null, icon: [...String(it.icon || '📌')].slice(0, 2).join('') || '📌' });
    }
  } else {
    for (const it of out.items.slice(0, 20)) {
      const amount = Math.round(Number(it.amount) * 1000) / 1000;
      if (!(amount > 0 && amount <= 1e8) || !okDate(it.date) || !['income', 'expense'].includes(it.type)) continue;
      let cat = cats.find((c) => c.id === it.category_id && c.type === it.type);
      if (!cat) cat = cats.find((c) => c.type === it.type && c.name === 'أخرى') || cats.find((c) => c.type === it.type);
      if (!cat) continue;
      items.push({ type: it.type, amount, category_id: cat.id, date: it.date, note: it.note ? String(it.note).trim().slice(0, 200) || null : null });
    }
  }
  return json(200, { items, message: out.message || null });
};

export const config = { path: '/api/ai' };
