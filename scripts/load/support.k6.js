/**
 * Help & Support load test (plan P7, section 4). LOCAL STACK ONLY: it writes tickets and
 * messages, so it refuses any URL that isn't on this machine.
 *
 * Each VU is one signed-in load user (local-load-NNN@cosora.test, made by
 * scripts/local-stack/bootstrap.mjs with LOAD_USERS=n). A VU opens one chat, then loops:
 * post a message, read the thread, list its requests, at a pace inside the per-user limit
 * (30 messages in 5 minutes). A second scenario is Support working the inbox. The rate
 * limits are part of the product, so a P0001 `rate_limited` answer is counted on its own
 * (`support_rate_limited`), not as a failure.
 *
 * The numbers describe a laptop running the whole stack in Docker, so they show where the
 * database work goes and that nothing errors under concurrency, not production capacity.
 *
 * Run with Docker (no k6 install needed), from the repo root:
 *   docker run --rm -i --add-host=host.docker.internal:host-gateway \
 *     -e URL=http://host.docker.internal:54321 -e ANON=<local anon key> -e PASSWORD=<local test password> \
 *     -e VUS=50 -e DURATION=2m grafana/k6 run - < scripts/load/support.k6.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const URL_BASE = __ENV.URL;
if (!URL_BASE) throw new Error("set -e URL=<local API URL>");
if (!/^http:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal)(:\d+)?$/.test(URL_BASE)) {
  throw new Error(`Refusing to run: ${URL_BASE} is not a local stack.`);
}
const ANON = __ENV.ANON;
const PASSWORD = __ENV.PASSWORD;
const VUS = Number(__ENV.VUS || 50);
const DURATION = __ENV.DURATION || "2m";
const STAFF = __ENV.STAFF_EMAIL || "local-support@cosora.test";

const rateLimited = new Counter("support_rate_limited");
const startMs = new Trend("support_start_chat_ms", true);
const postMs = new Trend("support_post_message_ms", true);
const readMs = new Trend("support_request_detail_ms", true);
const listMs = new Trend("support_my_requests_ms", true);
const inboxMs = new Trend("admin_support_list_ms", true);

export const options = {
  scenarios: {
    requesters: { executor: "constant-vus", exec: "requester", vus: VUS, duration: DURATION },
    staff: { executor: "constant-vus", exec: "staff", vus: 2, duration: DURATION },
  },
  thresholds: {
    "http_req_failed{scenario:requesters}": ["rate<0.01"],
    "http_req_failed{scenario:staff}": ["rate<0.01"],
    support_post_message_ms: ["p(95)<1500"],
    support_request_detail_ms: ["p(95)<1500"],
  },
};

function signIn(email) {
  const r = http.post(`${URL_BASE}/auth/v1/token?grant_type=password`, JSON.stringify({ email, password: PASSWORD }), {
    headers: { apikey: ANON, "Content-Type": "application/json" },
  });
  if (r.status !== 200) throw new Error(`${email}: sign-in ${r.status} ${r.body}`);
  return r.json("access_token");
}

export function setup() {
  const users = [];
  for (let i = 1; i <= VUS; i++) users.push(signIn(`local-load-${String(i).padStart(3, "0")}@cosora.test`));
  return { users, staff: signIn(STAFF) };
}

function rpc(token, name, body, trend) {
  const r = http.post(`${URL_BASE}/rest/v1/rpc/${name}`, JSON.stringify(body), {
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    tags: { name },
    // A rate-limit refusal is a 400 with hint rate_limited: expected, counted separately.
    responseCallback: http.expectedStatuses(200, 204, 400),
  });
  trend.add(r.timings.duration);
  if (r.status === 400) {
    if (/rate_limited|too_many_open/.test(r.body)) rateLimited.add(1);
    else check(r, { [`${name} ok`]: () => false });
  } else check(r, { [`${name} ok`]: (x) => x.status === 200 || x.status === 204 });
  return r;
}

const tickets = {};
export function requester(data) {
  const token = data.users[(__VU - 1) % data.users.length];
  if (!tickets[__VU]) {
    const r = rpc(token, "support_start_chat", { p_category: "technical", p_body: `Load test chat from VU ${__VU}`, p_language: "en" }, startMs);
    if (r.status !== 200) { sleep(5); return; }
    tickets[__VU] = { id: r.json("ticket_id"), no: r.json("ticket_no") };
  }
  const t = tickets[__VU];
  rpc(token, "support_post_message", { p_ticket_id: t.id, p_body: `message ${__ITER} from VU ${__VU}` }, postMs);
  rpc(token, "support_request_detail", { p_ticket_no: t.no }, readMs);
  rpc(token, "support_my_requests", { p_limit: 100 }, listMs);
  sleep(10 + Math.random() * 2); // about 25 messages per user in 5 minutes: under the limit of 30
}

export function staff(data) {
  rpc(data.staff, "admin_support_list", {}, inboxMs);
  sleep(2);
}
