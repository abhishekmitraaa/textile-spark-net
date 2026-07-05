// Supabase Edge Function: image-search
//
// Turns an uploaded product photo into a short text search query using a
// vision model (OpenAI GPT-4o-mini by default), which the Search page then
// runs against the normal catalogue search. Keeps the API key server-side.
//
// Required secret:  OPENAI_API_KEY      (set in Supabase -> Edge Functions -> Secrets)
// Optional secret:  IMAGE_SEARCH_MODEL  (default: gpt-4o-mini)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

const PROMPT =
  "A B2B fashion/textile buyer uploaded this photo to search a sourcing marketplace. " +
  "Reply with ONLY a short product search query (3-6 words, lowercase, no punctuation) " +
  "describing the main apparel or textile item, including colour and garment type if visible. " +
  "Example: men white cotton polo t-shirt";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: { image?: string; mimeType?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const { image, mimeType } = payload;
  if (!image) return json({ error: "no_image" }, 400);

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    // Not wired up yet — the client shows a friendly "not configured" message.
    return json({ error: "not_configured" }, 200);
  }

  const model = Deno.env.get("IMAGE_SEARCH_MODEL") || "gpt-4o-mini";
  const media = mimeType || "image/jpeg";
  // OpenAI's vision input takes a data URL directly.
  const dataUrl = image.startsWith("data:") ? image : `data:${media};base64,${image}`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 40,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const detail = (await resp.text()).slice(0, 300);
      return json({ error: "vision_failed", detail }, 200);
    }

    const data = await resp.json();
    const query = String(data?.choices?.[0]?.message?.content ?? "")
      .trim()
      .replace(/^["']+|["']+$/g, "");
    if (!query) return json({ error: "no_query" }, 200);
    return json({ query });
  } catch (e) {
    return json({ error: "request_failed", detail: String(e) }, 200);
  }
});
