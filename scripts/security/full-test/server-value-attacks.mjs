// Can a seller write their own search vectors, or read a competitor's? And does a draft ad order a printed certificate? LOCAL ONLY.
import { TAG, sql, section, attack, note, rest, seller, buy, cleanup, summary } from "./lib.mjs";
const cat = sql("select id from public.categories where parent_id is not null order by name limit 1");
try {
  const s = await seller("embed");
  await buy(s, "basic");
  const p = (await rest("POST", "products?select=id", s.h, { vendor_id: s.id, name: `FT embed ${TAG}`, category_id: cat, status: "under_review", price_value: 10 })).body[0].id;
  const dims = sql("select coalesce((select vector_dims(embedding) from public.products where embedding is not null limit 1), (select atttypmod from pg_attribute where attrelid = 'public.products'::regclass and attname = 'embedding'))");
  const vec = "[" + Array.from({ length: Number(dims) }, () => "0.01").join(",") + "]";
  section(`E. Search vectors (${dims} numbers)`);
  const before = sql(`select coalesce(md5(embedding::text), 'none') from public.products where id = '${p}'`);
  const w = await rest("PATCH", `products?id=eq.${p}`, s.h, { embedding: vec }, "return=minimal");
  const after = sql(`select coalesce(md5(embedding::text), 'none') from public.products where id = '${p}'`);
  attack("E1 seller writes their own product's search vector", after === before, `${w.status} ${w.body?.message ?? ""} ${before} → ${after}`);
  const ins = await rest("POST", "products?select=id", s.h, { vendor_id: s.id, name: `FT embed preset ${TAG}`, category_id: cat, status: "under_review", embedding: vec });
  const insId = ins.body?.[0]?.id;
  attack("E2 seller creates a product with a search vector already set", !(insId && sql(`select embedding is not null from public.products where id = '${insId}'`) === "t"), `${ins.status} ${ins.body?.message ?? ""}`);
  const vb = sql(`select coalesce(md5(catalog_embedding::text), 'none') from public.vendor_profiles where id = '${s.id}'`);
  const vw = await rest("PATCH", `vendor_profiles?id=eq.${s.id}`, s.h, { catalog_embedding: vec }, "return=minimal");
  const va = sql(`select coalesce(md5(catalog_embedding::text), 'none') from public.vendor_profiles where id = '${s.id}'`);
  attack("E3 seller writes their own catalogue vector (decides which leads they are matched to)", va === vb, `${vw.status} ${vw.body?.message ?? ""} ${vb} → ${va}`);
  const rd = await rest("GET", "products?select=id,embedding&status=eq.live&embedding=not.is.null&limit=1", s.h);
  attack("E4 seller reads another seller's product search vector (to copy it)", !(rd.rows > 0 && rd.body[0].embedding), `${rd.status} ${typeof rd.body === "object" ? JSON.stringify(rd.body).slice(0, 80) : rd.body}`);

  section("F. A printed certificate without paying");
  const cb = sql(`select count(*) from public.certificate_orders where vendor_id = '${s.id}'`);
  const ad = await rest("POST", "advertisements?select=id,status", s.h, { vendor_id: s.id, title: `FT cert ${TAG}`, status: "draft", placement: "verifiedCertificate" });
  const ca = sql(`select count(*) || ' ' || coalesce(string_agg(reference || ':' || status, ','), '') from public.certificate_orders where vendor_id = '${s.id}'`);
  attack("F1 a draft ad naming the certificate puts a print-and-ship order in the fulfilment queue", ca.startsWith(cb + " ") || ca === cb, `insert ${ad.status} ${JSON.stringify(ad.body?.[0] ?? ad.body).slice(0, 100)}; certificate orders ${cb} → ${ca}`);
  sql(`delete from public.certificate_orders where vendor_id = '${s.id}';`);

  section("G. Other values the server is meant to own");
  const yr = await rest("PATCH", `vendor_profiles?id=eq.${s.id}`, s.h, { followers_count: 250000 }, "return=minimal");
  attack("G1 seller sets their own follower count", sql(`select followers_count from public.vendor_profiles where id = '${s.id}'`) === "0", `${yr.status}`);
  const oc = await rest("PATCH", `vendor_profiles?id=eq.${s.id}`, s.h, { onboarding_complete: false }, "return=minimal");
  note("G2 seller flips onboarding_complete", `${oc.status} now ${sql(`select onboarding_complete from public.vendor_profiles where id = '${s.id}'`)}`);
  const rp = await rest("PATCH", `vendor_profiles?id=eq.${s.id}`, s.h, { recommended_product_ids: [p], served_states: ["GJ", "MH"], year_established: 1901 }, "return=minimal");
  note("G3 seller sets recommended products, served states, year established (their own to set)", `${rp.status} ${sql(`select array_length(recommended_product_ids, 1) || '|' || served_states::text || '|' || year_established from public.vendor_profiles where id = '${s.id}'`)}`);
} catch (err) {
  console.log("CRASH " + (err?.stack ?? err));
} finally {
  cleanup();
  summary("Vectors, certificate, counters");
}
