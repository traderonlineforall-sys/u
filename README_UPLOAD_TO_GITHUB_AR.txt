طريقة رفع التعديل على GitHub بدون رفع المشروع كله:

1) افتح repo بتاعك على GitHub.
2) اضغط Add file ثم Upload files.
3) فك ضغط هذا الملف على جهازك.
4) ارفع الملفات بنفس المسارات الموجودة داخل هذا المجلد.
   مثال: الملف app/api/login/route.js لازم يروح لنفس المسار app/api/login/route.js في GitHub.
5) اكتب commit message مثل:
   Step 1 security hardening
6) اضغط Commit changes.
7) Cloudflare هيسحب من GitHub ويعمل Deploy تلقائي.

بعد الرفع لازم تضيف secrets في Cloudflare Pages/Workers:
- SESSION_SECRET
- ADMIN_PASSWORD
- ADMIN_SESSION_SECRET

مهم: خليهُم 3 قيم مختلفة وقوية. لا تستخدم BASIC_AUTH_PASS كبديل لهم.
