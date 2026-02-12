export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { url, model } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const selectedModel = model || "google/gemini-2.0-flash-001";

  // Check if API key is present
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    const hasTypo = !!(process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_KEY || process.env.API_KEY);
    console.error('OPENROUTER_API_KEY is not defined in environment variables');

    let errorMessage = 'Backend configuration error: API Key is missing.';
    if (hasTypo) {
      errorMessage += ' It looks like you might have a typo in your environment variable name. Ensure it is exactly OPENROUTER_API_KEY.';
    } else {
      errorMessage += ' Please set OPENROUTER_API_KEY in your Vercel Project Settings -> Environment Variables and then RE-DEPLOY the project to apply changes.';
    }

    return res.status(500).json({ error: errorMessage });
  }

  try {
    // 1. Fetch the webpage content
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch the URL: ${response.statusText}`);
    }
    const html = await response.text();

    // 2. Simple text extraction
    let textContent = html
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, ' ')
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Limit content length for the demo
    textContent = textContent.substring(0, 4000);

    // 3. Call OpenRouter API
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://websummary-demo.vercel.app", // Optional, for OpenRouter ranking
        "X-Title": "WebSummary Educational Demo" // Optional, for OpenRouter ranking
      },
      body: JSON.stringify({
        "model": selectedModel,
        "messages": [
          {
            "role": "system",
            "content": "You are a helpful assistant that summarizes the content of a webpage provided by the user. Do not include any meta-talk, just the summary."
          },
          {
            "role": "user",
            "content": `Please summarize the following webpage content: \n\n ${textContent}`
          }
        ]
      })
    });

    if (!openRouterResponse.ok) {
      const errorData = await openRouterResponse.json();
      throw new Error(`OpenRouter Error: ${errorData.error?.message || openRouterResponse.statusText}`);
    }

    const data = await openRouterResponse.json();
    const summary = data.choices[0].message.content;

    return res.status(200).json({ summary });

  } catch (error) {
    console.error('Error in summarize API:', error);
    return res.status(500).json({ error: error.message });
  }
}
