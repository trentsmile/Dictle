// api/score.js  –  Vercel Edge Function
// Proxies scoring requests to Anthropic so the API key never touches the browser.
// Deploy: set ANTHROPIC_API_KEY in your Vercel project environment variables.

export const config = { runtime: 'edge' };

export default async function handler(req) {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Basic CORS — tighten this to your actual domain in production
  const origin = req.headers.get('origin') || '';
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders });
  }

  const { word, correctDefinition, userDefinition } = body;

  if (!word || !correctDefinition || !userDefinition) {
    return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: corsHeaders });
  }

  // Sanitise inputs — strip HTML, cap length
  const sanitise = s => String(s).replace(/<[^>]*>/g, '').trim().slice(0, 300);
  const safeWord    = sanitise(word);
  const safeCorrect = sanitise(correctDefinition);
  const safeUser    = sanitise(userDefinition);

  const prompt = `You are a strict but fair judge for a word-definition game called Dictle.

Word: "${safeWord}"
Correct definition: "${safeCorrect}"
Player's definition: "${safeUser}"

Score the player's definition from 0 to 100 based on semantic similarity and conceptual accuracy.

Scoring guide:
- 90–100: Captures the core meaning almost perfectly
- 70–89: Gets the main idea, minor gaps
- 50–69: Partially correct, missing key concepts
- 25–49: Related but significantly off
- 0–24: Wrong or too vague

Rules:
- Don't reward length; reward accuracy
- Synonyms and paraphrases count as correct
- Penalise vague filler like "it means something"
- A very short but accurate answer can still score 90+

Respond with ONLY a raw JSON object, no markdown, no explanation:
{"score": <integer 0-100>, "feedback": "<one short sentence of feedback>"}`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500, headers: corsHeaders });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', // Fast + cheap for scoring
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      console.error('Anthropic error:', err);
      return new Response(JSON.stringify({ error: 'Upstream error' }), { status: 502, headers: corsHeaders });
    }

    const data = await upstream.json();
    const raw  = data.content?.find(b => b.type === 'text')?.text || '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(JSON.stringify({ error: 'Bad model response', raw }), { status: 502, headers: corsHeaders });
    }

    const score    = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    const feedback = String(parsed.feedback || '').slice(0, 200);

    return new Response(JSON.stringify({ score, feedback }), { status: 200, headers: corsHeaders });

  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: corsHeaders });
  }
}
