# Update 023 — Store (المتجر) and Backpack (الحقيبة)

1. Owner: run `sql/023_store.sql` once in Voli's SQL Editor (needs update 009). Safe to run again.
2. Panel: "المتجر" page adds frames (Headwear) and rides (Ride) with picture, optional video, price, days,
   style tab (simple / romantic / luxury / theme) and for-sale switch. Member page shows the backpack with grant / remove.
3. Voli app (separate project) — paste this request there:

> أضف المتجر والحقيبة للتطبيق حسب صور الريفرنس (شاشة Store فيها تبويبين Headwear و Ride، وتحتهم تبويبات simple / Romantic / Luxury / Theme، وشبكة 3 أعمدة لكل منتج صورة واسم وسعر بالكوينز، ومعاينة الإطار على صورتي فوق، وتحت رصيدي وزر Purchase، وزر Backpack فوق. شاشة Backpack نفس التبويبات وكل منتج عليه شارة "13 days").
> قاعدة البيانات جاهزة (sql/023_store.sql في لوحة الإدارة):
> - المنتجات: `select * from store_items where active order by sort` — الأعمدة kind ('frame' أو 'ride')، style، name، price، days، art_url، video_url.
> - الشراء: `rpc('store_buy', { p_item })` يخصم الكوينز ويرجع تاريخ الانتهاء؛ الأخطاء hint: not_enough_coins، not_for_sale.
> - الحقيبة: `select *, store_items(*) from member_items where auth_id = me` — expires_at و equipped؛ الأيام المتبقية = تقريب لأعلى.
> - اللبس / الخلع: `rpc('store_equip', { p_item, p_on })` — واحد لكل نوع؛ hint not_owned لو انتهى.
> - المعروض على الآخرين: `member_items` بفلتر equipped و expires_at > now() (مسموح للكل يقرأ الملبوس فقط). اعرض الإطار حول صورة العضو في الغرفة والبروفايل والمقاعد، واعرض فيديو الدخولية (video_url وإلا art_url) عند دخوله الغرفة بنفس طريقة دخولية VIP.
