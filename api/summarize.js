export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { url, model } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Se il frontend non indica un modello, lasciamo che OpenRouter ne scelga uno gratuito.
  const selectedModel = model || "openrouter/free";

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

    if (!textContent || textContent.length < 50) {
      throw new Error("The webpage doesn't seem to contain enough readable text to summarize.");
    }

    // Limit content length for the demo
    const MAX_LENGTH = 4000;
    if (textContent.length > MAX_LENGTH) {
      textContent = textContent.substring(0, MAX_LENGTH) + "... (truncated for demo)";
    }

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

    // Se il modello scelto non risponde (spento, sovraccarico, rate limit...) lo
    // segnaliamo con il flag "modelError", così il frontend può suggerire di
    // provarne un altro invece di mostrare un errore generico.
    if (!openRouterResponse.ok) {
      let errorMessage = openRouterResponse.statusText;
      try {
        const errorData = await openRouterResponse.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        // Fallback to status text if JSON parsing fails
      }
      return res.status(502).json({
        error: `Il modello "${selectedModel}" non ha risposto: ${errorMessage}`,
        modelError: true
      });
    }

    const data = await openRouterResponse.json();
    const summary = data.choices?.[0]?.message?.content;

    // Alcuni modelli gratuiti rispondono "ok" ma senza contenuto.
    if (!summary) {
      return res.status(502).json({
        error: `Il modello "${selectedModel}" ha restituito una risposta vuota.`,
        modelError: true
      });
    }

    // Construct the messages array to show the user what was sent
    const fullPrompt = [
      {
        "role": "system",
        "content": "You are a helpful assistant that summarizes the content of a webpage provided by the user. Do not include any meta-talk, just the summary."
      },
      {
        "role": "user",
        "content": `Please summarize the following webpage content: \n\n ${textContent}`
      }
    ];

    return res.status(200).json({
      summary,
      debug: {
        extractedContent: textContent,
        fullPrompt: fullPrompt
      }
    });

  } catch (error) {
    console.error('Error in summarize API:', error);
    return res.status(500).json({ error: error.message });
  }
}
