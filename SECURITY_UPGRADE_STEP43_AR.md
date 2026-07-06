# Step 4.3 — Device Confidence Nickname Lock

الغرض من الخطوة دي: تقليل تغيير الكنية بعد مسح الكوكيز بدون أكواد وبدون حسابات منفصلة.

## الفكرة

عند تسجيل الدخول، المتصفح يرسل إشارات جهاز غير حساسة، والسيرفر يضيف IP الخارجي القادم من Cloudflare، ثم يحسب Hash مشفر. لا يتم تخزين MAC ولا IP داخلي ولا IP صريح.

الإشارات المستخدمة:

- IP الخارجي من Cloudflare كـ hash فقط
- User-Agent
- اللغة واللغات
- النظام/platform والـ vendor
- timezone
- screen size و pixel ratio و color depth
- touch support
- hardware concurrency و device memory لو المتصفح أتاحهم
- WebGL vendor/renderer كملخص
- canvas hash
- fonts measurement hash
- plugins hash

## السلوك

- أول مرة: المستخدم يكتب كنية.
- بعد كده: نفس الجهاز/المتصفح بدرجة ثقة عالية يرجع لنفس الكنية حتى لو الكوكيز اتمسحت.
- لو الأدمن عمل Reset nickname: يتم تعطيل بصمات الجهاز لهذا المستخدم ويُطلب منه كنية جديدة.
- لو الثقة ضعيفة أو فيه تشابه بين جهازين: التول لا يخمن، ويطلب كنية بدل ما يدي اسم غلط.

## استهلاك Cloudflare

مفيش polling. الحساب بيحصل وقت تسجيل الدخول فقط، فالاستهلاك الإضافي قليل جدًا.

## التركيب

1. ارفع `apply-step43-device-confidence.yml` إلى:

```text
.github/workflows/apply-step43-device-confidence.yml
```

2. شغّل GitHub Action.
3. انتظر Cloudflare Deploy ينجح.
4. افتح ملف SQL:

```text
SUPABASE_DEVICE_CONFIDENCE_STEP43.sql
```

وشغله من Supabase SQL Editor.

## الاختبار

1. افتح التول وسجل دخول بكنية موجودة.
2. اعمل Logout.
3. امسح Cookies / Site Data.
4. افتح التول وسجل دخول بنفس اليوزر والباسورد، واترك الكنية فارغة.
5. المفروض يرجع نفس الكنية تلقائيًا لو درجة الثقة عالية.
6. افتح لوحة الأدمن وتأكد أن الكنية ظاهرة ومعها Device confidence.
7. جرّب Reset nickname لمستخدم تجريبي؛ بعدها يجب أن يطلب كنية جديدة.

## الطوارئ

لو حصلت مشكلة بعد SQL، شغل:

```text
SUPABASE_DEVICE_CONFIDENCE_STEP43_ROLLBACK.sql
```
