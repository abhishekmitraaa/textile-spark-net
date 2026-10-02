-- Seller Help says what the product now does (2026-10-02; after 20261002100000 and
-- 20261002100100): registration asks for the Seller Registration FAQ's documents,
-- plans change with a prorated upgrade or a downgrade from the next period, and a
-- first plan has a 7-day money-back guarantee.
--
-- Each change applies only while the row still holds the P5 text
-- (20261001130100_help_content_p5), so an edit made in Cosora-Admin since is kept.
-- English, Hindi and Gujarati change together (translations are stored with the FAQ).

-- ── "Which documents does Cosora ask for?" ───────────────────────────────────
update public.faqs
   set answer = $t$To register you need: your PAN card; your GST certificate if you're registered for GST; a business registration, such as a Udyam (MSME) certificate, a certificate of incorporation, a shop licence or a partnership deed; a masked Aadhaar of the owner, where only the last 4 digits show; and a product catalogue, or your first product instead. If you registered before these were asked for, add the missing ones on the KYC page (My Store → My Business → KYC). Your documents are stored privately, and only Cosora's team can open them.$t$,
       translations = $t${"hi": {"question": "कोसोरा कौन-से दस्तावेज़ माँगता है?", "answer": "रजिस्टर करने के लिए आपको चाहिए: अपना PAN कार्ड; अगर आप GST में रजिस्टर्ड हैं तो GST प्रमाणपत्र; व्यवसाय का कोई पंजीकरण, जैसे उद्यम (MSME) प्रमाणपत्र, निगमन प्रमाणपत्र, दुकान लाइसेंस या साझेदारी विलेख; मालिक का मास्क्ड आधार, जिसमें केवल आख़िरी 4 अंक दिखते हैं; और एक उत्पाद कैटलॉग, या उसकी जगह आपका पहला उत्पाद। अगर आपने इनके माँगे जाने से पहले रजिस्टर किया था, तो जो कम हैं उन्हें KYC पेज पर (मेरा स्टोर → My Business → KYC) जोड़ें। आपके दस्तावेज़ निजी रूप से रखे जाते हैं, और उन्हें केवल कोसोरा की टीम खोल सकती है।"}, "gu": {"question": "કોસોરા કયા દસ્તાવેજો માગે છે?", "answer": "રજિસ્ટર કરવા માટે તમને જોઈએ: તમારું PAN કાર્ડ; જો તમે GST માં રજિસ્ટર્ડ હો તો GST પ્રમાણપત્ર; વ્યવસાયની કોઈ નોંધણી, જેમ કે ઉદ્યમ (MSME) પ્રમાણપત્ર, ઇન્કોર્પોરેશન પ્રમાણપત્ર, દુકાન લાઇસન્સ અથવા ભાગીદારી ખત; માલિકનું માસ્ક્ડ આધાર, જેમાં ફક્ત છેલ્લા 4 અંક દેખાય છે; અને પ્રોડક્ટ કેટલોગ, અથવા તેના બદલે તમારી પહેલી પ્રોડક્ટ. જો તમે આ માગવામાં આવે તે પહેલાં રજિસ્ટર કર્યું હોય, તો જે ખૂટે છે તે KYC પેજ પર (મારો સ્ટોર → My Business → KYC) ઉમેરો. તમારા દસ્તાવેજો ખાનગી રીતે રાખવામાં આવે છે, અને ફક્ત કોસોરાની ટીમ જ તેને ખોલી શકે છે."}}$t$::jsonb,
       updated_at = now()
 where surface = 'seller_help'
   and question = $t$Which documents does Cosora ask for?$t$
   and answer = $t$Your PAN is needed to register. On the KYC page (My Store → My Business → KYC) you can also add your GST certificate and, for a company, your CIN. Aadhaar isn't collected. Your documents are stored privately, and only Cosora's team can open them.$t$;

-- ── Two new questions under "Plans and billing" ──────────────────────────────
insert into public.faqs (surface, category_label, question, answer, position, active, translations)
select v.surface, v.category_label, v.question, v.answer, v.position, true, v.translations
  from (values
  ('seller_help', $t$Plans and billing$t$, $t$Can I change my plan?$t$, $t$Yes, at any time. An upgrade starts straight away, and what's left of your current plan comes off its price. A lower plan is paid now and starts when your current period ends, so you keep your current plan until then.$t$, 430, $t${"hi": {"question": "क्या मैं अपना प्लान बदल सकता हूँ?", "answer": "हाँ, कभी भी। अपग्रेड तुरंत शुरू होता है, और आपके मौजूदा प्लान का जो हिस्सा बचा है, वह उसकी कीमत में से घट जाता है। कम कीमत वाले प्लान का भुगतान अभी होता है और वह आपकी मौजूदा अवधि ख़त्म होने पर शुरू होता है, इसलिए तब तक आपका मौजूदा प्लान चलता रहता है।"}, "gu": {"question": "શું હું મારો પ્લાન બદલી શકું?", "answer": "હા, ક્યારેય પણ. અપગ્રેડ તરત શરૂ થાય છે, અને તમારા હાલના પ્લાનનો જે ભાગ બાકી છે તે તેની કિંમતમાંથી બાદ થાય છે. ઓછી કિંમતના પ્લાનની ચુકવણી હમણાં થાય છે અને તે તમારી હાલની અવધિ પૂરી થાય ત્યારે શરૂ થાય છે, તેથી ત્યાં સુધી તમારો હાલનો પ્લાન ચાલુ રહે છે."}}$t$::jsonb),
  ('seller_help', $t$Plans and billing$t$, $t$Can I get a refund?$t$, $t$If it's your first plan, yes. For 7 days after your first payment you can ask for a full refund on the Subscription page. We refund it to the card or account you paid with, and your plan ends then. The guarantee is for a first plan only.$t$, 440, $t${"hi": {"question": "क्या मुझे रिफ़ंड मिल सकता है?", "answer": "अगर यह आपका पहला प्लान है, तो हाँ। अपने पहले भुगतान के 7 दिनों तक आप सब्सक्रिप्शन पेज पर पूरे रिफ़ंड का अनुरोध कर सकते हैं। हम उसी कार्ड या खाते में रिफ़ंड करते हैं जिससे आपने भुगतान किया था, और तब आपका प्लान ख़त्म हो जाता है। यह गारंटी केवल पहले प्लान के लिए है।"}, "gu": {"question": "શું મને રિફંડ મળી શકે?", "answer": "જો આ તમારો પહેલો પ્લાન હોય, તો હા. તમારી પહેલી ચુકવણી પછી 7 દિવસ સુધી તમે સબ્સ્ક્રિપ્શન પેજ પર પૂરા રિફંડની વિનંતી કરી શકો છો. તમે જે કાર્ડ અથવા ખાતાથી ચુકવણી કરી હતી તેમાં જ અમે રિફંડ કરીએ છીએ, અને ત્યારે તમારો પ્લાન પૂરો થાય છે. આ ગેરંટી ફક્ત પહેલા પ્લાન માટે છે."}}$t$::jsonb)
  ) as v(surface, category_label, question, answer, position, translations)
 where not exists (select 1 from public.faqs f where f.surface = v.surface and f.question = v.question);

-- ── Quick Guide: How to Complete Verification ────────────────────────────────
update public.help_guides
   set body = $t${"en": "Open My Store, then My Business, then KYC.\nMake sure you have all five: your PAN card; your GST certificate if you're registered for GST; a business registration (Udyam, incorporation certificate, shop licence or partnership deed); a masked Aadhaar of the owner; and a product catalogue, or at least one listed product.\nAdd anything missing on its row. For a business registration, choose its kind and enter its number.\nCheck that each file is clear and readable, then submit it.\nOur team reviews documents within 3–5 days, and you get a notification for each decision.\nIf a document is rejected, read the reason under it and upload a corrected copy. It goes back into review.", "hi": "मेरा स्टोर खोलें, फिर My Business, फिर KYC।\nदेख लें कि पाँचों आपके पास हैं: आपका PAN कार्ड; अगर आप GST में रजिस्टर्ड हैं तो GST प्रमाणपत्र; व्यवसाय का पंजीकरण (उद्यम, निगमन प्रमाणपत्र, दुकान लाइसेंस या साझेदारी विलेख); मालिक का मास्क्ड आधार; और एक उत्पाद कैटलॉग, या कम से कम एक लिस्टेड उत्पाद।\nजो कम है उसे उसकी पंक्ति पर जोड़ें। व्यवसाय के पंजीकरण के लिए उसका प्रकार चुनें और उसका नंबर डालें।\nदेख लें कि हर फ़ाइल साफ़ और पढ़ने लायक है, फिर उसे जमा करें।\nहमारी टीम 3–5 दिनों में दस्तावेज़ों की समीक्षा करती है, और हर फ़ैसले पर आपको सूचना मिलती है।\nअगर कोई दस्तावेज़ अस्वीकार हो, तो उसके नीचे लिखा कारण पढ़ें और सुधारी हुई कॉपी अपलोड करें। वह फिर से समीक्षा में जाएगा।", "gu": "મારો સ્ટોર ખોલો, પછી My Business, પછી KYC.\nખાતરી કરો કે પાંચેય તમારી પાસે છે: તમારું PAN કાર્ડ; જો તમે GST માં રજિસ્ટર્ડ હો તો GST પ્રમાણપત્ર; વ્યવસાયની નોંધણી (ઉદ્યમ, ઇન્કોર્પોરેશન પ્રમાણપત્ર, દુકાન લાઇસન્સ અથવા ભાગીદારી ખત); માલિકનું માસ્ક્ડ આધાર; અને પ્રોડક્ટ કેટલોગ, અથવા ઓછામાં ઓછી એક લિસ્ટ કરેલી પ્રોડક્ટ.\nજે ખૂટે છે તે તેની હરોળમાં ઉમેરો. વ્યવસાયની નોંધણી માટે તેનો પ્રકાર પસંદ કરો અને તેનો નંબર લખો.\nદરેક ફાઇલ સ્પષ્ટ અને વાંચી શકાય તેવી છે તે જોઈ લો, પછી સબમિટ કરો.\nઅમારી ટીમ 3–5 દિવસમાં દસ્તાવેજોની સમીક્ષા કરે છે, અને દરેક નિર્ણય પર તમને સૂચના મળે છે.\nજો કોઈ દસ્તાવેજ નકારવામાં આવે, તો તેની નીચે લખેલું કારણ વાંચો અને સુધારેલી નકલ અપલોડ કરો. તે ફરી સમીક્ષામાં જશે."}$t$::jsonb,
       updated_at = now()
 where slug = 'complete-verification'
   and body ->> 'en' = concat_ws(chr(10),
         $t$Open My Store, then My Business, then KYC.$t$,
         $t$Upload your PAN card. Add your GST certificate, and your CIN if you're a company.$t$,
         $t$Check that each file is clear and readable, then submit it.$t$,
         $t$Our team reviews documents within 3–5 days, and you get a notification for each decision.$t$,
         $t$If a document is rejected, read the reason under it and upload a corrected copy. It goes back into review.$t$);

-- ── Quick Guide: Payment & Subscription (still off: checkouts run in demo mode) ──
update public.help_guides
   set body = $t${"en": "Open Subscription to compare the plans and their product and lead limits.\nChoose monthly or yearly. A year costs ten times the monthly price.\nGST at 18% is added at checkout. Add your GSTIN first, so it's recorded on your invoices.\nEach period is a one-time payment. Nothing renews automatically.\nYou can change plan at any time. An upgrade starts now, less what's left of your current plan. A lower plan starts when your current period ends.\nFor your first plan there's a 7-day money-back guarantee: ask on the Subscription page.\nYour invoices are in My Payments.\nWhen a paid period ends, your account returns to the Free plan's limits until you pay for another.", "hi": "प्लान और उनकी उत्पाद व लीड सीमाओं की तुलना के लिए सब्सक्रिप्शन खोलें।\nमासिक या वार्षिक चुनें। एक साल की कीमत मासिक कीमत की दस गुना है।\nचेकआउट पर 18% GST जुड़ता है। पहले अपना GSTIN जोड़ें, ताकि वह आपके इनवॉइस पर दर्ज हो।\nहर अवधि एक बार का भुगतान है। कुछ भी अपने-आप रिन्यू नहीं होता।\nआप कभी भी प्लान बदल सकते हैं। अपग्रेड अभी शुरू होता है, और आपके मौजूदा प्लान का बचा हुआ हिस्सा घट जाता है। कम कीमत वाला प्लान आपकी मौजूदा अवधि ख़त्म होने पर शुरू होता है।\nआपके पहले प्लान पर 7 दिनों की मनी-बैक गारंटी है: सब्सक्रिप्शन पेज पर अनुरोध करें।\nआपके इनवॉइस मेरे भुगतान में हैं।\nभुगतान वाली अवधि खत्म होने पर, अगली अवधि का भुगतान करने तक आपका खाता मुफ़्त प्लान की सीमाओं पर लौट आता है।", "gu": "પ્લાન અને તેની ઉત્પાદન તથા લીડ મર્યાદાઓની તુલના માટે સબ્સ્ક્રિપ્શન ખોલો.\nમાસિક કે વાર્ષિક પસંદ કરો. એક વર્ષની કિંમત માસિક કિંમતથી દસ ગણી છે.\nચેકઆઉટ વખતે 18% GST ઉમેરાય છે. પહેલાં તમારો GSTIN ઉમેરો, જેથી તે તમારા ઇન્વૉઇસ પર નોંધાય.\nદરેક સમયગાળો એક વખતની ચુકવણી છે. કંઈ પણ આપમેળે રિન્યૂ થતું નથી.\nતમે ક્યારેય પણ પ્લાન બદલી શકો છો. અપગ્રેડ હમણાં શરૂ થાય છે, અને તમારા હાલના પ્લાનનો બાકી ભાગ બાદ થાય છે. ઓછી કિંમતનો પ્લાન તમારી હાલની અવધિ પૂરી થાય ત્યારે શરૂ થાય છે.\nતમારા પહેલા પ્લાન પર 7 દિવસની મની-બેક ગેરંટી છે: સબ્સ્ક્રિપ્શન પેજ પર વિનંતી કરો.\nતમારા ઇન્વૉઇસ મારી ચુકવણીઓમાં છે.\nચુકવણી કરેલો સમયગાળો પૂરો થાય ત્યારે, આગલા સમયગાળાની ચુકવણી કરો ત્યાં સુધી તમારું ખાતું મફત પ્લાનની મર્યાદાઓ પર પાછું આવે છે."}$t$::jsonb,
       updated_at = now()
 where slug = 'payment-and-subscription'
   and body ->> 'en' = concat_ws(chr(10),
         $t$Open Subscription to compare the plans and their product and lead limits.$t$,
         $t$Choose monthly or yearly. A year costs ten times the monthly price.$t$,
         $t$GST at 18% is added at checkout. Add your GSTIN first, so it's recorded on your invoices.$t$,
         $t$Each period is a one-time payment. Nothing renews automatically.$t$,
         $t$Your invoices are in My Payments.$t$,
         $t$When a paid period ends, your account returns to the Free plan's limits until you pay for another.$t$);

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
begin
  if (select count(*) from public.faqs where surface = 'seller_help' and category_label = 'Plans and billing'
       and question in ('Can I change my plan?', 'Can I get a refund?') and translations ? 'hi' and translations ? 'gu') <> 2 then
    raise exception 'the two plan questions are missing or untranslated';
  end if;
  if exists (select 1 from public.faqs where surface = 'seller_help' and answer like '%Aadhaar isn''t collected%') then
    raise notice 'the documents answer was edited in Cosora-Admin since P5 and was left as it is';
  end if;
end
$check$;
