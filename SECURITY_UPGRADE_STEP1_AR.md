# ترقية أمنية - الخطوة 1

هذا الملف يشرح التعديلات التي اتعملت في نسخة Step 1.

## ماذا تغير؟

1. تم إلغاء استخدام `BASIC_AUTH_PASS` كبديل لـ `SESSION_SECRET`.
   - لازم يكون عندك `SESSION_SECRET` مستقل وقوي.

2. تم إلغاء استخدام `BASIC_AUTH_PASS` كبديل لـ `ADMIN_PASSWORD`.
   - لازم يكون عندك `ADMIN_PASSWORD` مستقل وقوي.

3. تم إضافة Admin Session Cookie.
   - الأدمن يدخل الباسورد مرة واحدة فقط.
   - بعد كده طلبات الأدمن تستخدم cookie آمنة `HttpOnly` بدل إرسال الباسورد مع كل request.

4. تم إضافة تحقق session داخل API routes الحساسة، وليس الاعتماد على middleware فقط.

5. تم إضافة endpoints جديدة:
   - `/api/admin-login`
   - `/api/admin-logout`

## مهم قبل النشر

لازم تضيف الأسرار التالية في Cloudflare / Wrangler:

```bash
npx wrangler secret put BASIC_AUTH_USER
npx wrangler secret put BASIC_AUTH_PASS
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

## توليد أسرار قوية

على جهازك شغّل:

```bash
node -e "console.log(crypto.randomUUID() + crypto.randomUUID())"
```

استخدم ناتج مختلف لكل واحد من:

- `SESSION_SECRET`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

لا تستخدم نفس كلمة السر لأكثر من قيمة.

## طريقة الاختبار

```bash
npm install
npm run build
npm run preview
```

بعد فتح الموقع:

1. جرّب تسجيل الدخول الأساسي.
2. افتح لوحة الأدمن.
3. اكتب Admin Password مرة واحدة.
4. جرّب حذف/حظر/إعلان.
5. اقفل لوحة الأدمن وافتحها تاني للتأكد أن logout يعمل.

## ملاحظات مهمة

هذه ليست النهاية. ما زال مطلوب في الخطوة 2:

- ضبط Supabase RLS لكل الجداول.
- تقليل الكتابة المباشرة من المتصفح إلى Supabase.
- تثبيت مكتبات CDN وإزالة `@latest`.
- تقوية CSP تدريجيًا.
