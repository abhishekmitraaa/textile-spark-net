// Which columns of their OWN rows can a signed-in seller or buyer change through the API? One column at a time, on
// the LOCAL stack. The list is then read by a person: a column the server is meant to own (a count, a rating, a
// status, a verification, a plan) should not be in it.
import { TAG, sql, section, rest, seller, buyer, buy, cleanup } from "./lib.mjs";

const cat = sql("select id from public.categories where parent_id is not null order by name limit 1");
const valueFor = (type, cur) => {
  if (type === "boolean") return !(cur === true || cur === "t");
  if (/^(integer|bigint|smallint)$/.test(type)) return 987654;
  if (/^(numeric|double precision|real)/.test(type)) return 4.9;
  if (/^timestamp/.test(type)) return "2099-01-01T00:00:00Z";
  if (type === "date") return "2099-01-01";
  if (/^time/.test(type)) return "03:00";
  if (type === "jsonb" || type === "json") return { probe: TAG };
  if (type === "uuid") return crypto.randomUUID();
  if (type === "ARRAY") return ["XX"];
  if (type === "USER-DEFINED") return null;          // enums and vectors: handled below
  return `probe-${TAG}`;
};
const enumLabels = (udt) => sql(`select coalesce(string_agg(e.enumlabel, ',' order by e.enumsortorder), '') from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = '${udt}'`).split(",").filter(Boolean);

async function probe(table, keyCol, keyVal, actor, skip = [], label = table) {
  const cols = sql(`select string_agg(column_name || '|' || data_type || '|' || udt_name || '|' || is_generated, ';' order by ordinal_position)
                      from information_schema.columns where table_schema = 'public' and table_name = '${table}'`).split(";").map((x) => x.split("|"));
  const accepted = [], refused = [];
  for (const [col, type, udt, gen] of cols) {
    if (col === keyCol || skip.includes(col) || gen === "ALWAYS") continue;
    const before = sql(`select coalesce(${col}::text, '∅') from public.${table} where ${keyCol} = '${keyVal}'`);
    let candidates = [valueFor(type, before)];
    if (type === "USER-DEFINED") { const labels = enumLabels(udt); if (!labels.length) continue; candidates = labels.filter((l) => l !== before); }
    let took = null;
    for (const val of candidates) {
      // return=minimal: asking for the row back fails on tables with private columns, which would hide a write that worked.
      const r = await rest("PATCH", `${table}?${keyCol}=eq.${keyVal}`, actor.h, { [col]: val }, "return=minimal");
      const after = sql(`select coalesce(${col}::text, '∅') from public.${table} where ${keyCol} = '${keyVal}'`);
      if (after !== before) { took = `${col}: ${before.slice(0, 18)} → ${after.slice(0, 22)}`; sql(`set cosora.ad_review = 'on'; update public.${table} set ${col} = ${before === "∅" ? "null" : `'${before.replace(/'/g, "''")}'`} where ${keyCol} = '${keyVal}'`); break; }
      else if (r.status >= 400 && candidates.length === 1) refused.push(col);
    }
    if (took) accepted.push(took);
  }
  console.log(`\n${label}: a browser changed ${accepted.length} of ${cols.length} columns of its own row`);
  for (const a of accepted) console.log(`   ${a}`);
}

try {
  section("Which columns of their own rows can a signed-in account change?");
  const s = await seller("mass");
  await buy(s, "basic");
  const b = await buyer("massb", { country: "India", countryCode: "IN" });
  const p = (await rest("POST", "products?select=id", s.h, { vendor_id: s.id, name: `FT mass ${TAG}`, category_id: cat, status: "under_review", price_value: 10 })).body[0].id;
  sql(`update public.products set status = 'live' where id = '${p}';`);
  const ad = (await rest("POST", "advertisements?select=id", s.h, { vendor_id: s.id, title: `FT mass ad ${TAG}`, product_id: p, target_states: ["GJ"] })).body[0].id;
  const rfq = (await rest("POST", "rfqs?select=id", b.h, { buyer_id: b.id, title: `FT mass rfq ${TAG}`, category_id: cat, quantity: 5 })).body[0].id;
  const q = (await rest("POST", "quotes?select=id", s.h, { rfq_id: rfq, vendor_id: s.id, price_per_unit: 10, moq: 1 })).body[0].id;

  if (!process.env.ONLY_PAID) {
  await probe("products", "id", p, s, ["vendor_id", "embedding", "fts", "search_text"]);
  await probe("vendor_profiles", "id", s.id, s, ["catalog_embedding"]);
  await probe("profiles", "id", s.id, s);
  await probe("advertisements", "id", ad, s, ["vendor_id"]);
  await probe("quotes", "id", q, s, ["rfq_id", "vendor_id"]);
  await probe("buyer_profiles", "id", b.id, b);
  await probe("rfqs", "id", rfq, b, ["buyer_id", "embedding"]);
  }

  // The same ad once it is paid for and running; and rows created with server-owned values preset.
  sql(`set cosora.ad_review = 'on'; update public.advertisements set status = 'active', starts_at = now(), ends_at = now() + interval '7 days', placement = 'home' where id = '${ad}';`);
  await probe("advertisements", "id", ad, s, ["vendor_id"], "advertisements (ACTIVE, paid for 7 days)");
  const pre = await rest("POST", "products?select=id,views_count,sold_count,enquiries_count,rating_avg,reviews_count,created_at", s.h,
    { vendor_id: s.id, name: `FT preset ${TAG}`, category_id: cat, status: "under_review", views_count: 5000, sold_count: 5000, enquiries_count: 5000, rating_avg: 5, reviews_count: 900, created_at: "2099-01-01T00:00:00Z" });
  console.log(`\nproducts, created with counters and date preset: ${pre.status} ${JSON.stringify(pre.body)}`);
  const prer = await rest("POST", "rfqs?select=id,created_at", b.h, { buyer_id: b.id, title: `FT preset rfq ${TAG}`, category_id: cat, created_at: "2099-01-01T00:00:00Z" });
  console.log(`rfqs, created with a future date: ${prer.status} ${JSON.stringify(prer.body)}`);
  const prea = await rest("POST", "advertisements?select=id,status,created_at,impressions,clicks,starts_at,ends_at", s.h,
    { vendor_id: s.id, title: `FT preset ad ${TAG}`, product_id: p, status: "active", created_at: "2099-01-01T00:00:00Z", impressions: 99999, clicks: 9999, starts_at: new Date().toISOString(), ends_at: "2099-01-01T00:00:00Z" });
  console.log(`advertisements, created as active with a future date and counters: ${prea.status} ${JSON.stringify(prea.body)}`);
} catch (err) {
  console.log("CRASH " + (err?.stack ?? err));
} finally {
  cleanup();
}
