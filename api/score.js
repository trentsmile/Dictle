export default async function handler(req, res) {
  // 1. Security check: Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { word, pos, userDefinition, correctDefinition } = req.body;

  // 2. Validate input
  if (!word || !userDefinition || !correctDefinition) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const prompt = `You are the strict-but-fair grader for Dictle, a daily word-definition game.

Word: "${word}"${pos ? ` (${pos})` : ''}
Correct definition: "${correctDefinition}"
Player's answer: "${userDefinition}"

Score the player's answer 0–100 based on how accurately and completely it captures the meaning of the correct definition.

Scoring scale:
88–100  Nails the core meaning, possibly with extra detail or phrasing
70–87   Gets the core idea clearly, minor gaps or imprecision
50–69   Partially correct — captures some key aspects but misses others
30–49   Has a related idea but substantially incomplete or off
1–29    Tangentially related but mostly wrong
0       Completely wrong, blank, or just restating the word

Rules:
- Be GENEROUS with paraphrases and synonyms. "Centers around yourself" = "the self is all that exists".
- Do NOT penalise for informal language, spelling errors, or imperfect grammar.
- DO penalise if the player clearly confuses this word with a different word.
- A clear one-sentence answer capturing the core meaning should score 70+.

Respond with ONLY valid JSON, no markdown:
{"score": <0-100>, "feedback": "<one concise sentence: what they got right or wrong and why, max 15 words>"}`;

  try {
    // 3. Request scoring from Anthropic
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Anthropic API error:', response.status, err);
      return res.status(502).json({ error: 'Scoring service error' });
    }

    const data = await response.json();

    // 4. Parse JSON response and return score + feedback
    const raw = data.content.map(b => b.text || '').join('').trim();
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());

    const score = Math.round(Math.max(0, Math.min(100, Number(parsed.score))));
    res.status(200).json({
      score: isNaN(score) ? 0 : score,
      feedback: parsed.feedback || '',
    });

  } catch (error) {
    console.error('Scoring Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
