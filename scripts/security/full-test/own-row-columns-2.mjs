// Second column sweep: the other tables a browser may write. LOCAL ONLY.
import { TAG, sql, section, rest, seller, buyer, buy, cleanup } from "./lib.mjs";
const cat = sql("select id from public.categories where parent_id is not null order by name limit 1");
const valueFor = (type, cur) => {
  if (type === "boolean") return !(cur === true || cur === "t");
  if (/^(integer|bigint)$/.test(type)) return 987654;
  if (type === "smallint") return cur === "5" ? 1 : 5;
  if (/^(numeric|double precision|real)/.test(type)) return 4.9;
  if (/^timestamp/.test(type)) return "2099-01-01T00:00:00Z";
  if (type === "jsonb" || type === "json") return { probe: TAG };
  if (type === "uuid") return crypto.randomUUID();
  if (type === "ARRAY") return ["XX"];
  if (type === "USER-DEFINED") return null;
  return `probe-${TAG}`;
};
const enumLabels = (udt) => sql(`select coalesce(string_agg(e.enumlabel, ',' order by e.enumsortorder), '') from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = '${udt}'`).split(",").filter(Boolean);
async function probe(table, where, whereSql, actor, skip = [], label = table) {
  const cols = sql(`select string_agg(column_name || '|' || data_type || '|' || udt_name || '|' || is_generated, ';' order by ordinal_position)
                      from information_schema.columns where table_schema = 'public' and table_name = '${table}'`).split(";").map((x) => x.split("|"));
  const accepted = [];
  for (const [col, type, udt, gen] of cols) {
    if (skip.includes(col) || gen === "ALWAYS" || udt === "halfvec") continue;
    const before = sql(`select coalesce(${col}::text, '∅') from public.${table} where ${whereSql}`);
    let candidates = [valueFor(type, before)];
    if (type === "USER-DEFINED") { const labels = enumLabels(udt); if (!labels.length) continue; candidates = labels.filter((l) => l !== before); }
    for (const val of candidates) {
      await rest("PATCH", `${table}?${where}`, actor.h, { [col]: val }, "return=minimal");
      const after = sql(`select coalesce(${col}::text, '∅') from public.${table} where ${whereSql}`);
      if (after !== before) {
        accepted.push(`${col}: ${before.slice(0, 18)} → ${after.slice(0, 22)}`);
        sql(`update public.${table} set ${col} = ${before === "∅" ? "null" : `'${before.replace(/'/g, "''")}'`} where ${whereSql}`);
        if (type !== "USER-DEFINED") break;
      }
    }
  }
  console.log(`\n${label}: a browser changed ${accepted.length} of ${cols.length} columns of its own row`);
  for (const a of accepted) console.log(`   ${a}`);
}
const step = async (name, fn) => { try { await fn(); } catch (e) { console.log(`\n${name}: could not run (${String(e?.message ?? e).split("\n")[0].slice(0, 200)})`); } };
try {
  section("Which columns of their own rows can a signed-in account change? (second sweep)");
  const s = await seller("mass2");
  await buy(s, "gold");
  const b = await buyer("mass2b", { country: "India", countryCode: "IN" });
  const p = (await rest("POST", "products?select=id", s.h, { vendor_id: s.id, name: `FT mass2 ${TAG}`, category_id: cat, status: "under_review", price_value: 10 })).body[0].id;
  sql(`update public.products set status = 'live' where id = '${p}';`);

  await step("product_videos", async () => {
    const r = await rest("POST", "product_videos?select=id,status,likes_count,views_count,rating", s.h, { vendor_id: s.id, product_id: p, video_url: "https://example.com/v.mp4", thumbnail_url: "https://example.com/t.jpg", likes_count: 5000, views_count: 5000, rating: 5, status: "live", created_at: "2099-01-01T00:00:00Z" });
    console.log(`\nproduct_videos, created with counters, rating and 'live' preset: ${r.status} ${JSON.stringify(r.body).slice(0, 220)}`);
    const id = r.body[0].id;
    await probe("product_videos", `id=eq.${id}`, `id = '${id}'`, s, ["id", "vendor_id"]);
    sql(`update public.product_videos set status = 'live' where id = '${id}';`);
    await probe("product_videos", `id=eq.${id}`, `id = '${id}'`, s, ["id", "vendor_id"], "product_videos (LIVE)");
    sql(`update public.product_videos set status = 'draft' where id = '${id}';`);
  });
  await step("catalogues", async () => {
    const r = await rest("POST", "catalogues?select=id,status", s.h, { vendor_id: s.id, title: `FT cat ${TAG}`, status: "live", page_count: 999, created_at: "2099-01-01T00:00:00Z" });
    console.log(`\ncatalogues, created as 'live': ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    const id = r.body[0].id;
    await probe("catalogues", `id=eq.${id}`, `id = '${id}'`, s, ["id", "vendor_id"]);
  });
  await step("vendor_documents", async () => {
    const r = await rest("POST", "vendor_documents?select=id,verified,reviewed_at", s.h, { vendor_id: s.id, doc_type: "gst", file_url: "x/y.pdf", verified: true, reviewed_at: "2026-01-01T00:00:00Z", reviewed_by: s.id });
    console.log(`\nvendor_documents, created as already verified: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    const id = r.body[0].id;
    await probe("vendor_documents", `id=eq.${id}`, `id = '${id}'`, s, ["id", "vendor_id"]);
  });
  await step("reviews", async () => {
    const r = await rest("POST", "reviews?select=id,rating,created_at,reply_body", b.h, { vendor_id: s.id, buyer_id: b.id, rating: 4, body: "ok", reply_body: "forged reply from the seller", replied_at: "2026-01-01T00:00:00Z", created_at: "2020-01-01T00:00:00Z" });
    console.log(`\nreviews, buyer creates one with a seller reply and an old date preset: ${r.status} ${JSON.stringify(r.body).slice(0, 220)}`);
    const id = r.body[0].id;
    await probe("reviews", `id=eq.${id}`, `id = '${id}'`, b, ["id", "buyer_id"], "reviews (as the buyer who wrote it)");
    await probe("reviews", `id=eq.${id}`, `id = '${id}'`, s, ["id", "buyer_id"], "reviews (as the seller reviewed)");
    const self = await rest("POST", "reviews?select=id", s.h, { vendor_id: s.id, buyer_id: s.id, rating: 5, body: "great seller (me)" });
    console.log(`reviews, a seller reviews their own business 5 stars: ${self.status} ${JSON.stringify(self.body).slice(0, 160)}`);
  });
  await step("product_reviews", async () => {
    const r = await rest("POST", "product_reviews?select=id,rating,created_at", b.h, { product_id: p, buyer_id: b.id, rating: 4, body: "ok", created_at: "2020-01-01T00:00:00Z" });
    console.log(`\nproduct_reviews, buyer creates one with an old date: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    const id = r.body[0].id;
    await probe("product_reviews", `id=eq.${id}`, `id = '${id}'`, b, ["id", "buyer_id", "product_id"], "product_reviews (as the buyer)");
    const self = await rest("POST", "product_reviews?select=id", s.h, { product_id: p, buyer_id: s.id, rating: 5, body: "my own product is great" });
    console.log(`product_reviews, a seller reviews their own product 5 stars: ${self.status} ${JSON.stringify(self.body).slice(0, 160)}; product now rated ${sql(`select rating_avg || ' from ' || reviews_count from public.products where id = '${p}'`)}`);
  });
  await step("follows", async () => {
    const r = await rest("POST", "follows", s.h, { follower_id: s.id, vendor_id: s.id }, "return=minimal");
    console.log(`\nfollows, a seller follows themselves: ${r.status}; followers_count now ${sql(`select followers_count from public.vendor_profiles where id = '${s.id}'`)}`);
  });
} catch (err) {
  console.log("CRASH " + (err?.stack ?? err));
} finally {
  cleanup();
}
