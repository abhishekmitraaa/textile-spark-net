-- ─────────────────────────────────────────────────────────────────────────────
-- RFQ/leads R2: the same leads on every plan (Mitra, 2026-10-02).
-- documentation/rfq-leads-pipeline-design-2026-10-02.md, "R2".
--
-- 1. The lead cap is off. enforce_lead_cap() lets a quote through when the plan's
--    leads_per_month is below 0, so -1 on all five plans switches it off without
--    dropping the trigger; a cap could come back later as a data change.
--    display.leads says "Unlimited" so nothing that still reads it shows a number.
--    get_vendor_plan() is unchanged and reports -1.
-- 2. Seven FAQ answers promised a lead cap, pay-per-lead plans or plan-dependent lead
--    access. Each is rewritten in English, Hindi and Gujarati (faqs.translations), so
--    the snapshot (trg_faqs_snapshot) and the app show the new text in all three.
--    One answer also claimed email/WhatsApp lead alerts; nothing sends those today
--    (claude.md, "No quote, message or RFQ event notifies anyone").
-- Harness: scripts/rfq-leads/r2_same_leads.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. The cap ──────────────────────────────────────────────────────────────
update public.subscription_plans
   set limits  = jsonb_set(limits, '{leads_per_month}', '-1'::jsonb),
       display = jsonb_set(display, '{leads}', '"Unlimited"'::jsonb);

-- ── 2. The FAQ ──────────────────────────────────────────────────────────────
-- Subscription and Seller Help: "What happens when I reach my lead limit?"
update public.faqs
   set question = $q$Is there a limit on how many leads I can quote on?$q$,
       answer   = $a$No. Every plan, Free included, can quote on as many buyer requirements as you like. Your plan doesn't change which requirements you see or the order they're in.$a$,
       translations = jsonb_build_object(
         'hi', jsonb_build_object(
           'question', $q$क्या लीड पर कोटेशन भेजने की कोई सीमा है?$q$,
           'answer',   $a$नहीं। मुफ़्त प्लान समेत हर प्लान पर आप जितनी चाहें उतनी खरीदार आवश्यकताओं पर कोटेशन भेज सकते हैं। आपका प्लान यह नहीं बदलता कि आपको कौन-सी आवश्यकताएँ दिखती हैं या वे किस क्रम में दिखती हैं।$a$),
         'gu', jsonb_build_object(
           'question', $q$લીડ પર ક્વોટ મોકલવાની કોઈ મર્યાદા છે?$q$,
           'answer',   $a$ના. મફત પ્લાન સહિત દરેક પ્લાન પર તમે ઇચ્છો તેટલી ખરીદારની જરૂરિયાતો પર ક્વોટ મોકલી શકો છો. તમારો પ્લાન એ બદલતો નથી કે તમને કઈ જરૂરિયાતો દેખાય છે કે તે કયા ક્રમમાં દેખાય છે.$a$))
 where id in ('8df64c7b-3c9a-4903-ac60-c42c4f15cdff', '28d6da8b-e415-4f5f-bc72-07956978bbcb')
    -- Seller Help's rows were inserted with generated ids (20261002104949), so a copy of the
    -- database has its own; the question finds them there too.
    or (surface in ('subscription', 'seller_help') and question = $q$What happens when I reach my lead limit?$q$);

-- Seller Help: "What counts as a lead?"
update public.faqs
   set answer = $a$A lead is a buyer's open requirement that you can quote on. There's no limit on any plan. Requests a buyer sends to you directly have their own list on the Leads page.$a$,
       translations = jsonb_build_object(
         'hi', jsonb_build_object(
           'question', $q$लीड किसे गिना जाता है?$q$,
           'answer',   $a$लीड किसी खरीदार की खुली आवश्यकता है जिस पर आप कोटेशन भेज सकते हैं। किसी भी प्लान पर कोई सीमा नहीं है। कोई खरीदार सीधे आपको जो अनुरोध भेजता है, वे लीड्स पेज पर अपनी अलग सूची में दिखते हैं।$a$),
         'gu', jsonb_build_object(
           'question', $q$લીડ કોને ગણવામાં આવે છે?$q$,
           'answer',   $a$લીડ એટલે કોઈ ખરીદારની ખુલ્લી જરૂરિયાત જેના પર તમે ક્વોટ મોકલી શકો છો. કોઈ પણ પ્લાન પર કોઈ મર્યાદા નથી. કોઈ ખરીદાર સીધી તમને જે વિનંતીઓ મોકલે છે, તે લીડ્સ પેજ પર તેમની અલગ યાદીમાં દેખાય છે.$a$))
 where id = '8b7e9d19-0058-48dd-9d47-6599ec213aa9'
    or (surface = 'seller_help' and question = $q$What counts as a lead?$q$);

-- Subscription: "Lowest billing plan?"
update public.faqs
   set answer = $a$Yes! Plans start at just ₹699/month (or ₹6,990/year) with Basic: 10 product listings. Just getting started? Our Free plan costs nothing and gives you 2 listings. Every plan can quote on unlimited buyer leads. Prices exclude GST.$a$,
       translations = jsonb_build_object(
         'hi', jsonb_build_object(
           'question', $q$सबसे कम बिलिंग प्लान?$q$,
           'answer',   $a$हाँ! प्लान केवल ₹699/माह (या ₹6,990/वर्ष) से शुरू होते हैं, बेसिक में: 10 उत्पाद लिस्टिंग। अभी शुरुआत कर रहे हैं? हमारा मुफ़्त प्लान कुछ नहीं लेता और 2 लिस्टिंग देता है। हर प्लान पर आप असीमित खरीदार लीड पर कोटेशन भेज सकते हैं। कीमतों में GST शामिल नहीं है।$a$),
         'gu', jsonb_build_object(
           'question', $q$સૌથી ઓછો બિલિંગ પ્લાન?$q$,
           'answer',   $a$હા! પ્લાન ફક્ત ₹699/મહિનો (અથવા ₹6,990/વર્ષ)થી શરૂ થાય છે, બેઝિકમાં: 10 ઉત્પાદન લિસ્ટિંગ. હમણાં શરૂઆત કરો છો? અમારો મફત પ્લાન કંઈ લેતો નથી અને 2 લિસ્ટિંગ આપે છે. દરેક પ્લાન પર તમે અમર્યાદિત ખરીદાર લીડ્સ પર ક્વોટ મોકલી શકો છો. કિંમતોમાં GST શામેલ નથી.$a$))
 where id = '8394ec5f-babe-43b9-aecc-5720de8532b7';

-- Seller registration: "Is there any cost to register?" (drops the pay-per-lead bullet)
update public.faqs
   set answer = $a$NO, Basic registration is free. You only pay if you opt for:
• Premium listings
• Featured vendor badges$a$,
       translations = jsonb_build_object(
         'hi', jsonb_build_object(
           'question', $q$क्या पंजीकरण की कोई लागत है?$q$,
           'answer',   $a$नहीं, बेसिक पंजीकरण मुफ़्त है। आप केवल तभी भुगतान करते हैं जब आप चुनते हैं:
• प्रीमियम लिस्टिंग
• फ़ीचर्ड विक्रेता बैज$a$),
         'gu', jsonb_build_object(
           'question', $q$શું નોંધણીનો કોઈ ખર્ચ છે?$q$,
           'answer',   $a$ના, બેઝિક નોંધણી મફત છે. તમે ત્યારે જ ચુકવણી કરો છો જ્યારે તમે પસંદ કરો:
• પ્રીમિયમ લિસ્ટિંગ
• ફીચર્ડ વિક્રેતા બેજ$a$))
 where id = '92465a9f-516b-4250-a27d-daa2d64a4629';

-- Seller registration: "How are leads managed on Cosora?"
update public.faqs
   set answer = $a$Buyer requirements appear on your Leads page, ranked to fit your catalogue. Every plan sees the same requirements and can quote on all of them.$a$,
       translations = jsonb_build_object(
         'hi', jsonb_build_object(
           'question', $q$कोसोरा पर लीड कैसे संभाली जाती हैं?$q$,
           'answer',   $a$खरीदारों की आवश्यकताएँ आपके लीड्स पेज पर दिखती हैं, आपके कैटलॉग से मेल के हिसाब से क्रम में। हर प्लान को वही आवश्यकताएँ दिखती हैं और वह उन सभी पर कोटेशन भेज सकता है।$a$),
         'gu', jsonb_build_object(
           'question', $q$કોસોરા પર લીડ્સ કેવી રીતે સંભાળાય છે?$q$,
           'answer',   $a$ખરીદારોની જરૂરિયાતો તમારા લીડ્સ પેજ પર દેખાય છે, તમારા કેટલોગ સાથેના મેળ પ્રમાણે ક્રમમાં. દરેક પ્લાનને એ જ જરૂરિયાતો દેખાય છે અને તે બધી પર ક્વોટ મોકલી શકે છે.$a$))
 where id = '74229530-ef50-48c8-b100-8221f067d59b';

-- Seller registration: "I don't have a GST number. Can I still register?"
update public.faqs
   set answer = $a$Yes, but your account will be marked as "Unverified Seller", which may affect visibility. We recommend registering your business officially.$a$,
       translations = jsonb_build_object(
         'hi', jsonb_build_object(
           'question', $q$मेरे पास GST नंबर नहीं है। क्या मैं फिर भी पंजीकरण कर सकता हूँ?$q$,
           'answer',   $a$हाँ, पर आपका खाता "असत्यापित विक्रेता" के रूप में मार्क होगा, जिससे दृश्यता पर असर पड़ सकता है। हम अपने व्यवसाय का आधिकारिक पंजीकरण करवाने की सलाह देते हैं।$a$),
         'gu', jsonb_build_object(
           'question', $q$મારી પાસે GST નંબર નથી. શું હું તો પણ નોંધણી કરી શકું?$q$,
           'answer',   $a$હા, પણ તમારું ખાતું "અચકાસાયેલ વિક્રેતા" તરીકે ચિહ્નિત થશે, જેનાથી દૃશ્યતા પર અસર પડી શકે. અમે તમારા વ્યવસાયની સત્તાવાર નોંધણી કરાવવાની ભલામણ કરીએ છીએ.$a$))
 where id = '0bcaaa6a-5316-4ff1-a3a2-eeb043a69b57';

-- ── Self-check ──────────────────────────────────────────────────────────────
do $check$
declare
  v_bad text;
begin
  select string_agg(id, ', ') into v_bad from public.subscription_plans
   where coalesce((limits ->> 'leads_per_month')::int, 0) <> -1;
  if v_bad is not null then
    raise exception 'R2 self-check: plans still capped: %', v_bad;
  end if;
  select string_agg(left(question, 60), ' | ') into v_bad from public.faqs
   where active and (question || ' ' || answer) ~* '(lead limit|leads a month|pay-per-lead|lead access)';
  if v_bad is not null then
    raise exception 'R2 self-check: FAQ still promises a cap: %', v_bad;
  end if;
end
$check$;
