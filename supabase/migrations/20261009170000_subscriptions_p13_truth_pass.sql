-- Subscriptions P13: the final truth pass (plan "build every vendor subscription feature",
-- 2026-10-09). What the plans page and the FAQs tell sellers now matches what P0-P12 built.
--
-- 1. PLAN COPY. subscription_plans.display, every row of the comparison table, rewritten to what
--    each plan really gives: Silver has a shared account team (not a dedicated manager), the VIP
--    seal is "VIP trusted seller" (not "100% trusted"), SMS isn't promised (its provider isn't
--    set up), placement says "featured" and "rotating" as P10 built it, overseas requirements say
--    who sees them and VIP's 24-hour first look (P7). "products" is checked against the cap.
--    The copy describes features behind switches: apply this when those switches are on for
--    everyone (the release runbook's last step).
-- 2. FAQs. Five answers that are no longer true (no autopay; no grace days; every plan sees the
--    same requirements; a fixed price) are rewritten with their Hindi and Gujarati. Each is
--    matched on its question AND the md5 of the answer it replaces, so a copy an admin has edited
--    since is left alone and named in a notice.
-- 3. subscription_usage (no writer, no reader, empty) is retired: its grants are revoked. Dropping
--    the table is left to the SQL editor (the release path refuses DROP).
-- 4. P1's payment-mode shims are switched off: by now every function that writes an order or an
--    invoice says its mode (P1's were deployed with P1), so a missing mode is an error again
--    (payment_mode is not null). Disabled, not dropped (the release path refuses DROP).
-- Harness: scripts/subscriptions/p13_truth_pass.sql.

-- ── 1. Plan copy ───────────────────────────────────────────────────────────────────
update public.subscription_plans p set display = p.display || x.copy
  from (values
    ('free', jsonb_build_object(
       'products', '2', 'international', 'No', 'ad', 'None', 'trust', 'None', 'search', 'Standard',
       'account_manager', 'None', 'lead_channel', 'Website', 'alerts', 'None', 'crm', 'None')),
    ('basic', jsonb_build_object(
       'products', '10', 'international', 'No', 'ad', '1 state', 'trust', 'Verified seller',
       'search', 'Priority in your categories', 'account_manager', 'No',
       'lead_channel', 'Website + daily email summary', 'alerts', 'No', 'crm', 'No')),
    ('silver', jsonb_build_object(
       'products', '19', 'international', 'No', 'ad', '4 states', 'trust', 'Verified seller',
       'search', 'Featured in the top 10 (rotating)', 'account_manager', 'Shared account team',
       'lead_channel', 'Website + app + daily email', 'alerts', 'Instant, in the app', 'crm', 'Pipeline + follow-ups')),
    ('gold', jsonb_build_object(
       'products', '200', 'international', 'Yes', 'ad', 'Pan-India', 'trust', 'Gold verified seller',
       'search', 'Featured in the top 5 (rotating) + nearby buyers', 'account_manager', 'Named manager + priority support',
       'lead_channel', 'Website + app + WhatsApp + email', 'alerts', 'Instant, WhatsApp + email',
       'crm', 'Pipeline, follow-ups + analytics')),
    ('vip', jsonb_build_object(
       'products', 'Unlimited', 'international', 'Yes, 24-hour first look', 'ad', 'Pan-India + overseas buyers',
       'trust', 'VIP trusted seller', 'search', 'Spotlight + place 1 (rotating)',
       'account_manager', 'Named VIP manager + priority support', 'lead_channel', 'All channels, first in line',
       'alerts', 'Instant + sales concierge', 'crm', 'Gold''s CRM + monthly success review'))
  ) as x(id, copy)
 where p.id = x.id;

-- ── 2. FAQs ────────────────────────────────────────────────────────────────────────
do $faqs$
declare
  r record;
  n integer;
begin
  for r in
    select * from (values
      ('How does billing work — is there autopay?', '9bb91181cd9c6d3eb0a870519c57e1f1',
       'Autopay is optional. At checkout, "Renew automatically (autopay)" is ticked: Razorpay then renews your plan at the end of each month or year, and you can turn it off on the Subscription page. Without autopay, each period is a one-time payment: we remind you 7, 4, 2 and 1 days before it ends and on the day, and your plan keeps working for 7 more days. If you haven''t renewed by then, your account goes back to the Free plan.',
       'ऑटोपे आपकी मर्ज़ी पर है। चेकआउट पर "अपने आप रिन्यू करें (ऑटोपे)" पहले से चुना रहता है: तब Razorpay हर महीने या साल के अंत में आपका प्लान रिन्यू करता है, और आप इसे सब्सक्रिप्शन पेज से बंद कर सकते हैं। ऑटोपे के बिना हर अवधि एक बार का भुगतान है: अवधि ख़त्म होने से 7, 4, 2 और 1 दिन पहले और उसी दिन हम आपको याद दिलाते हैं, और आपका प्लान 7 दिन और चलता है। तब तक रिन्यू न करने पर आपका खाता मुफ़्त प्लान पर लौट आता है।',
       'ઑટોપે તમારી મરજી પર છે. ચેકઆઉટ વખતે "આપમેળે રિન્યૂ કરો (ઑટોપે)" પહેલેથી પસંદ કરેલું હોય છે: ત્યારે Razorpay દર મહિને કે વર્ષના અંતે તમારો પ્લાન રિન્યૂ કરે છે, અને તમે તેને સબ્સ્ક્રિપ્શન પેજ પરથી બંધ કરી શકો છો. ઑટોપે વિના દરેક અવધિ એક વખતની ચુકવણી છે: અવધિ પૂરી થવાના 7, 4, 2 અને 1 દિવસ પહેલાં અને તે જ દિવસે અમે તમને યાદ અપાવીએ છીએ, અને તમારો પ્લાન 7 દિવસ વધુ ચાલે છે. ત્યાં સુધીમાં રિન્યૂ ન કરો તો તમારું ખાતું મફત પ્લાન પર પાછું આવે છે.'),
      ('Does my plan renew by itself?', 'aae014b838b106a1226defacb7a7e04f',
       'Only with autopay. If "Renew automatically (autopay)" was ticked when you paid (it is by default), Razorpay renews your plan at the end of each period; you can turn it off on the Subscription page at any time. Without autopay, each month or year is a one-time payment you make yourself. When a period ends, your plan keeps working for 7 more days; after that your account goes back to the Free plan and its limits.',
       'सिर्फ़ ऑटोपे के साथ। अगर भुगतान करते समय "अपने आप रिन्यू करें (ऑटोपे)" चुना था (यह पहले से चुना रहता है), तो Razorpay हर अवधि के अंत में आपका प्लान रिन्यू करता है; आप इसे कभी भी सब्सक्रिप्शन पेज से बंद कर सकते हैं। ऑटोपे के बिना हर महीना या साल एक बार का भुगतान है जो आप ख़ुद करते हैं। अवधि ख़त्म होने के बाद आपका प्लान 7 दिन और चलता है; उसके बाद आपका खाता मुफ़्त प्लान और उसकी सीमाओं पर लौट आता है।',
       'ફક્ત ઑટોપે સાથે. ચુકવણી વખતે "આપમેળે રિન્યૂ કરો (ઑટોપે)" પસંદ કર્યું હતું (તે પહેલેથી પસંદ હોય છે), તો Razorpay દરેક અવધિના અંતે તમારો પ્લાન રિન્યૂ કરે છે; તમે તેને ક્યારેય પણ સબ્સ્ક્રિપ્શન પેજ પરથી બંધ કરી શકો છો. ઑટોપે વિના દરેક મહિનો કે વર્ષ એક વખતની ચુકવણી છે જે તમે જાતે કરો છો. અવધિ પૂરી થયા પછી તમારો પ્લાન 7 દિવસ વધુ ચાલે છે; ત્યાર બાદ તમારું ખાતું મફત પ્લાન અને તેની મર્યાદાઓ પર પાછું આવે છે.'),
      ('Is there a limit on how many leads I can quote on?', '5ddfb35bed11c3d8e108bea78e247a7c',
       'No. Every plan, Free included, can quote on as many buyer requirements as you like, and your plan doesn''t change the order they''re in. Requirements from buyers in India are open to every plan; requirements from overseas buyers are for Gold and VIP.',
       'नहीं। मुफ़्त प्लान समेत हर प्लान पर आप जितनी चाहें उतनी खरीदार आवश्यकताओं पर कोटेशन भेज सकते हैं, और आपका प्लान उनका क्रम नहीं बदलता। भारत के खरीदारों की आवश्यकताएँ हर प्लान के लिए खुली हैं; विदेशी खरीदारों की आवश्यकताएँ Gold और VIP के लिए हैं।',
       'ના. મફત પ્લાન સહિત દરેક પ્લાન પર તમે ઇચ્છો તેટલી ખરીદારની જરૂરિયાતો પર ક્વોટ મોકલી શકો છો, અને તમારો પ્લાન તેમનો ક્રમ બદલતો નથી. ભારતના ખરીદદારોની જરૂરિયાતો દરેક પ્લાન માટે ખુલ્લી છે; વિદેશી ખરીદદારોની જરૂરિયાતો Gold અને VIP માટે છે.'),
      ('Lowest billing plan?', 'd59704f8535214d1d0c060710e0dd550',
       'Yes! Basic is the lowest paid plan, with 10 product listings; the Subscription page shows today''s price, monthly or yearly. Just getting started? Our Free plan costs nothing and gives you 2 listings. Every plan can quote on unlimited buyer leads. Prices exclude GST.',
       'हाँ! Basic सबसे कम कीमत वाला भुगतान प्लान है, जिसमें 10 प्रोडक्ट लिस्टिंग मिलती हैं; सब्सक्रिप्शन पेज पर आज की कीमत, मासिक या वार्षिक, दिखती है। अभी शुरुआत कर रहे हैं? हमारा मुफ़्त प्लान कुछ नहीं लेता और 2 लिस्टिंग देता है। हर प्लान पर असीमित खरीदार लीड पर कोटेशन भेजा जा सकता है। कीमतों में GST शामिल नहीं है।',
       'હા! Basic સૌથી ઓછી કિંમતનો ચૂકવણીવાળો પ્લાન છે, જેમાં 10 પ્રોડક્ટ લિસ્ટિંગ મળે છે; સબ્સ્ક્રિપ્શન પેજ પર આજની કિંમત, માસિક કે વાર્ષિક, દેખાય છે. હમણાં શરૂઆત કરી રહ્યા છો? અમારો મફત પ્લાન કંઈ લેતો નથી અને 2 લિસ્ટિંગ આપે છે. દરેક પ્લાન પર અમર્યાદિત ખરીદાર લીડ પર ક્વોટ મોકલી શકાય છે. કિંમતોમાં GST શામેલ નથી.'),
      ('How are leads managed on Cosora?', '3e7cf8248660b72917d9c163348479af',
       'Buyer requirements appear on your Leads page, ranked to fit your catalogue. Requirements from buyers in India are open to every plan, and you can quote on all of them; requirements from overseas buyers are for Gold and VIP.',
       'खरीदार आवश्यकताएँ आपके लीड्स पेज पर आपके कैटलॉग के हिसाब से क्रम में दिखती हैं। भारत के खरीदारों की आवश्यकताएँ हर प्लान के लिए खुली हैं और आप उन सभी पर कोटेशन भेज सकते हैं; विदेशी खरीदारों की आवश्यकताएँ Gold और VIP के लिए हैं।',
       'ખરીદારની જરૂરિયાતો તમારા લીડ્સ પેજ પર તમારા કૅટલોગ પ્રમાણે ક્રમમાં દેખાય છે. ભારતના ખરીદદારોની જરૂરિયાતો દરેક પ્લાન માટે ખુલ્લી છે અને તમે તે બધી પર ક્વોટ મોકલી શકો છો; વિદેશી ખરીદદારોની જરૂરિયાતો Gold અને VIP માટે છે.')
    ) as t(question, old_md5, answer, hi, gu)
  loop
    update public.faqs f
       set answer = r.answer,
           translations = coalesce(f.translations, '{}'::jsonb)
             || jsonb_build_object('hi', coalesce(f.translations -> 'hi', '{}'::jsonb) || jsonb_build_object('answer', r.hi))
             || jsonb_build_object('gu', coalesce(f.translations -> 'gu', '{}'::jsonb) || jsonb_build_object('answer', r.gu)),
           updated_at = now()
     where f.question = r.question and md5(f.answer) = r.old_md5;
    get diagnostics n = row_count;
    if n = 0 and not exists (select 1 from public.faqs f where f.question = r.question and f.answer = r.answer) then
      raise notice 'FAQ "%" was edited since it was read, or is gone: left as it is; check its answer by hand', r.question;
    end if;
  end loop;
end
$faqs$;

-- ── 3. subscription_usage retired ──────────────────────────────────────────────────
revoke all on public.subscription_usage from anon, authenticated;
comment on table public.subscription_usage is
  'RETIRED (subscriptions P13, 2026-10-09): never written or read; limits come from subscription_plans.limits through vendor_entitlements(). Grants revoked; drop it in the SQL editor when convenient.';

-- ── 4. The payment-mode shims off ────────────────────────────────────────────────────
alter table public.subscription_payment_orders disable trigger trg_subscription_payment_orders_mode;
alter table public.subscription_invoices disable trigger trg_subscription_invoices_mode;

-- ── 5. Self-check ──────────────────────────────────────────────────────────────────
do $check$
begin
  -- The products line says the plan's cap.
  if exists (select 1 from public.subscription_plans p
              where p.display ->> 'products' is distinct from
                    case when coalesce((p.limits ->> 'product_cap')::int, -1) < 0 then 'Unlimited'
                         else (p.limits ->> 'product_cap') end) then
    raise exception 'a plan''s products line doesn''t match its cap';
  end if;
  if exists (select 1 from public.subscription_plans p
              where p.id in ('free', 'basic', 'silver', 'gold', 'vip')
                and not (p.display ?& array['products', 'international', 'ad', 'trust', 'search', 'account_manager',
                                            'lead_channel', 'alerts', 'crm', 'catalog', 'leads'])) then
    raise exception 'every plan has every row of the comparison';
  end if;
  if exists (select 1 from public.subscription_plans p, jsonb_each_text(p.display) e(k, v)
              where v ~* 'dedicated|100%|sms|custom global|top 1 in segment') then
    raise exception 'the plan copy still promises something that isn''t built';
  end if;
  if exists (select 1 from pg_trigger where tgname in ('trg_subscription_payment_orders_mode', 'trg_subscription_invoices_mode')
              and tgenabled <> 'D') then
    raise exception 'the payment-mode shims must be off';
  end if;
  if has_table_privilege('authenticated', 'public.subscription_usage', 'select')
     or has_table_privilege('anon', 'public.subscription_usage', 'select') then
    raise exception 'subscription_usage is still readable';
  end if;
end
$check$;
