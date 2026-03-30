import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// --- Rate limiting (in-memory, IP-based, 10 req/min) ---
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// Max base64 image size: 10 MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const SYSTEM_PROMPT = `You are a gut health nutrition analyst. Analyze this food photo and identify every food item visible.

For each food item, provide:
- name: the food item (lowercase)
- gut_score: 1-10 (10 = excellent for gut health, 1 = likely to cause issues)
- fodmap_level: "low", "medium", or "high"
- flags: array of relevant tags from: "probiotic", "prebiotic", "high-fiber", "anti-inflammatory", "irritant", "high-fat", "processed", "gluten"
- reasoning: one sentence explaining the gut health impact

Also provide:
- overall_score: 1-10 for the whole meal's gut friendliness
- summary: one sentence overall gut health assessment of the meal

Scoring guidelines:
- Fermented foods (yogurt, kimchi, sauerkraut): 8-10 (probiotic)
- High-fiber vegetables, legumes: 7-9 (prebiotic, high-fiber)
- Lean proteins (chicken, fish, eggs): 6-8 (neutral to good)
- Whole grains (oats, brown rice): 6-8 (high-fiber)
- Refined grains (white bread, pasta): 3-5 (low fiber, may cause bloating)
- Fried foods, processed meats: 2-4 (irritant, high-fat)
- High-FODMAP foods (onion, garlic, wheat): mark as high FODMAP
- Dairy: varies (yogurt = good, ice cream = poor)
- Spicy foods: 3-5 (potential irritant)

Return ONLY valid JSON matching this exact structure, no markdown fences:
{"foods":[{"name":"...","gut_score":0,"fodmap_level":"...","flags":[],"reasoning":"..."}],"overall_score":0,"summary":"..."}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  // --- 1. Auth verification ---
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing authorization" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired token" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // --- 3. Rate limiting ---
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const { image, mimeType } = await req.json();

    if (!image) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // --- 4. Request body size validation (10 MB base64 limit) ---
    if (typeof image === "string" && image.length > MAX_IMAGE_SIZE) {
      return new Response(
        JSON.stringify({ error: "Image exceeds 10 MB limit" }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      );
    }

    // --- 2. Call Gemini Vision API with API key in header ---
    const geminiResponse = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: SYSTEM_PROMPT },
              {
                inline_data: {
                  mime_type: mimeType || "image/jpeg",
                  data: image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to analyze image" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    const geminiData = await geminiResponse.json();

    // Extract the text response from Gemini's format
    const responseText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      return new Response(
        JSON.stringify({ error: "No analysis returned" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    // Parse the JSON response (Gemini with responseMimeType should return clean JSON)
    let analysis;
    try {
      analysis = JSON.parse(responseText);
    } catch {
      // Try to extract JSON from markdown fences if present
      const jsonMatch = responseText.match(/```json?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error("Could not parse response as JSON");
      }
    }

    return new Response(JSON.stringify(analysis), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
