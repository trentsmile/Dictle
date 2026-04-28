export default async function handler(req, res) {
  // 1. Security check: Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { word, userDefinition, correctDefinition } = req.body;

  // 2. Validate input
  if (!word || !userDefinition || !correctDefinition) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 3. Request scoring from Anthropic
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY, // Pulled securely from Vercel env
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307', // Efficient and fast for scoring
        max_tokens: 10,
        system: "You are a linguistics professor. Rate the user's definition against the correct one on a scale of 0-100. Return ONLY the integer.",
        messages: [
          {
            role: 'user', 
            content: `Word: "${word}"\nCorrect Definition: "${correctDefinition}"\nUser Definition: "${userDefinition}"`
          }
        ],
      }),
    });

    const data = await response.json();
    
    // 4. Parse the score and return it to the frontend
    const scoreText = data.content[0].text.trim();
    const score = parseInt(scoreText.match(/\d+/)[0]); // Extracts the number

    res.status(200).json({ score: isNaN(score) ? 0 : score });

  } catch (error) {
    console.error('Scoring Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
