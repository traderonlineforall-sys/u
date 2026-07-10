# Step 4.4 - Enhanced Device Confidence + Smooth Nickname Recovery

التحديث ده بيقوي استرجاع الكنية بعد مسح الكوكيز بدون ما يطلب من المستخدم كتابة كنية إلا عند الحاجة.

## التغيير الأساسي

- نسبة الاسترجاع التلقائي أصبحت 80% بدل 88%.
- يوجد شرط أمان: لازم الفرق عن أقرب مستخدم آخر يكون 10% على الأقل.
- تم إضافة إشارات جديدة للجهاز والمتصفح لرفع الثقة وتقليل ظهور خانة الكنية.

## الإشارات الجديدة

- Client Hints من المتصفح إن كانت متاحة.
- Audio fingerprint.
- CSS media features مثل pointer/hover/color-gamut.
- Viewport details.
- Storage estimate buckets.
- Intl locale details.

## توزيع الثقة الحالي

- IP hash: 10%
- User-Agent: 13%
- Language: 5%
- Platform/capabilities: 10%
- Screen: 10%
- Timezone: 6%
- WebGL/graphics: 14%
- Canvas: 8%
- Fonts/plugins: 6%
- Client hints: 6%
- Media features: 4%
- Viewport: 3%
- Storage: 2%
- Audio: 3%

الإجمالي 100%.

## متى ترجع الكنية تلقائيًا؟

ترجع تلقائيًا إذا:

1. أفضل تطابق 80% أو أعلى.
2. لا يوجد مستخدم آخر قريب بفارق أقل من 10%.
3. الأدمن لم يعمل Reset nickname لهذا المستخدم.

## بعد الدبلوي

شغّل ملف SQL:

`SUPABASE_DEVICE_CONFIDENCE_STEP44.sql`

بعدها افتح التول بنفس الكنية الصحيحة مرة واحدة حتى يتعلم الجهاز بالإصدار الجديد.
