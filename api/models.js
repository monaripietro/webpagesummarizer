// Restituisce la lista dei modelli gratuiti attualmente disponibili su OpenRouter.
// La lista dei modelli free cambia spesso: chiederla a OpenRouter invece di
// scriverla a mano nell'HTML evita che l'app proponga modelli ormai spenti.

// Cache in memoria: la lista cambia raramente, quindi non ha senso interrogare
// OpenRouter ad ogni caricamento della pagina.
let cachedModels = null;
let cachedAt = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 ora

export default async function handler(req, res) {
  const isCacheValid = cachedModels && Date.now() - cachedAt < CACHE_DURATION;
  if (isCacheValid) {
    return res.status(200).json({ models: cachedModels, cached: true });
  }

  try {
    // Questo endpoint è pubblico: non serve la API key.
    const response = await fetch('https://openrouter.ai/api/v1/models');
    if (!response.ok) {
      throw new Error(`OpenRouter ha risposto con stato ${response.status}`);
    }

    const data = await response.json();

    // Su OpenRouter i modelli gratuiti hanno l'id che finisce con ":free".
    const freeModels = data.data
      .filter((model) => model.id.endsWith(':free'))
      .map((model) => ({ id: model.id, name: model.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    cachedModels = freeModels;
    cachedAt = Date.now();

    return res.status(200).json({ models: freeModels, cached: false });
  } catch (error) {
    console.error('Errore nel recupero dei modelli:', error);
    return res.status(500).json({ error: error.message });
  }
}
