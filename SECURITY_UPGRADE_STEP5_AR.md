# Step 5 - Support & Suggestions Professional UX Upgrade

تحديث واجهة فقط لمربع الدعم ومربع الاقتراحات.

## الهدف

تحسين التجربة بدون زيادة استهلاك Cloudflare وبدون SQL وبدون تغيير قاعدة البيانات.

## الإضافات

- بحث داخل قائمة الأشخاص في الدعم.
- عداد Online/Total داخل الدعم.
- تحسين ظهور Online/Offline badges.
- بحث داخل الاقتراحات.
- ترتيب الاقتراحات حسب الأحدث أو الأكثر ردودًا أو اقتراحاتي.
- عداد حروف للرسائل والاقتراحات والردود.
- Toast notifications بدل الاعتماد الكامل على النصوص الصغيرة.
- Auto-grow للـ textareas.
- Empty states أنظف.
- تحسينات CSS خفيفة للموبايل والتابلت.

## الاستهلاك

التحديث Front-end فقط:

- لا يوجد API جديد.
- لا يوجد polling.
- لا يوجد SQL.
- لا يضيف استهلاك Cloudflare Functions.

## الاختبار

بعد الدبلوي:

1. افتح الدعم.
2. جرّب البحث عن اسم في People.
3. تأكد أن Online يظهر فوق كما في التحديث السابق.
4. جرّب كتابة رسالة وشوف عداد الحروف.
5. افتح الاقتراحات.
6. جرّب البحث داخل الاقتراحات.
7. جرّب Sort: Newest / Most replies / My suggestions.
8. أضف اقتراحًا أو ردًا وتأكد أن Toast يظهر.

## الرجوع

لو أردت الرجوع، احذف الملفين:

- public/support-suggestions-pro-ux.css
- public/support-suggestions-pro-ux.js

واحذف السطرين الخاصين بهم من public/index.html.
