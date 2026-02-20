⚠️  IMPORTANT (Core Locked)

- الملف public/app.js هو قلب التول (Core Logic):
  سحب الرقم الأرضي/الـFBB, فتح الروابط, التاجز, و OCR.

- لتجنب كسر التول مستقبلًا:
  1) لا تعدّل public/app.js نهائيًا.
  2) أي إضافة SR جديدة أو ترتيب/واجهة يتم في:
     - public/index.html
     - public/styles.css
  3) لو محتاج تعديل في اللوجك أو إصلاح Bug — ابعت الـ zip كما هو وسنعدل بشكل مُتحكم.

- OCR (Call Back): الناتج الآن RAW TEXT فقط (بدون Template).

- ملاحظة: أي Syntax Error في app.js سيوقف كل وظائف التول (ومنها Tags).
