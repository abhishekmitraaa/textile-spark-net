// Supabase Edge Function: support-receipt
//
// The email receipt for app feedback and fraud reports (Help & Support P6; D-20, D-22).
// The app calls it right after support_submit_feedback / support_report_fraud succeed, with
// the request number. The screen and the bell already show the number; this adds an email
// when one can go, and the app says "we've emailed you" only on "sent".
//
// POST { ticket_no }  (signed in; verify_jwt = true, so `sub` is trustworthy)
//   -> { status: "sent", to }            Resend accepted it; `to` is masked
//    | { status: "not_configured" }      no Resend key yet (nothing recorded)
//    | { status: "no_email" }            no confirmed address (phone sign-in accounts)
//    | { status: "already_sent" }        one receipt per request
//    | { status: "send_failed" }         Resend refused; after 3 failures it stops trying
//    | { status: "not_found" }           not the caller's, or not feedback / a fraud report
//
// The email repeats nothing the person wrote (D-22): the request number, what happens next,
// and where to follow it. Text in the request's language (en, hi, gu).
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (platform), RESEND_API_KEY, RESEND_FROM.

import { escapeHtml, maskEmail, sendEmail } from "../_shared/resend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}

function userIdFromJwt(req: Request): string | null {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

const REST = (key: string) => ({ apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" });

type Lang = "en" | "hi" | "gu";
type Channel = "feedback" | "fraud_report";

const COPY: Record<Channel, Record<Lang, { subject: (no: string) => string; lines: (no: string) => string[] }>> = {
  fraud_report: {
    en: {
      subject: (no) => `We've received your report ${no}`,
      lines: (no) => [
        `Thank you for telling us. We've recorded your report as ${no}.`,
        "Our team reviews every report. You'll see in My requests on Cosora when it has been reviewed.",
        "For your safety, this email doesn't repeat what you told us.",
      ],
    },
    hi: {
      subject: (no) => `हमें आपकी रिपोर्ट ${no} मिल गई है`,
      lines: (no) => [
        `हमें बताने के लिए धन्यवाद। हमने आपकी रिपोर्ट ${no} के रूप में दर्ज कर ली है।`,
        "हमारी टीम हर रिपोर्ट की समीक्षा करती है। समीक्षा होने पर आप कोसोरा पर मेरे अनुरोध में देख सकेंगे।",
        "आपकी सुरक्षा के लिए, इस ईमेल में आपकी बताई बातें दोहराई नहीं गई हैं।",
      ],
    },
    gu: {
      subject: (no) => `અમને તમારો રિપોર્ટ ${no} મળ્યો છે`,
      lines: (no) => [
        `અમને જણાવવા બદલ આભાર. અમે તમારો રિપોર્ટ ${no} તરીકે નોંધ્યો છે.`,
        "અમારી ટીમ દરેક રિપોર્ટની સમીક્ષા કરે છે. સમીક્ષા થાય ત્યારે તમે કોસોરા પર મારી વિનંતીઓમાં જોઈ શકશો.",
        "તમારી સલામતી માટે, આ ઈમેલમાં તમે જણાવેલી વાતો ફરી લખવામાં આવી નથી.",
      ],
    },
  },
  feedback: {
    en: {
      subject: (no) => `We've received your feedback ${no}`,
      lines: (no) => [
        `Thanks for your feedback. We've recorded it as ${no}.`,
        "The team reads every note. Any reply appears in My requests on Cosora.",
      ],
    },
    hi: {
      subject: (no) => `हमें आपका सुझाव ${no} मिल गया है`,
      lines: (no) => [
        `आपके सुझाव के लिए धन्यवाद। हमने इसे ${no} के रूप में दर्ज कर लिया है।`,
        "टीम हर नोट पढ़ती है। कोई भी जवाब कोसोरा पर मेरे अनुरोध में दिखेगा।",
      ],
    },
    gu: {
      subject: (no) => `અમને તમારો પ્રતિસાદ ${no} મળ્યો છે`,
      lines: (no) => [
        `તમારા પ્રતિસાદ બદલ આભાર. અમે તેને ${no} તરીકે નોંધ્યો છે.`,
        "ટીમ દરેક નોંધ વાંચે છે. કોઈ પણ જવાબ કોસોરા પર મારી વિનંતીઓમાં દેખાશે.",
      ],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // The anon key is a valid JWT too, but it carries no `sub`.
  const userId = userIdFromJwt(req);
  if (!userId) return json({ error: "sign_in_required" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const ticketNo = typeof body.ticket_no === "string" ? body.ticket_no.trim() : "";
  if (!/^CS-\d{6,}$/.test(ticketNo)) return json({ status: "not_found" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  const target = await fetch(`${url}/rest/v1/rpc/support_receipt_target`, {
    method: "POST", headers: REST(serviceKey), body: JSON.stringify({ p_ticket_no: ticketNo, p_user: userId }),
  });
  if (!target.ok) return json({ status: "error", message: `Could not look up the request (${target.status}).` });
  const t = await target.json();
  if (t?.status !== "ok") return json({ status: t?.status ?? "error" });

  const channel: Channel = t.channel === "fraud_report" ? "fraud_report" : "feedback";
  const lang: Lang = t.language === "hi" || t.language === "gu" ? t.language : "en";
  const copy = COPY[channel][lang];
  const lines = copy.lines(t.ticket_no);
  const result = await sendEmail({
    to: t.email,
    subject: copy.subject(t.ticket_no),
    text: `${lines.join("\n\n")}\n\nCosora`,
    html: `${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}<p>Cosora</p>`,
  });

  // Nothing was attempted without a key, so nothing is recorded: the receipt can still go
  // once Resend is set up (the person can't trigger it again, but support can resend).
  if (result.status === "not_configured") return json({ status: "not_configured" });

  await fetch(`${url}/rest/v1/rpc/support_receipt_record`, {
    method: "POST",
    headers: REST(serviceKey),
    body: JSON.stringify({
      p_ticket_id: t.ticket_id,
      p_sent: result.status === "sent",
      p_detail: result.status === "send_failed" ? result.message : null,
    }),
  });
  if (result.status === "sent") return json({ status: "sent", to: maskEmail(t.email) });
  return json({ status: "send_failed" });
});
