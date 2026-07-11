# Primary Device Owner Identity v3

## النتيجة الأمنية

تسجيل الدخول لا يقبل كنية أو `user_id` من المتصفح. بعد نجاح اسم المستخدم وكلمة المرور العامين، يحدد الخادم المالك بواسطة Credential عشوائية مخزنة في Cookie آمنة أو بواسطة استمرار المفتاح المحلي العشوائي المرتبط خادميًا، ثم يقرأ `display_name` الحالي من `support_users` وينشئ جلسة مستخدم مسجلة وقابلة للإلغاء.

فتح حساب خاطئ أعلى تكلفة من طلب اختيار أو رفض آمن. لذلك لا تستخدم خصائص أسطول الشركة المتجانسة لإثبات الملكية، ولا تسمح لقرار احتمالي أو اختيار متكرر بتقوية نفسه.

## ما كان موجودًا قبل v3

النقاط المفيدة التي تم الاحتفاظ بها:

- HMAC للجلسات وCookies من نوع `HttpOnly`.
- معرف مستخدم ثابت في جداول المستخدمين والأجهزة.
- خصائص جهاز مجزأة خادميًا بدل تخزين القيم الخام في معظم الحقول.
- قراءة الكنية من `support_users` في أجزاء من المسار القديم.

المخاطر التي عالجها v3:

- كان login يقبل `user_id` وكنية حرة من المتصفح.
- كانت استجابة login تكشف معرف المستخدم وطريقة الهوية والدرجات.
- كان ربط الجهاز القديم قابلًا لإعادة الربط من مفتاح محلي غير موثوق.
- كانت تذكرة recovery تحمل بيانات قابلة للقراءة، بلا استهلاك ذري أو منع replay خادمي.
- كان rate limiting في ذاكرة العملية، ويمكن تجاوزه بين Cloudflare isolates.
- كان التعلم الاحتمالي يرفع الثقة بواسطة `match_count` والحداثة ونتائج مشتقة من قراراته السابقة.
- كان logout يمسح Cookie فقط بلا سجل جلسات قابل للإلغاء، ولم يوجد مسار منفصل كامل لنسيان الجهاز.
- كان middleware يتحقق من توقيع token من دون تقييد الدور والإصدار بصورة كافية.

السجلات القديمة لم تُرقَّ إلى ملكية مؤكدة. لأنها نشأت من هوية أرسلها العميل، تُرحّل إلى `enrolled_from_verified_selection` و`legacy_client_enrollment`، وتبقى غير قابلة للتقوية أو تغيير المالك تلقائيًا.

## نموذج الهوية والملكية

- `support_device_identities.user_id` هو مصدر حقيقة المالك.
- `device_key_hash` فريد، ومشتق بخادم من مفتاح متصفح عشوائي عالي entropy.
- `owner_display_name_snapshot` و`display_name` تاريخ عرض فقط، ولا يدخلان في قرار المالك.
- الكنية الحالية تُقرأ في كل login من `support_users` بعد التحقق من `account_status` و`nickname_reset_required`.
- `support_device_credentials` يحتوي HMAC للسر فقط، مع current/previous rotation ونافذة overlap قصيرة وحقول إلغاء وتعليق واكتشاف replay.
- Credential في المتصفح بصيغة `v2.<opaque credential id>.<random secret>`؛ لا تحمل `user_id` أو `device_id`.
- قيد `device_key_hash` الفريد، وقفل/تحقق RPC، والتعامل مع خطأ `23505` يمنعون استبدال المالك أو سباق enrollment الصامت.
- Trigger في Postgres يجعل `user_id` للهوية غير قابل للتغيير ويمنع إعادة تنشيط revoked/conflicted أو ترقية selection إلى verified بلا حالة promotion مستقلة.

حالات المالك:

- `verified_device_owner`: ملكية أكّدها مصدر مستقل مصرح به.
- `enrolled_from_verified_selection`: Enrollment تشغيلي محدود الثقة.
- `promoted_after_independent_confirmation`: ترقية مستقبلية بدليل مستقل.
- `conflicted`: إيقاف الدخول التلقائي حتى المراجعة.
- `revoked`: الجهاز منسي أو ملغى.

الترقية لا تحدث بسبب كثرة الاستخدام أو الاختيار. المصادر الوحيدة التي تسمح بها السياسة هي `independent_admin_confirmation` أو `managed_device_attestation`، ولا يوجد مسار عميل يستطيع إرسال هذين المصدرين.

## سياسة القرار

- `AUTO_LOGIN_VERIFIED`: Credential الحالية صالحة وغير منتهية أو ملغاة، وسجل الجهاز والمالك والحساب صالحون. يحدث rotation وتُقرأ الكنية الحالية ولا تظهر اختيارات.
- `AUTO_LOGIN_RECOVERED`: استمرار دقيق للمفتاح المحلي العشوائي المرتبط خادميًا أو، مستقبلًا فقط، مجموعتا Credential مستقلتان مع تاريخ مؤكد وmargin كبير وبلا تعارض أو lineage دائري.
- `SELECTION_REQUIRED`: يوجد مرشحان أو ثلاثة فقط فوق حدود الاختيار، ولا يوجد مالك مؤكد متعارض.
- `INSUFFICIENT_EVIDENCE` و`NEW_DEVICE`: لا تخمين ولا قائمة ضعيفة ولا كنية حرة.
- `CONFLICTED`: تعارض مالك، أو تكرار rotation في سياقين مختلفين خلال نافذة قصيرة بعد risk سابق. فشل حفظ التعارض نفسه يفشل الطلب مغلقًا.
- `REJECTED`: Credential ملغاة/منتهية أو حساب غير نشط أو سياق غير صالح.

الاسترجاع الاحتمالي من مواصفات fleet وحدها معطل فعليًا: login يمرر صفر مجموعات Credential مستقلة، حتى مع `full`. الخصائص المتشابهة ترتب قائمة قصيرة فقط ولا تنشئ جلسة تلقائية.

## Recovery وEnrollment

التذكرة:

- عمرها خمس دقائق، ومربوطة بـ attempt وnonce وCookie محاولة `HttpOnly` منفصلة.
- تخزن الخيارات ومعرفات المستخدم والحد الأدنى للدرجة في Postgres فقط.
- تعرض للمتصفح `choice_id` عشوائيًا و`display_name` فقط.
- لا تحمل UID أو score أو evidence داخل token الموقع.
- تسمح بتغير fingerprint كسياق مخاطرة، ولا تربطه بتطابق حرفي هش.
- يعيد الخادم حساب ترتيب المرشحين ويتحقق من المالك والحساب قبل الاستهلاك.
- RPC `sr_consume_device_recovery_ticket` يقفل الصف ويستهلكه مرة واحدة ذريًا.
- قرار القائمة القصيرة هو `parent_decision_id` لقرار الجلسة الناتج، لمنع lineage دائري.

الاختيار الصحيح بلا مالك متعارض يبدأ `enrolled_from_verified_selection` ويصدر Credential جديدة، فيسمح fast path لاحقًا. لكنه يبقى `can_strengthen=false` مهما تكرر، ولا يتغلب على مالك مختلف.

## منع التعلم الدائري

- كل قرار يسجل source وtruth level وalgorithm/policy versions وevidence groups وlineage وparent و`executed` و`can_strengthen`.
- الجلسة لا تُسجّل في registry إلا بعد إنشاء قرار audit، ولا يوسم القرار `executed=true` إلا بعد نجاح التسجيل.
- جلسة selection أو recovery لا تحدث legacy confidence store.
- `match_count` والحداثة وكثرة observations لا تزيد score.
- Shadow أو قرار مشتق لا يكتب تعلمًا إيجابيًا.
- تغير سياق واحد مع Credential صحيحة لا ينشئ Conflict؛ يمنع التقوية فقط. تكرار overlap في سياقين مختلفين ضمن فترة قصيرة هو الإشارة الأقوى التي تعلق Credential.

## Session وLogout وForget

- Token المستخدم يجب أن يحمل `role=user` و`session_version=2` و`uid/sid`.
- كل API محمي يتحقق من HMAC ثم من `support_auth_sessions` ثم من حالة المستخدم الحالية.
- Admin/recovery tokens لا تقبلها APIs المستخدم حتى لو استعملت secret متداخلة.
- تعليق الحساب أو reset أو انتهاء/إلغاء الجلسة يوقف الطلبات.
- middleware يمنع الأدوار والإصدارات الأخرى عند حافة التطبيق؛ التحقق الخادمي من الإلغاء يتم في كل API محمي. قد يرى حامل token ملغاة shell ثابتة فقط، لكن لا يحصل على بيانات API.
- logout يلغي الجلسة ومحاولة recovery ويزيل Session Cookie، ولا يمسح Credential الجهاز.
- إذا تعذر الإلغاء الخادمي، تُمسح الجلسة المحلية لكن تعاد حالة 503 صريحة بدل نجاح كاذب.
- `/device-settings` يوفر logout منفصلًا وForget Device. النسيان يتحقق من Credential أو من `decision_id` الموقع للجلسة، ثم RPC يلغي هوية الجهاز وجميع Credentials والجلسات المرتبطة، وبعد النجاح يمسح المتصفح المفتاح المحلي.

## Clone وWebAuthn

لا يستطيع تطبيق ويب تقليدي إثبات أي نسخة هي الجهاز الفيزيائي الأصلي إذا نُسخت Cookie والسر المحلي وBrowser Profile كاملة. v3 يقلل الخطر بواسطة rotation، overlap قصير، revocation، optimistic version checks، risk history وتعليق عند تكرار سياقين متعارضين. لا يدعي حل النسخ الكامل.

لا توجد في المشروع بنية Managed Device Certificate أو WebAuthn/Platform Authenticator مسجلة، وإضافتها ستحتاج enrollment وإدارة مفاتيح وتغييرًا تشغيليًا خارج هذه المهمة. هي المسار المناسب مستقبلًا لإثبات غير قابل للتصدير إذا كانت إدارة أجهزة الشركة توفره.

`keyboard_hash` القديم مشتق من Keyboard Layout العام عبر `getLayoutMap`، لا من ضغطات المستخدم أو النصوص. لا تُجمع كلمات مرور أو clipboard أو ملفات أو كاميرا أو ميكروفون أو محتوى نماذج.

## Migration

الملفات:

1. `SUPABASE_PRIMARY_DEVICE_OWNER_IDENTITY_V3.sql`
2. `SUPABASE_PRIMARY_DEVICE_OWNER_IDENTITY_V3_ROLLBACK.sql`

الترتيب الآمن:

1. أخذ نسخة احتياطية والتحقق من تطبيق migrations السابقة لـ `support_users` و`support_device_identities`.
2. ضبط `DEVICE_IDENTITY_V2_MODE=off` أو `shadow` و`DEVICE_RECOVERED_AUTO_LOGIN_ENABLED=false`.
3. تشغيل migration v3 كمعاملة واحدة.
4. نشر الكود مع جميع الأسرار الجديدة.
5. البدء بـ `verified_only`.
6. مراقبة `CONFLICTED` و`REJECTED` وselection/insufficient decisions قبل أي تغيير.
7. لا يُفعّل `full` إلا بعد وجود أدلة مستقلة وبيانات إنتاج مؤكدة؛ الكود الحالي لا يمنح fingerprint وحدها auto-login حتى في هذا الوضع.

الوضعان `off` و`shadow` يوقفان selection والاسترجاع الاحتمالي الجديد، لكنهما يبقيان fast path القطعي لـ Credential الخادمية حتى لا يتوقف المستخدمون الموثوقون. `shadow` يسجل القرار الاحتمالي من دون enrollment أو تعلم إيجابي.

الجداول الحساسة مفعّل عليها RLS، ومنزوعة الصلاحيات من `public/anon/authenticated`، وممنوحة صراحةً لـ `service_role` فقط. RPCs ذات `security definer` منزوعة التنفيذ من أدوار المتصفح.

ينظف limiter انتهازيًا rate rows القديمة وتذاكر recovery المنتهية منذ سبعة أيام والجلسات المنتهية منذ ثلاثين يومًا. قرارات التدقيق والتعارضات لا تُحذف تلقائيًا لأنها أدلة حوادث؛ يجب تحديد مدة احتفاظ مؤسسية لها ومراجعتها دوريًا.

متغيرات البيئة المطلوبة:

- `BASIC_AUTH_USER`, `BASIC_AUTH_PASS`
- `SESSION_SECRET`, `SESSION_REGISTRY_SECRET`
- `DEVICE_IDENTITY_SECRET`, `DEVICE_CREDENTIAL_PEPPER`, `DEVICE_FINGERPRINT_SECRET`
- `RATE_LIMIT_SECRET`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `DEVICE_IDENTITY_V2_MODE=verified_only`
- `DEVICE_RECOVERED_AUTO_LOGIN_ENABLED=false`
- `AUTH_SESSION_REGISTRY_REQUIRED=true`

كل secret أمني يجب أن يكون عشوائيًا مستقلًا بطول 32 byte على الأقل. القيم القصيرة تفشل مغلقًا.

## Rollback

1. ضبط mode على `off` ونشر نسخة التطبيق السابقة إذا كان rollback كاملًا.
2. تشغيل ملف rollback؛ يلغي Credentials والجلسات ويوقف التذاكر غير المستخدمة.
3. الاحتفاظ بالجداول وقرارات audit/conflicts للتحليل، وعدم حذف الأدلة.
4. تدوير secrets إذا كان سبب rollback حادث تسريب.

الـ rollback غير هدّام للبيانات، ولا يعيد كتابة مالك أو يمحو تاريخ التدقيق.

## التحقق والقيود

Baseline قبل التعديل:

- `npm ci`: نجح بعد استخدام cache قابل للكتابة.
- `npm test`: 20/20 ناجحة.
- `npm run build`: نجح.
- `npm run lint`: لم يعمل آليًا لأن `next lint` يفتح معالج إعداد ESLint ولا توجد تهيئة lint في المستودع؛ هذه حالة baseline وليست regression.

اختبارات v3 تغطي policy والتوقيع والتلاعب بالتذكرة وتغير context وlineage و10 أجهزة متطابقة وstorage loss وowner overwrite وlegacy migration وrotation/replay وlogout/forget وRLS وrate limiting وحالة الحساب والخصوصية. لا تدعي fixtures المصطنعة دقة إنتاجية أو نسبة auto-login.

التحقق النهائي من تثبيت نظيف:

- `npm ci`: نجح، وثبّت 850 حزمة.
- `npm test`: 39/39 ناجحة، بلا failed/skipped/todo.
- `npm run build`: نجح؛ 23 صفحة/route، ونجح فحص Next للترجمة والأنواع.
- `CI=1 npm run lint`: لم يُنفذ lint لأن `next lint` طلب إنشاء تهيئة ESLint تفاعليًا ثم خرج برمز 1؛ نفس قيد baseline، وليس فشل lint على الملفات.

لم تتوفر قاعدة Supabase اختبارية أو `psql` أو Docker في بيئة التنفيذ، لذلك لم يُشغّل Integration test حقيقي للمigration/RPC، ولم توجد بنية Browser E2E. يجب تجربة migration أولًا على Supabase staging والتحقق من RPCs وRLS وconcurrent ticket consumption قبل الإنتاج.

توجد نقطة توافق قديمة خارج قرار login/recovery: `/api/support-profile` يعيد معرف المستخدم الحالي بعد جلسة مصادق عليها لأن واجهة المحادثة القديمة تستخدمه لتمييز عناصر العرض. هذا المعرف لا يقبل كدليل login أو ملكية أو write authorization؛ كل عمليات الكتابة تستمد UID من الجلسة. إزالته كليًا تحتاج تحويل واجهة المحادثة إلى actor handle عام منفصل.
