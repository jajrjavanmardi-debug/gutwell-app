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
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type AppLanguage = "en" | "de" | "fa";

const LANGUAGE_COPY: Record<AppLanguage, { name: string; rule: string }> = {
  en: {
    name: "English",
    rule: "Write all food names, reasoning, and summary values in English.",
  },
  de: {
    name: "German",
    rule: "Write all food names, reasoning, and summary values in German.",
  },
  fa: {
    name: "Persian",
    rule: "Write all food names, reasoning, and summary values in Persian using Persian script.",
  },
};

function parseLanguage(value: unknown): AppLanguage {
  return value === "de" || value === "fa" ? value : "en";
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function buildSystemPrompt(language: AppLanguage): string {
  const languageCopy = LANGUAGE_COPY[language];

  return `You are a gut wellness food insight assistant. Analyze this food photo for educational pattern tracking and describe likely food items visible without pretending certainty.

Selected app language: ${languageCopy.name}.
Language rule: ${languageCopy.rule} Return only JSON keys in English, but all user-visible string values must be in ${languageCopy.name}.

For each food item, provide:
- name: the food item (lowercase)
- gut_score: 1-10 (10 = very gut-supportive for this educational context, 1 = may be associated with more discomfort)
- fodmap_level: "low", "medium", or "high"
- flags: array of relevant tags from: "probiotic", "prebiotic", "high-fiber", "balanced-fat", "possible-discomfort", "high-fat", "processed", "gluten"
- reasoning: one sentence explaining the possible gut wellness pattern without diagnosis or certainty

Also provide:
- overall_score: 1-10 for the whole meal's likely gut-friendliness in this educational context
- summary: one sentence educational meal pattern summary

Scoring guidelines:
- Fermented foods (yogurt, kimchi, sauerkraut): often 8-10 (probiotic), unless the meal context suggests otherwise
- High-fiber vegetables, legumes: often 7-9 (prebiotic, high-fiber), but note possible bloating patterns when relevant
- Lean proteins (chicken, fish, eggs): often 6-8 (neutral to supportive)
- Whole grains (oats, brown rice): 6-8 (high-fiber)
- Refined grains (white bread, pasta): 3-5 (low fiber, may be associated with bloating for some people)
- Fried foods, processed meats: 2-4 (possible-discomfort, high-fat)
- High-FODMAP foods (onion, garlic, wheat): mark as high FODMAP and describe as possible trigger patterns, without claiming certainty
- Dairy: varies (yogurt may be supportive for some; ice cream may be less comfortable for some)
- Spicy foods: 3-5 (possible-discomfort)

Return ONLY valid JSON matching this exact structure, no markdown fences:
{"foods":[{"name":"...","gut_score":0,"fodmap_level":"...","flags":[],"reasoning":"..."}],"overall_score":0,"summary":"..."}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // --- 1. Auth verification ---
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return jsonResponse(
      { code: "UNAUTHORIZED", message: "Missing authorization", retryable: false },
      401,
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
    return jsonResponse(
      {
        code: "UNAUTHORIZED",
        message: "Invalid or expired token",
        retryable: false,
      },
      401,
    );
  }

  // --- 3. Rate limiting ---
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(clientIp)) {
    return jsonResponse(
      {
        code: "RATE_LIMITED",
        message: "Rate limit exceeded. Try again later.",
        retryable: true,
      },
      429,
    );
  }

  if (!GEMINI_API_KEY) {
    return jsonResponse(
      {
        code: "SERVER_MISCONFIGURED",
        message: "GEMINI_API_KEY not configured",
        retryable: false,
      },
      500,
    );
  }

  try {
    const { image, mimeType, language: rawLanguage } = await req.json();
    const language = parseLanguage(rawLanguage);

    if (!image) {
      return jsonResponse(
        { code: "BAD_REQUEST", message: "No image provided", retryable: false },
        400,
      );
    }

    // --- 4. Request body size validation (10 MB base64 limit) ---
    if (typeof image === "string" && image.length > MAX_IMAGE_SIZE) {
      return jsonResponse(
        {
          code: "IMAGE_TOO_LARGE",
          message: "Image exceeds 10 MB limit",
          retryable: false,
        },
        413,
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
              { text: buildSystemPrompt(language) },
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
      console.error("Gemini API error", {
        status: geminiResponse.status,
        provider: "gemini",
        detail: errorText,
      });
      return jsonResponse(
        {
          code: "UPSTREAM_ERROR",
          message: "Failed to analyze image",
          retryable: true,
        },
        502,
      );
    }

    const geminiData = await geminiResponse.json();

    // Extract the text response from Gemini's format
    const responseText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      return jsonResponse(
        {
          code: "EMPTY_RESPONSE",
          message: "No analysis returned",
          retryable: true,
        },
        502,
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
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge function error", {
      error: String(error),
      provider: "gemini",
    });
    return jsonResponse(
      {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        retryable: true,
      },
      500,
    );
  }
});
