// Il prompt "ingenuo": il testo della pagina viene incollato dentro il messaggio
// dell'utente senza alcuna separazione. È il modo in cui nasce quasi ogni
// applicazione di questo tipo, ed è ciò che rende possibile la prompt injection.
function buildPrompt(textContent) {
  return [
    {
      role: 'system',
      content: 'You are a helpful assistant that summarizes the content of a webpage provided by the user. Do not include any meta-talk, just the summary.'
    },
    {
      role: 'user',
      content: `Please summarize the following webpage content: \n\n ${textContent}`
    }
  ];
}

// Una sola chiamata a OpenRouter. Restituisce { summary, model } oppure { error }.
async function askOpenRouter(model, messages) {
  let response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://websummary-demo.vercel.app',
        'X-Title': 'WebSummary Educational Demo'
      },
      body: JSON.stringify({ model, messages })
    });
  } catch (networkError) {
    return { error: `Impossibile contattare OpenRouter: ${networkError.message}` };
  }

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || errorMessage;
    } catch (e) {
      // se il corpo non è JSON teniamo lo status testuale
    }
    return { error: `Il modello "${model}" non ha risposto: ${errorMessage}` };
  }

  const data = await response.json();
  const summary = data.choices?.[0]?.message?.content;

  // Alcuni modelli gratuiti rispondono "ok" ma senza contenuto.
  if (!summary) {
    return { error: `Il modello "${model}" ha restituito una risposta vuota.` };
  }

  return { summary, model: data.model };
}

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
    const testoGrezzo = html
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, ' ')
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!testoGrezzo || testoGrezzo.length < 50) {
      throw new Error("The webpage doesn't seem to contain enough readable text to summarize.");
    }

    // Limit content length for the demo
    const MAX_LENGTH = 4000;
    const troncato = testoGrezzo.length > MAX_LENGTH;
    const textContent = troncato
      ? testoGrezzo.substring(0, MAX_LENGTH) + "... (truncated for demo)"
      : testoGrezzo;

    // 3. Un solo riassunto, con il prompt ingenuo: è quello che rende visibile
    //    la prompt injection.
    const prompt = buildPrompt(textContent);
    const esito = await askOpenRouter(selectedModel, prompt);
    if (esito.error) {
      return res.status(502).json({ error: esito.error, modelError: true });
    }

    // Il frontend mostra questi materiali passo per passo nella pipeline: sono i
    // dati veri di ogni fase, non un esempio illustrativo.
    return res.status(200).json({
      model: esito.model || selectedModel,
      summary: esito.summary,
      steps: {
        url,
        htmlLength: html.length,
        htmlSnippet: html.substring(0, 1200),
        cleanedLength: testoGrezzo.length,
        cleanedText: textContent,
        truncated: troncato,
        maxLength: MAX_LENGTH,
        prompt
      }
    });

  } catch (error) {
    console.error('Error in summarize API:', error);
    return res.status(500).json({ error: error.message });
  }
}
