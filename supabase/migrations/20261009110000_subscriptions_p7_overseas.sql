-- Subscriptions P7: overseas requirements (plan "build every vendor subscription feature",
-- 2026-10-09). Mitra: a requirement from a buyer outside India is visible only to Gold and
-- VIP vendors. VIP sees it first, for 24 hours; if no VIP vendor serves its category, Gold
-- sees it at once. (The one exception to "the same leads on every plan".)
--
-- WHO IS OVERSEAS. A buyer whose profile has a country that isn't India
-- (buyer_profiles.country_code, from the country they choose; public.countries is the list).
-- No country counts as India.
--
-- WHAT IS MARKED. When a requirement is posted, a trigger stamps it from its buyer's profile:
-- buyer_country_code, overseas, and overseas_vip_until (now + overseas_head_start_hours when a
-- VIP vendor has a published listing in its category). The three columns are the database's:
-- a browser's write to them is ignored, including the buyer's own (their update policy covers
-- every column, so without this they could un-mark their requirement, or a vendor's page
-- would trust a field anyone could set).
--
-- WHO CAN READ IT (the rfqs_select policy, match_vendor_rfqs, the quote guard and lead
-- alerts all apply the same rule; the guard and the alerts call public.overseas_rfq_visible,
-- the policy and the ranked feed write it out inline because they test every row):
--   * a requirement that isn't overseas: as before;
--   * VIP: always; Gold: once the VIP head start is over;
--   * everyone else: no, except a vendor who has already quoted on it, its buyer, and admins;
--   * a requirement sent to one vendor is that vendor's whatever the plans say.
-- Free to Silver see how many there are (public.overseas_lead_count), nothing else.
--
-- The overseas_leads switch (off). A requirement is marked overseas only when the switch
-- lists its BUYER (or is on for everyone), so in testing only test buyers' requirements are
-- held back; the Overseas leads page shows for a vendor the switch lists. Off, nothing is
-- marked and nothing changes for anyone.
--
-- Harness: scripts/subscriptions/p7_overseas.sql.

-- ── 0. Guard: what is patched here is what was read ─────────────────────────────────
do $guard$
declare
  r record;
begin
  for r in
    select * from (values
      ('public.match_vendor_rfqs(uuid,integer)',  '2842cbb8746a8b87666a9a25770b8ace'),
      ('public.enforce_quote_rfq_open()',         'dfb7f447103fa98dc243da443861418b'),
      ('public.vendor_entitlements(uuid)',        '950d670fd8d422dd41923752dde45556'),
      ('admin.lead_alert_fanout(uuid)',           'b71314d81b52bf79d1bea25f3af6d467'),
      ('public.lead_digest_run()',                '50b9f77bf30038e0e8f253cfd3e90b0d'),
      ('public.admin_lead_detail(uuid)',          '2569261998c7c37f5721574cdbb764c4')
    ) as t(fn, want)
  loop
    if md5((select prosrc from pg_proc where oid = r.fn::regprocedure)) <> r.want then
      raise exception '% changed since it was read; re-read it before patching', r.fn;
    end if;
  end loop;
  if md5((select pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.rfqs'::regclass and polname = 'rfqs_select'))
     <> 'e93c2cb9ac4b53b242fa684aec7d64b1' then
    raise exception 'the rfqs_select policy changed since it was read; re-read it before altering it';
  end if;
end
$guard$;

-- ── 1. The switch ───────────────────────────────────────────────────────────────────
insert into public.feature_flags (key, description, enabled)
values ('overseas_leads',
        'Overseas requirements (subscriptions P7): a requirement from a buyer outside India is marked when this lists the BUYER, and is then visible only to Gold and VIP (VIP first); the Overseas leads page shows for a vendor this lists. Off: nothing is marked and every plan sees every requirement.',
        false)
on conflict (key) do nothing;

-- ── 2. Countries, and the buyer's ───────────────────────────────────────────────────
create table public.countries (
  code    text primary key check (code ~ '^[A-Z]{2}$'),
  name    text not null unique,
  name_hi text not null,
  name_gu text not null,
  aliases text[] not null default '{}'
);
alter table public.countries enable row level security;
create policy countries_select on public.countries for select using (true);
revoke insert, update, delete on public.countries from anon, authenticated;
grant select on public.countries to anon, authenticated;
comment on table public.countries is
  'The world''s countries and territories: ISO 3166-1 alpha-2 codes (and XK), named in English, Hindi and Gujarati from CLDR. Generated with src/data/countries.ts from one list; change them together. aliases are other spellings country_code_for() accepts.';

insert into public.countries (code, name, name_hi, name_gu, aliases) values
  ('AF', 'Afghanistan', 'अफ़गानिस्तान', 'અફઘાનિસ્તાન', '{}'),
  ('AX', 'Åland Islands', 'एलैंड द्वीपसमूह', 'ઑલેન્ડ આઇલેન્ડ્સ', array['Aland Islands']),
  ('AL', 'Albania', 'अल्बानिया', 'અલ્બેનિયા', '{}'),
  ('DZ', 'Algeria', 'अल्जीरिया', 'અલ્જીરિયા', '{}'),
  ('AS', 'American Samoa', 'अमेरिकी समोआ', 'અમેરિકન સમોઆ', '{}'),
  ('AD', 'Andorra', 'एंडोरा', 'ઍંડોરા', '{}'),
  ('AO', 'Angola', 'अंगोला', 'અંગોલા', '{}'),
  ('AI', 'Anguilla', 'एंग्विला', 'ઍંગ્વિલા', '{}'),
  ('AQ', 'Antarctica', 'अंटार्कटिका', 'એન્ટાર્કટિકા', '{}'),
  ('AG', 'Antigua & Barbuda', 'एंटिगुआ और बरबुडा', 'ઍન્ટિગુઆ અને બર્મુડા', '{}'),
  ('AR', 'Argentina', 'अर्जेंटीना', 'આર્જેન્ટીના', '{}'),
  ('AM', 'Armenia', 'आर्मेनिया', 'આર્મેનિયા', '{}'),
  ('AW', 'Aruba', 'अरूबा', 'અરુબા', '{}'),
  ('AU', 'Australia', 'ऑस्ट्रेलिया', 'ઑસ્ટ્રેલિયા', '{}'),
  ('AT', 'Austria', 'ऑस्ट्रिया', 'ઑસ્ટ્રિયા', '{}'),
  ('AZ', 'Azerbaijan', 'अज़रबैजान', 'અઝરબૈજાન', '{}'),
  ('BS', 'Bahamas', 'बहामास', 'બહામાસ', '{}'),
  ('BH', 'Bahrain', 'बहरीन', 'બેહરીન', '{}'),
  ('BD', 'Bangladesh', 'बांग्लादेश', 'બાંગ્લાદેશ', array['Bangla Desh']),
  ('BB', 'Barbados', 'बारबाडोस', 'બારબાડોસ', '{}'),
  ('BY', 'Belarus', 'बेलारूस', 'બેલારુસ', '{}'),
  ('BE', 'Belgium', 'बेल्जियम', 'બેલ્જીયમ', '{}'),
  ('BZ', 'Belize', 'बेलीज़', 'બેલીઝ', '{}'),
  ('BJ', 'Benin', 'बेनिन', 'બેનિન', '{}'),
  ('BM', 'Bermuda', 'बरमूडा', 'બર્મુડા', '{}'),
  ('BT', 'Bhutan', 'भूटान', 'ભૂટાન', '{}'),
  ('BO', 'Bolivia', 'बोलीविया', 'બોલિવિયા', '{}'),
  ('BA', 'Bosnia & Herzegovina', 'बोस्निया और हर्ज़ेगोविना', 'બોસ્નિયા અને હર્ઝેગોવિના', '{}'),
  ('BW', 'Botswana', 'बोत्स्वाना', 'બોત્સ્વાના', '{}'),
  ('BV', 'Bouvet Island', 'बोवेत द्वीप', 'બૌવેત આઇલેન્ડ', '{}'),
  ('BR', 'Brazil', 'ब्राज़ील', 'બ્રાઝિલ', '{}'),
  ('IO', 'British Indian Ocean Territory', 'ब्रिटिश हिंद महासागरीय क्षेत्र', 'બ્રિટિશ ઇન્ડિયન ઓશન ટેરિટરી', '{}'),
  ('VG', 'British Virgin Islands', 'ब्रिटिश वर्जिन द्वीपसमूह', 'બ્રિટિશ વર્જિન આઇલેન્ડ્સ', '{}'),
  ('BN', 'Brunei', 'ब्रूनेई', 'બ્રુનેઇ', '{}'),
  ('BG', 'Bulgaria', 'बुल्गारिया', 'બલ્ગેરિયા', '{}'),
  ('BF', 'Burkina Faso', 'बुर्किना फ़ासो', 'બુર્કિના ફાસો', '{}'),
  ('BI', 'Burundi', 'बुरुंडी', 'બુરુંડી', '{}'),
  ('KH', 'Cambodia', 'कंबोडिया', 'કંબોડિયા', '{}'),
  ('CM', 'Cameroon', 'कैमरून', 'કૅમરૂન', '{}'),
  ('CA', 'Canada', 'कनाडा', 'કેનેડા', '{}'),
  ('CV', 'Cape Verde', 'केप वर्ड', 'કૅપ વર્ડે', array['Cabo Verde']),
  ('BQ', 'Caribbean Netherlands', 'कैरिबियन नीदरलैंड', 'કેરેબિયન નેધરલેન્ડ્ઝ', '{}'),
  ('KY', 'Cayman Islands', 'कैमेन द्वीपसमूह', 'કેમેન આઇલેન્ડ્સ', '{}'),
  ('CF', 'Central African Republic', 'मध्य अफ़्रीकी गणराज्य', 'સેન્ટ્રલ આફ્રિકન રિપબ્લિક', '{}'),
  ('TD', 'Chad', 'चाड', 'ચાડ', '{}'),
  ('CL', 'Chile', 'चिली', 'ચિલી', '{}'),
  ('CN', 'China', 'चीन', 'ચીન', array['PRC', 'Peoples Republic of China']),
  ('CX', 'Christmas Island', 'क्रिसमस द्वीप', 'ક્રિસમસ આઇલેન્ડ', '{}'),
  ('CC', 'Cocos (Keeling) Islands', 'कोकोस (कीलिंग) द्वीपसमूह', 'કોકોઝ (કીલીંગ) આઇલેન્ડ્સ', '{}'),
  ('CO', 'Colombia', 'कोलंबिया', 'કોલમ્બિયા', '{}'),
  ('KM', 'Comoros', 'कोमोरोस', 'કોમોરસ', '{}'),
  ('CD', 'Congo (DRC)', 'कांगो - किंशासा', 'કોંગો - કિંશાસા', array['DR Congo', 'Democratic Republic of the Congo', 'Congo Kinshasa', 'Congo - Kinshasa']),
  ('CG', 'Congo (Republic)', 'कांगो – ब्राज़ाविल', 'કોંગો - બ્રાઝાવિલે', array['Republic of the Congo', 'Congo Brazzaville', 'Congo', 'Congo - Brazzaville']),
  ('CK', 'Cook Islands', 'कुक द्वीपसमूह', 'કુક આઇલેન્ડ્સ', '{}'),
  ('CR', 'Costa Rica', 'कोस्टारिका', 'કોસ્ટા રિકા', '{}'),
  ('CI', 'Côte d’Ivoire', 'कोत दिवुआर', 'કોટ ડીઆઇવરી', array['Ivory Coast', 'Cote d''Ivoire']),
  ('HR', 'Croatia', 'क्रोएशिया', 'ક્રોએશિયા', '{}'),
  ('CU', 'Cuba', 'क्यूबा', 'ક્યુબા', '{}'),
  ('CW', 'Curaçao', 'कुरासाओ', 'ક્યુરાસાઓ', array['Curacao']),
  ('CY', 'Cyprus', 'साइप्रस', 'સાયપ્રસ', '{}'),
  ('CZ', 'Czechia', 'चेकिया', 'ચેકીયા', array['Czech Republic']),
  ('DK', 'Denmark', 'डेनमार्क', 'ડેનમાર્ક', '{}'),
  ('DJ', 'Djibouti', 'जिबूती', 'જીબૌટી', '{}'),
  ('DM', 'Dominica', 'डोमिनिका', 'ડોમિનિકા', '{}'),
  ('DO', 'Dominican Republic', 'डोमिनिकन गणराज्य', 'ડોમિનિકન રિપબ્લિક', '{}'),
  ('EC', 'Ecuador', 'इक्वाडोर', 'એક્વાડોર', '{}'),
  ('EG', 'Egypt', 'मिस्र', 'ઇજિપ્ત', '{}'),
  ('SV', 'El Salvador', 'अल सल्वाडोर', 'એલ સેલ્વાડોર', '{}'),
  ('GQ', 'Equatorial Guinea', 'इक्वेटोरियल गिनी', 'ઇક્વેટોરિયલ ગિની', '{}'),
  ('ER', 'Eritrea', 'इरिट्रिया', 'એરિટ્રિયા', '{}'),
  ('EE', 'Estonia', 'एस्टोनिया', 'એસ્ટોનિયા', '{}'),
  ('SZ', 'Eswatini', 'एस्वाटिनी', 'એસ્વાટીની', array['Swaziland']),
  ('ET', 'Ethiopia', 'इथियोपिया', 'ઇથિઓપિયા', '{}'),
  ('FK', 'Falkland Islands', 'फ़ॉकलैंड द्वीपसमूह', 'ફૉકલેન્ડ આઇલેન્ડ્સ', '{}'),
  ('FO', 'Faroe Islands', 'फ़ेरो द्वीपसमूह', 'ફેરો આઇલેન્ડ્સ', '{}'),
  ('FJ', 'Fiji', 'फ़िजी', 'ફીજી', '{}'),
  ('FI', 'Finland', 'फ़िनलैंड', 'ફિનલેન્ડ', '{}'),
  ('FR', 'France', 'फ़्रांस', 'ફ્રાંસ', '{}'),
  ('GF', 'French Guiana', 'फ़्रेंच गुयाना', 'ફ્રેંચ ગયાના', '{}'),
  ('PF', 'French Polynesia', 'फ़्रेंच पोलिनेशिया', 'ફ્રેંચ પોલિનેશિયા', '{}'),
  ('TF', 'French Southern Territories', 'फ़्रांसीसी दक्षिणी क्षेत्र', 'ફ્રેંચ સધર્ન ટેરિટરીઝ', '{}'),
  ('GA', 'Gabon', 'गैबॉन', 'ગેબન', '{}'),
  ('GM', 'Gambia', 'गाम्बिया', 'ગેમ્બિયા', '{}'),
  ('GE', 'Georgia', 'जॉर्जिया', 'જ્યોર્જિયા', '{}'),
  ('DE', 'Germany', 'जर्मनी', 'જર્મની', '{}'),
  ('GH', 'Ghana', 'घाना', 'ઘાના', '{}'),
  ('GI', 'Gibraltar', 'जिब्राल्टर', 'જીબ્રાલ્ટર', '{}'),
  ('GR', 'Greece', 'यूनान', 'ગ્રીસ', '{}'),
  ('GL', 'Greenland', 'ग्रीनलैंड', 'ગ્રીનલેન્ડ', '{}'),
  ('GD', 'Grenada', 'ग्रेनाडा', 'ગ્રેનેડા', '{}'),
  ('GP', 'Guadeloupe', 'ग्वाडेलूप', 'ગ્વાડેલોપ', '{}'),
  ('GU', 'Guam', 'गुआम', 'ગ્વામ', '{}'),
  ('GT', 'Guatemala', 'ग्वाटेमाला', 'ગ્વાટેમાલા', '{}'),
  ('GG', 'Guernsey', 'गर्नसी', 'ગ્વેર્નસે', '{}'),
  ('GN', 'Guinea', 'गिनी', 'ગિની', '{}'),
  ('GW', 'Guinea-Bissau', 'गिनी-बिसाउ', 'ગિની-બિસાઉ', '{}'),
  ('GY', 'Guyana', 'गुयाना', 'ગયાના', '{}'),
  ('HT', 'Haiti', 'हैती', 'હૈતિ', '{}'),
  ('HM', 'Heard & McDonald Islands', 'हर्ड द्वीप और मैकडोनॉल्ड द्वीपसमूह', 'હર્ડ અને મેકડોનાલ્ડ આઇલેન્ડ્સ', '{}'),
  ('HN', 'Honduras', 'होंडूरास', 'હોન્ડુરસ', '{}'),
  ('HK', 'Hong Kong', 'हाँग काँग (चीन विशेष प्रशासनिक क्षेत्र)', 'હોંગકોંગ SAR ચીન', array['Hong Kong SAR', 'Hong Kong SAR China']),
  ('HU', 'Hungary', 'हंगरी', 'હંગેરી', '{}'),
  ('IS', 'Iceland', 'आइसलैंड', 'આઇસલેન્ડ', '{}'),
  ('IN', 'India', 'भारत', 'ભારત', array['Bharat', 'Hindustan']),
  ('ID', 'Indonesia', 'इंडोनेशिया', 'ઇન્ડોનેશિયા', '{}'),
  ('IR', 'Iran', 'ईरान', 'ઈરાન', array['Islamic Republic of Iran']),
  ('IQ', 'Iraq', 'इराक', 'ઇરાક', '{}'),
  ('IE', 'Ireland', 'आयरलैंड', 'આયર્લેન્ડ', '{}'),
  ('IM', 'Isle of Man', 'आइल ऑफ़ मैन', 'આઇલ ઑફ મેન', '{}'),
  ('IL', 'Israel', 'इज़राइल', 'ઇઝરાઇલ', '{}'),
  ('IT', 'Italy', 'इटली', 'ઇટાલી', '{}'),
  ('JM', 'Jamaica', 'जमैका', 'જમૈકા', '{}'),
  ('JP', 'Japan', 'जापान', 'જાપાન', '{}'),
  ('JE', 'Jersey', 'जर्सी', 'જર્સી', '{}'),
  ('JO', 'Jordan', 'जॉर्डन', 'જોર્ડન', '{}'),
  ('KZ', 'Kazakhstan', 'कज़ाखस्तान', 'કઝાકિસ્તાન', '{}'),
  ('KE', 'Kenya', 'केन्या', 'કેન્યા', '{}'),
  ('KI', 'Kiribati', 'किरिबाती', 'કિરિબાટી', '{}'),
  ('XK', 'Kosovo', 'कोसोवो', 'કોસોવો', '{}'),
  ('KW', 'Kuwait', 'कुवैत', 'કુવૈત', '{}'),
  ('KG', 'Kyrgyzstan', 'किर्गिज़स्तान', 'કિર્ગિઝ્સ્તાન', '{}'),
  ('LA', 'Laos', 'लाओस', 'લાઓસ', array['Lao PDR']),
  ('LV', 'Latvia', 'लातविया', 'લાત્વિયા', '{}'),
  ('LB', 'Lebanon', 'लेबनान', 'લેબનોન', '{}'),
  ('LS', 'Lesotho', 'लेसोथो', 'લેસોથો', '{}'),
  ('LR', 'Liberia', 'लाइबेरिया', 'લાઇબેરિયા', '{}'),
  ('LY', 'Libya', 'लीबिया', 'લિબિયા', '{}'),
  ('LI', 'Liechtenstein', 'लिचेंस्टीन', 'લૈચટેંસ્ટેઇન', '{}'),
  ('LT', 'Lithuania', 'लिथुआनिया', 'લિથુઆનિયા', '{}'),
  ('LU', 'Luxembourg', 'लग्ज़मबर्ग', 'લક્ઝમબર્ગ', '{}'),
  ('MO', 'Macao', 'मकाऊ (विशेष प्रशासनिक क्षेत्र चीन)', 'મકાઉ SAR ચીન', array['Macau', 'Macao SAR China']),
  ('MG', 'Madagascar', 'मेडागास्कर', 'મેડાગાસ્કર', '{}'),
  ('MW', 'Malawi', 'मलावी', 'માલાવી', '{}'),
  ('MY', 'Malaysia', 'मलेशिया', 'મલેશિયા', '{}'),
  ('MV', 'Maldives', 'मालदीव', 'માલદિવ્સ', '{}'),
  ('ML', 'Mali', 'माली', 'માલી', '{}'),
  ('MT', 'Malta', 'माल्टा', 'માલ્ટા', '{}'),
  ('MH', 'Marshall Islands', 'मार्शल द्वीपसमूह', 'માર્શલ આઇલેન્ડ્સ', '{}'),
  ('MQ', 'Martinique', 'मार्टीनिक', 'માર્ટીનીક', '{}'),
  ('MR', 'Mauritania', 'मॉरिटानिया', 'મૌરિટાનિયા', '{}'),
  ('MU', 'Mauritius', 'मॉरीशस', 'મોરિશિયસ', '{}'),
  ('YT', 'Mayotte', 'मायोते', 'મેયોટ', '{}'),
  ('MX', 'Mexico', 'मैक्सिको', 'મેક્સિકો', '{}'),
  ('FM', 'Micronesia', 'माइक्रोनेशिया', 'માઇક્રોનેશિયા', '{}'),
  ('MD', 'Moldova', 'मॉल्डोवा', 'મોલડોવા', '{}'),
  ('MC', 'Monaco', 'मोनाको', 'મોનાકો', '{}'),
  ('MN', 'Mongolia', 'मंगोलिया', 'મંગોલિયા', '{}'),
  ('ME', 'Montenegro', 'मोंटेनेग्रो', 'મૉન્ટેનેગ્રો', '{}'),
  ('MS', 'Montserrat', 'मोंटसेरात', 'મોંટસેરાત', '{}'),
  ('MA', 'Morocco', 'मोरक्को', 'મોરોક્કો', '{}'),
  ('MZ', 'Mozambique', 'मोज़ांबिक', 'મોઝામ્બિક', '{}'),
  ('MM', 'Myanmar', 'म्यांमार (बर्मा)', 'મ્યાંમાર (બર્મા)', array['Burma', 'Myanmar (Burma)']),
  ('NA', 'Namibia', 'नामीबिया', 'નામિબિયા', '{}'),
  ('NR', 'Nauru', 'नाउरु', 'નૌરુ', '{}'),
  ('NP', 'Nepal', 'नेपाल', 'નેપાળ', '{}'),
  ('NL', 'Netherlands', 'नीदरलैंड', 'નેધરલેન્ડ્સ', array['Holland', 'The Netherlands']),
  ('NC', 'New Caledonia', 'न्यू कैलेडोनिया', 'ન્યુ સેલેડોનિયા', '{}'),
  ('NZ', 'New Zealand', 'न्यूज़ीलैंड', 'ન્યુઝીલેન્ડ', '{}'),
  ('NI', 'Nicaragua', 'निकारागुआ', 'નિકારાગુઆ', '{}'),
  ('NE', 'Niger', 'नाइजर', 'નાઇજર', '{}'),
  ('NG', 'Nigeria', 'नाइजीरिया', 'નાઇજેરિયા', '{}'),
  ('NU', 'Niue', 'नीयू', 'નીયુ', '{}'),
  ('NF', 'Norfolk Island', 'नॉरफ़ॉक द्वीप', 'નોરફોક આઇલેન્ડ્સ', '{}'),
  ('KP', 'North Korea', 'उत्तर कोरिया', 'ઉત્તર કોરિયા', array['DPRK']),
  ('MK', 'North Macedonia', 'उत्तरी मकदूनिया', 'ઉત્તર મેસેડોનિયા', array['Macedonia']),
  ('MP', 'Northern Mariana Islands', 'उत्तरी मारियाना द्वीपसमूह', 'ઉત્તરી મારિયાના આઇલેન્ડ્સ', '{}'),
  ('NO', 'Norway', 'नॉर्वे', 'નૉર્વે', '{}'),
  ('OM', 'Oman', 'ओमान', 'ઓમાન', '{}'),
  ('PK', 'Pakistan', 'पाकिस्तान', 'પાકિસ્તાન', '{}'),
  ('PW', 'Palau', 'पलाऊ', 'પલાઉ', '{}'),
  ('PS', 'Palestine', 'फ़िलिस्तीनी क्षेत्र', 'પેલેસ્ટિનિયન ટેરિટરી', array['Palestinian Territories']),
  ('PA', 'Panama', 'पनामा', 'પનામા', '{}'),
  ('PG', 'Papua New Guinea', 'पापुआ न्यू गिनी', 'પાપુઆ ન્યૂ ગિની', '{}'),
  ('PY', 'Paraguay', 'पराग्वे', 'પેરાગ્વે', '{}'),
  ('PE', 'Peru', 'पेरू', 'પેરુ', '{}'),
  ('PH', 'Philippines', 'फ़िलिपींस', 'ફિલિપિન્સ', '{}'),
  ('PN', 'Pitcairn Islands', 'पिटकैर्न द्वीपसमूह', 'પીટકૈર્ન આઇલેન્ડ્સ', '{}'),
  ('PL', 'Poland', 'पोलैंड', 'પોલેંડ', '{}'),
  ('PT', 'Portugal', 'पुर्तगाल', 'પોર્ટુગલ', '{}'),
  ('PR', 'Puerto Rico', 'पोर्टो रिको', 'પ્યુઅર્ટો રિકો', '{}'),
  ('QA', 'Qatar', 'क़तर', 'કતાર', '{}'),
  ('RE', 'Réunion', 'रियूनियन', 'રીયુનિયન', array['Reunion']),
  ('RO', 'Romania', 'रोमानिया', 'રોમાનિયા', '{}'),
  ('RU', 'Russia', 'रूस', 'રશિયા', array['Russian Federation']),
  ('RW', 'Rwanda', 'रवांडा', 'રવાંડા', '{}'),
  ('WS', 'Samoa', 'समोआ', 'સમોઆ', '{}'),
  ('SM', 'San Marino', 'सैन मेरीनो', 'સૅન મેરિનો', '{}'),
  ('ST', 'São Tomé & Príncipe', 'साओ टोम और प्रिंसिपे', 'સાઓ ટૉમ અને પ્રિંસિપે', array['Sao Tome & Principe']),
  ('SA', 'Saudi Arabia', 'सऊदी अरब', 'સાઉદી અરેબિયા', array['KSA']),
  ('SN', 'Senegal', 'सेनेगल', 'સેનેગલ', '{}'),
  ('RS', 'Serbia', 'सर्बिया', 'સર્બિયા', '{}'),
  ('SC', 'Seychelles', 'सेशेल्स', 'સેશેલ્સ', '{}'),
  ('SL', 'Sierra Leone', 'सिएरा लियोन', 'સીએરા લેઓન', '{}'),
  ('SG', 'Singapore', 'सिंगापुर', 'સિંગાપુર', '{}'),
  ('SX', 'Sint Maarten', 'सिंट मार्टिन', 'સિંટ માર્ટેન', '{}'),
  ('SK', 'Slovakia', 'स्लोवाकिया', 'સ્લોવેકિયા', '{}'),
  ('SI', 'Slovenia', 'स्लोवेनिया', 'સ્લોવેનિયા', '{}'),
  ('SB', 'Solomon Islands', 'सोलोमन द्वीपसमूह', 'સોલોમન આઇલેન્ડ્સ', '{}'),
  ('SO', 'Somalia', 'सोमालिया', 'સોમાલિયા', '{}'),
  ('ZA', 'South Africa', 'दक्षिण अफ़्रीका', 'દક્ષિણ આફ્રિકા', '{}'),
  ('GS', 'South Georgia & South Sandwich Islands', 'दक्षिण जॉर्जिया और दक्षिण सैंडविच द्वीपसमूह', 'દક્ષિણ જ્યોર્જિયા અને દક્ષિણ સેન્ડવિચ આઇલેન્ડ્સ', '{}'),
  ('KR', 'South Korea', 'दक्षिण कोरिया', 'દક્ષિણ કોરિયા', array['Korea', 'Republic of Korea']),
  ('SS', 'South Sudan', 'दक्षिण सूडान', 'દક્ષિણ સુદાન', '{}'),
  ('ES', 'Spain', 'स्पेन', 'સ્પેન', '{}'),
  ('LK', 'Sri Lanka', 'श्रीलंका', 'શ્રીલંકા', array['Ceylon']),
  ('BL', 'St. Barthélemy', 'सेंट बार्थेलेमी', 'સેંટ બાર્થેલેમી', array['St. Barthelemy']),
  ('SH', 'St. Helena', 'सेंट हेलेना', 'સેંટ હેલેના', '{}'),
  ('KN', 'St. Kitts & Nevis', 'सेंट किट्स और नेविस', 'સેંટ કિટ્સ અને નેવિસ', '{}'),
  ('LC', 'St. Lucia', 'सेंट लूसिया', 'સેંટ લુસિયા', '{}'),
  ('MF', 'St. Martin', 'सेंट मार्टिन', 'સેંટ માર્ટિન', '{}'),
  ('PM', 'St. Pierre & Miquelon', 'सेंट पिएरे और मिक्वेलान', 'સેંટ પીએરી અને મિક્યુલોન', '{}'),
  ('VC', 'St. Vincent & Grenadines', 'सेंट विंसेंट और ग्रेनाडाइंस', 'સેંટ વિન્સેંટ અને ગ્રેનેડાઇંસ', '{}'),
  ('SD', 'Sudan', 'सूडान', 'સુદાન', '{}'),
  ('SR', 'Suriname', 'सूरीनाम', 'સુરીનામ', '{}'),
  ('SJ', 'Svalbard & Jan Mayen', 'स्वालबार्ड और जान मायेन', 'સ્વાલબર્ડ અને જેન મેયન', '{}'),
  ('SE', 'Sweden', 'स्वीडन', 'સ્વીડન', '{}'),
  ('CH', 'Switzerland', 'स्विट्ज़रलैंड', 'સ્વિટ્ઝર્લૅન્ડ', '{}'),
  ('SY', 'Syria', 'सीरिया', 'સીરિયા', '{}'),
  ('TW', 'Taiwan', 'ताइवान', 'તાઇવાન', '{}'),
  ('TJ', 'Tajikistan', 'ताजिकिस्तान', 'તાજીકિસ્તાન', '{}'),
  ('TZ', 'Tanzania', 'तंज़ानिया', 'તાંઝાનિયા', array['United Republic of Tanzania']),
  ('TH', 'Thailand', 'थाईलैंड', 'થાઇલેંડ', '{}'),
  ('TL', 'Timor-Leste', 'तिमोर-लेस्त', 'તિમોર-લેસ્તે', array['East Timor']),
  ('TG', 'Togo', 'टोगो', 'ટોગો', '{}'),
  ('TK', 'Tokelau', 'तोकेलाउ', 'ટોકેલાઉ', '{}'),
  ('TO', 'Tonga', 'टोंगा', 'ટોંગા', '{}'),
  ('TT', 'Trinidad & Tobago', 'त्रिनिदाद और टोबैगो', 'ટ્રિનીદાદ અને ટોબેગો', '{}'),
  ('TN', 'Tunisia', 'ट्यूनीशिया', 'ટ્યુનિશિયા', '{}'),
  ('TR', 'Türkiye', 'तुर्किये', 'તુર્કિયે', array['Turkey', 'Turkiye']),
  ('TM', 'Turkmenistan', 'तुर्कमेनिस्तान', 'તુર્કમેનિસ્તાન', '{}'),
  ('TC', 'Turks & Caicos Islands', 'तुर्क और कैकोज़ द्वीपसमूह', 'તુર્ક્સ અને કેકોઝ આઇલેન્ડ્સ', '{}'),
  ('TV', 'Tuvalu', 'तुवालू', 'તુવાલુ', '{}'),
  ('UM', 'U.S. Outlying Islands', 'यू॰एस॰ आउटलाइंग द्वीपसमूह', 'યુ.એસ. આઉટલાઇનિંગ આઇલેન્ડ્સ', '{}'),
  ('VI', 'U.S. Virgin Islands', 'यू॰एस॰ वर्जिन द्वीपसमूह', 'યુએસ વર્જિન આઇલેન્ડ્સ', '{}'),
  ('UG', 'Uganda', 'युगांडा', 'યુગાંડા', '{}'),
  ('UA', 'Ukraine', 'यूक्रेन', 'યુક્રેન', '{}'),
  ('AE', 'United Arab Emirates', 'संयुक्त अरब अमीरात', 'યુનાઇટેડ આરબ અમીરાત', array['UAE', 'Emirates']),
  ('GB', 'United Kingdom', 'यूनाइटेड किंगडम', 'યુનાઇટેડ કિંગડમ', array['UK', 'Great Britain', 'Britain', 'England', 'U.K.']),
  ('US', 'United States', 'संयुक्त राज्य', 'યુનાઇટેડ સ્ટેટ્સ', array['USA', 'United States of America', 'America', 'U.S.A.']),
  ('UY', 'Uruguay', 'उरूग्वे', 'ઉરુગ્વે', '{}'),
  ('UZ', 'Uzbekistan', 'उज़्बेकिस्तान', 'ઉઝ્બેકિસ્તાન', '{}'),
  ('VU', 'Vanuatu', 'वनुआतू', 'વાનુઆતુ', '{}'),
  ('VA', 'Vatican City', 'वेटिकन सिटी', 'વેટિકન સિટી', '{}'),
  ('VE', 'Venezuela', 'वेनेज़ुएला', 'વેનેઝુએલા', '{}'),
  ('VN', 'Vietnam', 'वियतनाम', 'વિયેતનામ', array['Viet Nam']),
  ('WF', 'Wallis & Futuna', 'वालिस और फ़्यूचूना', 'વૉલિસ અને ફ્યુચુના', '{}'),
  ('EH', 'Western Sahara', 'पश्चिमी सहारा', 'પશ્ચિમી સહારા', '{}'),
  ('YE', 'Yemen', 'यमन', 'યમન', '{}'),
  ('ZM', 'Zambia', 'ज़ाम्बिया', 'ઝામ્બિયા', '{}'),
  ('ZW', 'Zimbabwe', 'ज़िम्बाब्वे', 'ઝિમ્બાબ્વે', '{}');

-- The code for a typed country name (or alias): case, punctuation and "&" ignored.
create or replace function public.country_code_for(p text)
returns text
language sql stable set search_path = '' as $function$
  select c.code
    from public.countries c
   where public.state_name_key(p) is not null
     and (public.state_name_key(c.name) = public.state_name_key(p)
          or exists (select 1 from unnest(c.aliases) a where public.state_name_key(a) = public.state_name_key(p)))
   order by c.code
   limit 1;
$function$;

alter table public.buyer_profiles
  add column country_code text references public.countries (code);
comment on column public.buyer_profiles.country_code is
  'The buyer''s country (public.countries), derived from the country they choose (sync_country_code). Null: not given, which counts as India. A requirement from a buyer whose country isn''t India is an overseas requirement (subscriptions P7).';

create or replace function public.sync_country_code()
returns trigger
language plpgsql set search_path = '' as $function$
begin
  -- The writer's own code wins; otherwise the code follows the typed name.
  if tg_op = 'INSERT' then
    if new.country_code is null then
      new.country_code := public.country_code_for(new.country);
    end if;
  elsif new.country is distinct from old.country and new.country_code is not distinct from old.country_code then
    new.country_code := public.country_code_for(new.country);
  end if;
  return new;
end
$function$;
create trigger trg_buyer_profiles_country_code before insert or update of country, country_code on public.buyer_profiles
  for each row execute function public.sync_country_code();

update public.buyer_profiles
   set country_code = public.country_code_for(country)
 where country is not null and btrim(country) <> '' and country_code is null
   and public.country_code_for(country) is not null;

-- ── 3. What each plan sees, and how long VIP sees it first ──────────────────────────
update public.subscription_plans set limits = limits || '{"overseas_tier": "none"}'::jsonb where id not in ('gold', 'vip');
update public.subscription_plans set limits = limits || '{"overseas_tier": "gold"}'::jsonb where id = 'gold';
update public.subscription_plans set limits = limits || '{"overseas_tier": "vip"}'::jsonb where id = 'vip';

alter table admin.lead_alert_config
  add column overseas_head_start_hours integer not null default 24 check (overseas_head_start_hours between 0 and 168);
comment on column admin.lead_alert_config.overseas_head_start_hours is
  'How long VIP vendors see an overseas requirement before Gold does, when a VIP vendor lists in its category (subscriptions P7). 0: no head start.';

-- 'vip', 'gold' or 'none' for the plan in force (the grace days count).
create or replace function admin.vendor_overseas_tier(p_vendor uuid)
returns text
language sql stable security definer set search_path = '' as $function$
  select coalesce((
    select case p.limits ->> 'overseas_tier' when 'vip' then 'vip' when 'gold' then 'gold' else 'none' end
      from admin.vendor_effective_plan(p_vendor, now()) e
      join public.subscription_plans p on p.id = e.plan_id), 'none')
$function$;

create or replace function public.my_overseas_tier()
returns text
language sql stable security definer set search_path = '' as $function$
  select case when (select auth.uid()) is null then 'none' else admin.vendor_overseas_tier((select auth.uid())) end
$function$;

-- The one rule. Not overseas: yes. VIP: yes. Gold: once the head start is over.
-- For callers that test one row or a few (the quote guard, the alert fan-out). The read policy
-- and match_vendor_rfqs write the same three lines out inline: a function with a SET clause is
-- never inlined, so it costs a call per row (48 ms against 3 ms over 20,000 requirements). Change
-- all three together; the harness reads through each.
create or replace function public.overseas_rfq_visible(p_overseas boolean, p_vip_until timestamptz, p_tier text)
returns boolean
language sql stable set search_path = '' as $function$
  select not coalesce(p_overseas, false)
      or p_tier = 'vip'
      or (p_tier = 'gold' and (p_vip_until is null or now() >= p_vip_until))
$function$;

-- A vendor who has quoted on a requirement keeps seeing it, whatever their plan becomes.
create or replace function public.vendor_quoted_rfq(p_rfq uuid)
returns boolean
language sql stable security definer set search_path = '' as $function$
  select exists (select 1 from public.quotes q where q.rfq_id = p_rfq and q.vendor_id = (select auth.uid()))
$function$;

-- ── 4. Marking a requirement ────────────────────────────────────────────────────────
alter table public.rfqs
  add column buyer_country_code text check (buyer_country_code is null or buyer_country_code ~ '^[A-Z]{2}$'),
  add column overseas boolean not null default false,
  add column overseas_vip_until timestamptz;
comment on column public.rfqs.buyer_country_code is
  'The buyer''s country when the requirement was posted (their profile''s country_code). Stamped by rfqs_overseas_stamp(); a browser can''t write it.';
comment on column public.rfqs.overseas is
  'A requirement from a buyer outside India, visible only to Gold and VIP vendors (subscriptions P7). Stamped when posted, and only when the overseas_leads switch lists the buyer; a browser can''t write it.';
comment on column public.rfqs.overseas_vip_until is
  'Until when only VIP vendors see an overseas requirement. Null: Gold sees it too (no VIP vendor listed in its category when it was posted, or it isn''t overseas, or it was sent to one vendor).';
create index rfqs_overseas_idx on public.rfqs (created_at desc) where overseas;

create or replace function public.rfqs_overseas_stamp()
returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  v_code  text;
  v_hours integer;
begin
  if tg_op = 'UPDATE' then
    -- The three columns are the database's. A write through the API is undone unless it is
    -- the service role's: the buyer's own (their update policy covers every column), an
    -- admin's by hand, anyone's with no role claim (admin.trusted_caller, P6).
    if not admin.trusted_caller() then
      new.buyer_country_code := old.buyer_country_code;
      new.overseas := old.overseas;
      new.overseas_vip_until := old.overseas_vip_until;
    end if;
    return new;
  end if;

  select b.country_code into v_code from public.buyer_profiles b where b.id = new.buyer_id;
  new.buyer_country_code := v_code;
  new.overseas := v_code is not null and v_code <> 'IN' and admin.feature_on_for('overseas_leads', new.buyer_id);
  new.overseas_vip_until := null;
  if new.overseas and new.vendor_id is null and new.category_id is not null then
    select c.overseas_head_start_hours into v_hours from admin.lead_alert_config c;
    if coalesce(v_hours, 24) > 0 and exists (
         select 1
           from public.vendor_subscriptions s
           join public.subscription_plans p on p.id = s.plan_id
          where p.limits ->> 'overseas_tier' = 'vip'
            and s.status = 'active'
            and s.current_period_end + admin.grace_interval(s.vendor_id) > now()
            and exists (select 1 from public.products pr
                         where pr.vendor_id = s.vendor_id and pr.status::text = 'live' and pr.category_id = new.category_id)) then
      new.overseas_vip_until := now() + make_interval(hours => coalesce(v_hours, 24));
    end if;
  end if;
  return new;
end
$function$;
create trigger trg_rfqs_overseas_stamp before insert or update of buyer_country_code, overseas, overseas_vip_until on public.rfqs
  for each row execute function public.rfqs_overseas_stamp();

-- ── 5. Who can read a requirement ───────────────────────────────────────────────────
-- As before, with one more test on an open requirement: the overseas rule (inline, see
-- overseas_rfq_visible), or a quote already sent. The tier is read once per query.
alter policy rfqs_select on public.rfqs using (
  ((status = 'active'::public.rfq_status)
     and ((vendor_id is null
            and (not overseas
                 or (select public.my_overseas_tier()) = 'vip'
                 or ((select public.my_overseas_tier()) = 'gold' and (overseas_vip_until is null or now() >= overseas_vip_until))
                 or public.vendor_quoted_rfq(id)))
          or (vendor_id = (select auth.uid()))))
  or (buyer_id = (select auth.uid()))
  or (select public.is_admin())
);

-- The vendor's ranked feed reads with definer rights, so it applies the rule itself.
create or replace function public.match_vendor_rfqs(p_vendor_id uuid, match_count integer default 200)
returns table(rfq_id uuid, similarity double precision, category_match boolean, score double precision)
language plpgsql stable security definer set search_path to 'public', 'extensions' as $function$
declare
  v_tier text := admin.vendor_overseas_tier(p_vendor_id);
begin
  if auth.uid() is not null and p_vendor_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with v as materialized (
    select vp.catalog_embedding as emb,
           (select array_agg(distinct p.category_id)
              from public.products p
             where p.vendor_id = vp.id
               and p.status = 'live'
               and p.category_id is not null) as cat_ids
    from public.vendor_profiles vp
    where vp.id = p_vendor_id
  ),
  pool as (
    select r.id, r.embedding, r.category_id
    from public.rfqs r
    where r.status = 'active'
      and r.vendor_id is null
      -- Overseas requirements are Gold's and VIP's (P7), or a vendor's who already quoted.
      -- overseas_rfq_visible's rule, inline (it is tested on every row).
      and (not r.overseas
           or v_tier = 'vip'
           or (v_tier = 'gold' and (r.overseas_vip_until is null or now() >= r.overseas_vip_until))
           or exists (select 1 from public.quotes q where q.rfq_id = r.id and q.vendor_id = p_vendor_id))
  ),
  scored as (
    select
      pool.id as rfq_id,
      case when v.emb is not null and pool.embedding is not null
           then (1 - (pool.embedding <=> v.emb))::double precision
      end as similarity,
      coalesce(pool.category_id is not null
                 and pool.category_id = any(v.cat_ids), false) as category_match
    from pool cross join v
  )
  select
    s.rfq_id,
    s.similarity,
    s.category_match,
    (0.7 * coalesce(s.similarity, 0)
       + 0.3 * s.category_match::int)::double precision as score
  from scored s
  order by score desc, s.similarity desc nulls last, s.rfq_id
  limit coalesce(match_count, 200);
end
$function$;

-- A quote can't be sent on a requirement the vendor can't see.
create or replace function public.enforce_quote_rfq_open()
returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare
  r_status   public.rfq_status;
  r_target   uuid;
  r_overseas boolean;
  r_until    timestamptz;
  v_tier     text;
begin
  if tg_op = 'UPDATE'
     and new.rfq_id = old.rfq_id and new.vendor_id = old.vendor_id then
    return new;
  end if;

  select r.status, r.vendor_id, r.overseas, r.overseas_vip_until
    into r_status, r_target, r_overseas, r_until
    from public.rfqs r
   where r.id = new.rfq_id;

  if not found then
    return new;  -- the rfq_id foreign key refuses it, with its own error
  end if;

  if r_status <> 'active' then
    raise exception 'This request is closed and is no longer accepting quotes.'
      using errcode = 'P0001';
  end if;

  if r_target is not null and r_target <> new.vendor_id then
    raise exception 'This request was sent to a different vendor and cannot be quoted.'
      using errcode = '42501';
  end if;

  -- Overseas requirements (P7): Gold and VIP only, VIP first. One sent to this vendor, or
  -- one they have already quoted on, is theirs to quote.
  if r_overseas and r_target is null
     and not exists (select 1 from public.quotes q where q.rfq_id = new.rfq_id and q.vendor_id = new.vendor_id) then
    v_tier := admin.vendor_overseas_tier(new.vendor_id);
    if not public.overseas_rfq_visible(true, r_until, v_tier) then
      if v_tier = 'gold' then
        raise exception 'This overseas requirement is with VIP sellers first. It opens to Gold on %.',
          to_char(r_until at time zone 'Asia/Kolkata', 'FMDD Mon, HH12:MI AM')
          using errcode = '42501';
      end if;
      raise exception 'Overseas requirements are part of the Gold and VIP plans.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

-- ── 6. Lead alerts follow the same rule ─────────────────────────────────────────────
-- admin.lead_alert_fanout() tells only vendors who can see the requirement; the daily run
-- comes back to an overseas requirement once its head start is over, to tell Gold. Both are
-- unchanged but for one line each.
do $patch$
declare
  v_def text;
  v_old text;
begin
  v_def := pg_get_functiondef('admin.lead_alert_fanout(uuid)'::regprocedure);
  v_old := '       and public.vendor_account_in_good_standing(x.vendor_id)';
  if position(v_old in v_def) = 0 then
    raise exception 'lead_alert_fanout no longer has the line this patch extends';
  end if;
  execute replace(v_def, v_old, v_old || E'\n'
    || '       and public.overseas_rfq_visible(r.overseas, r.overseas_vip_until, admin.vendor_overseas_tier(x.vendor_id))');

  v_def := pg_get_functiondef('public.lead_digest_run()'::regprocedure);
  v_old := '       and (x.rfq_id is null or x.error is not null)';
  if position(v_old in v_def) = 0 then
    raise exception 'lead_digest_run no longer has the line this patch extends';
  end if;
  execute replace(v_def, v_old,
    '       and (x.rfq_id is null or x.error is not null'
    || ' or (q.overseas and q.overseas_vip_until is not null and q.overseas_vip_until <= now() and x.ran_at < q.overseas_vip_until))');
end
$patch$;

-- Staff see how a requirement is marked on its detail (Cosora-Admin, Leads): the buyer's
-- country, and until when only VIP vendors see it. One line added; the list's columns stay.
do $patch$
declare
  v_def text := pg_get_functiondef('public.admin_lead_detail(uuid)'::regprocedure);
  v_old text := $q$           'attributes', r.attributes,$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'admin_lead_detail no longer has the line this patch extends';
  end if;
  execute replace(v_def, v_old, v_old || E'\n'
    || $q$           'overseas', case when r.overseas then jsonb_build_object('country_code', r.buyer_country_code,$q$ || E'\n'
    || $q$                         'country', (select c.name from public.countries c where c.code = r.buyer_country_code),$q$ || E'\n'
    || $q$                         'vip_until', r.overseas_vip_until) end,$q$);
end
$patch$;

-- ── 7. What everyone else is told: a number ─────────────────────────────────────────
create or replace function public.overseas_lead_count()
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_me   uuid := auth.uid();
  v_tier text;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  v_tier := admin.vendor_overseas_tier(v_me);
  return jsonb_build_object(
    'available', admin.feature_on_for('overseas_leads', v_me),
    'tier', v_tier,
    'this_month', (select count(*) from public.rfqs r
                    where r.overseas and r.vendor_id is null and r.removed_at is null
                      and r.created_at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'),
    'open', (select count(*) from public.rfqs r
              where r.overseas and r.vendor_id is null and r.status::text = 'active' and r.removed_at is null));
end
$function$;

-- ── 8. Entitlements carry it ────────────────────────────────────────────────────────
do $patch$
declare
  v_def text := pg_get_functiondef('public.vendor_entitlements(uuid)'::regprocedure);
  v_old text := $q$      'lead_alert_channels', case when paid then coalesce(lim->'lead_alert_channels', '[]'::jsonb) else '[]'::jsonb end$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'vendor_entitlements no longer has the line this patch extends';
  end if;
  execute replace(v_def, v_old, v_old || E',\n'
    || $q$      -- Overseas requirements (P7): the page is Gold's and VIP's, where the switch lists them.$q$ || E'\n'
    || $q$      'overseas_leads',     paid and coalesce(lim->>'overseas_tier', 'none') in ('gold', 'vip') and admin.feature_on_for('overseas_leads', p_vendor),$q$ || E'\n'
    || $q$      'overseas_tier',      case when paid then coalesce(lim->>'overseas_tier', 'none') else 'none' end$q$);
end
$patch$;

-- ── 9. Grants ───────────────────────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array['admin.vendor_overseas_tier(uuid)', 'public.rfqs_overseas_stamp()', 'public.sync_country_code()',
                           'public.overseas_rfq_visible(boolean,timestamptz,text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  grant execute on function public.rfqs_overseas_stamp() to service_role;
  grant execute on function public.sync_country_code() to service_role;
  grant execute on function public.overseas_rfq_visible(boolean,timestamptz,text) to service_role;
  -- The read policy calls the first two, so every reader's role needs them; they answer about
  -- the caller only. The buyer's own write runs country_code_for (through sync_country_code).
  foreach f in array array['public.my_overseas_tier()', 'public.vendor_quoted_rfq(uuid)', 'public.country_code_for(text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
  revoke all on function public.overseas_lead_count() from public, anon;
  grant execute on function public.overseas_lead_count() to authenticated;
end
$grants$;

-- ── 10. Self-check ──────────────────────────────────────────────────────────────────
do $check$
begin
  if (select count(*) from public.countries) <> 250 or public.country_code_for('united states of america') <> 'US'
     or public.country_code_for('  INDIA ') <> 'IN' or public.country_code_for('Cote d''Ivoire') <> 'CI'
     or public.country_code_for('nowhere') is not null then
    raise exception 'the countries list or its name matching is not as generated';
  end if;
  if has_function_privilege('authenticated', 'admin.vendor_overseas_tier(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.overseas_lead_count()', 'EXECUTE') then
    raise exception 'a tier other than the caller''s, or the count, must not be readable from a browser without a session';
  end if;
  if position('my_overseas_tier' in (select pg_get_expr(polqual, polrelid) from pg_policy
                                       where polrelid = 'public.rfqs'::regclass and polname = 'rfqs_select')) = 0
     or position('overseas_vip_until' in (select prosrc from pg_proc where oid = 'public.match_vendor_rfqs(uuid,integer)'::regprocedure)) = 0
     or position('overseas_rfq_visible' in (select prosrc from pg_proc where oid = 'admin.lead_alert_fanout(uuid)'::regprocedure)) = 0
     or position('overseas_vip_until <= now()' in (select prosrc from pg_proc where oid = 'public.lead_digest_run()'::regprocedure)) = 0
     or position('overseas_leads' in (select prosrc from pg_proc where oid = 'public.vendor_entitlements(uuid)'::regprocedure)) = 0
     or position('''overseas''' in (select prosrc from pg_proc where oid = 'public.admin_lead_detail(uuid)'::regprocedure)) = 0 then
    raise exception 'a patch did not apply';
  end if;
  if exists (select 1 from public.rfqs where overseas) then
    raise exception 'no requirement is overseas before the switch is first turned on';
  end if;
  if (select count(*) from public.subscription_plans where limits ? 'overseas_tier') <> (select count(*) from public.subscription_plans) then
    raise exception 'every plan says which overseas tier it is';
  end if;
  if (select enabled from public.feature_flags where key = 'overseas_leads') then
    raise exception 'overseas_leads must start switched off';
  end if;
end
$check$;
