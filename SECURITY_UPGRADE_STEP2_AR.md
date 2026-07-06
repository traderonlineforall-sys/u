# Step 2 Security Upgrade - Supabase RLS + Server Writes

هذه الخطوة تنقل الكتابة المهمة من المتصفح إلى API على السيرفر، ثم تقفل كتابة المتصفح المباشرة على جداول Supabase.

## ما الذي تغير؟

- إضافة API لإرسال الاقتراحات: `/api/public-suggestion`
- إضافة API للردود: `/api/public-suggestion-reply`
- إضافة API لتحديث اسم مستخدم الدعم: `/api/support-profile`
- إضافة API لإرسال رسائل الدعم: `/api/support-message`
- تعديل الواجهة لتستخدم هذه الـ APIs بدل الكتابة المباشرة في Supabase.
- إضافة ملف SQL يقفل anon insert/update/delete على الجداول بعد نشر الكود.

## ترتيب التنفيذ الصحيح

1. ارفع ملف GitHub Action الخاص بـ Step 2.
2. انتظر GitHub Action ينجح.
3. انتظر Cloudflare Deploy ينجح.
4. جرب الموقع قبل SQL:
   - إضافة اقتراح
   - رد على اقتراح
   - إرسال رسالة دعم عامة
   - إرسال DM إن كنت تستخدمها
   - تفاعل على اقتراح
5. بعد نجاح التجارب، افتح Supabase SQL Editor وشغل:

```sql
SUPABASE_RLS_STEP2_LOCK_WRITES.sql
```

6. جرب نفس الاختبارات مرة ثانية.

## لو حصل كسر بعد SQL

شغل ملف الرجوع الطارئ:

```sql
SUPABASE_RLS_STEP2_ROLLBACK_LEGACY_WRITES.sql
```

ثم ارسل الخطأ لمعالجته.

## ملاحظة مهمة

هذه خطوة قوية لكنها ليست النهاية. ما زال `user_id` في الواجهة legacy/local. الخطوة التالية Step 3 هي ربط `user_id` بهوية موقعة من السيرفر لمنع التزوير.
