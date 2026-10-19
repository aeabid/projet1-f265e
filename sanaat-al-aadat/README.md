# صناعة العادات

تطبيق مستقل (لا علاقة له بمركز فيد): كل عادة يومية تحدٍّ، والجميع يرى الترتيب، والمشرف يرى كل التفاصيل.

- **التسجيل:** بحساب Google، أو بالإيميل وكلمة السر (مع تأكيد البريد ونسيت كلمة السر).
- **عاداتي:** أيام الأسبوع السبعة كدوائر لكل عادة، السلسلة 🔥، النسبة، والترتيب. تسجيل آخر 7 أيام فقط.
- **الترتيب:** لكل عادة (هذا الأسبوع / هذا الشهر / منذ البداية): الأسماء وعدد الأيام والسلسلة فقط.
- **الإدارة:** إضافة العادات وتعديلها، وجدول كل مشارك وكل يوم مع وقت التسجيل، وتصحيح أي يوم.

## التقنية

- واجهة ثابتة (`index.html`, `app.js`, `styles.css`) تُنشر على Netlify، مجلّد النشر هو هذا المجلّد.
- Supabase: الحسابات وقاعدة البيانات. المخطط وقواعد الوصول (RLS) في `supabase/schema.sql`.
  - كل واحد يقرأ ويكتب أيامه فقط؛ الترتيب عبر الدالة `leaderboard` التي لا تُرجع تفاصيل الأيام.
  - المشرف (`profiles.is_admin`) يرى ويصحّح كل شيء. صاحب الإيميل المحدّد في `handle_new_user` يصبح مشرفًا عند تسجيله.
- `config.js`: رابط مشروع Supabase والمفتاح العام (publishable)، وهو مفتاح مخصّص للمتصفح.

## إعداد الدخول بـ Google (مرة واحدة)

1. في Google Cloud Console: APIs & Services ← Credentials ← Create OAuth client ID (Web application).
   - Authorized redirect URI: `https://wunachimbqwjdkgguhzf.supabase.co/auth/v1/callback`
2. في Supabase: Authentication ← Sign In / Providers ← Google: الصق Client ID و Client Secret وفعّله.
3. في Supabase: Authentication ← URL Configuration:
   - Site URL: `https://sanaat-al-aadat.netlify.app`
   - Redirect URLs: `https://sanaat-al-aadat.netlify.app/**`
