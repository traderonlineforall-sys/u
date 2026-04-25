ابدأ من هنا - نسخة Cloudflare النهائية الأقل استهلاكًا
=====================================================

هذه نسخة كاملة من التول، وليست باتش.
الهدف: أقل استهلاك ممكن على Cloudflare مع الحفاظ على الواجهة واللوجك الأساسي بدون كسر.

ما تم الحفاظ عليه بدون لمس:
- public/index.html
- public/app.js
- public/styles.css
- ترتيب الواجهة
- لوجك التول الأساسي
- Login والحماية الحالية
- ربط Supabase الحالي

التعديلات المهمة:
1) إلغاء Polling المتكرر لرسائل الأدمن.
   بدل طلب كل 25 ثانية، الرسائل أصبحت تصل من Supabase Realtime.

2) إزالة فحص Netlify/Vercel القديم من support-chat.js.
   لم يعد التول يجرب /.netlify/functions أو يعمل ping عند الفتح.

3) تثبيت API base على:
   /api

4) الحفاظ على حماية الدخول من middleware.
   صفحات HTML والـ API محمية بالـ login.
   ملفات JS/CSS/images/fonts لا تمر على middleware لتقليل استهلاك Worker.

خطوات التشغيل كجاهل:
====================

أولًا: GitHub
1) اعمل GitHub Repo جديد.
2) فك ضغط ملف ZIP على جهازك.
3) ارفع محتويات الملف بعد فك الضغط داخل الريبو، وليس ملف ZIP نفسه.
4) اعمل Commit.

ثانيًا: Cloudflare
1) افتح Cloudflare.
2) ادخل Workers & Pages.
3) Create application.
4) Import repository.
5) اختار الريبو الجديد.
6) الإعدادات:
   - Build command: اتركها فارغة إن ظهرت.
   - Deploy command: npm run deploy
7) أضف Environment Variables التالية حسب بياناتك الحالية:
   BASIC_AUTH_USER
   BASIC_AUTH_PASS
   SESSION_SECRET
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   ADMIN_PASSWORD
8) اضغط Deploy.

ثالثًا: Supabase
1) استخدم نفس مشروع Supabase الحالي، لا تعمل مشروع جديد.
2) افتح Supabase > SQL Editor.
3) افتح ملف SUPABASE_REALTIME_ANNOUNCEMENTS.sql من هذه النسخة.
4) انسخ محتواه واضغط Run مرة واحدة فقط.

ملاحظات أمان مهمة:
==================
- لا تضع SUPABASE_SERVICE_ROLE_KEY في أي متغير يبدأ بـ NEXT_PUBLIC.
- الرسائل الإدارية أصبحت تقرأ عبر Supabase Realtime؛ هذا لا يسمح للمستخدمين بالكتابة أو الحذف.
- لو عايز حماية أقوى لكل ملفات static نفسها، استخدم Cloudflare Access، لكن هذا اختيار إضافي وليس مطلوبًا لتشغيل التول.
