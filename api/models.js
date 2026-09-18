// Restituisce i modelli gratuiti di OpenRouter che in questo momento funzionano davvero.
//
// Non basta filtrare i modelli "free": molti di essi sono elencati nel catalogo ma
// nessun provider li sta servendo, quindi darebbero errore appena selezionati.
// Per ogni modello chiediamo quindi a OpenRouter il dettaglio dei suoi provider.
// Sono metadati: NON costano token e non consumano la quota gratuita giornaliera.

let cachedModels = null;
let cachedAt = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 ora
const CHECK_TIMEOUT = 5000; // ms concessi al singolo controllo
const MIN_UPTIME = 50; // % minima di richieste andate a buon fine nell'ultima mezz'ora

// Non basta che un modello risponda: deve anche saper riassumere un testo.
// Nel catalogo gratuito ci sono modelli nati per tutt'altro (classificatori di
// sicurezza, agenti di programmazione, modelli medici o finanziari): rispondono
// senza errori ma producono output inadatti al riassunto.
const NOME_SPECIALIZZATO = /\b(code|coding|content safety|guard|moderation|embedding|rerank)\b/i;

// Qui la parola chiave deve essere attaccata a "model"/"classifier" nella
// descrizione che il modello dà di sé. Una regola più larga scarterebbe anche
// i modelli generalisti che si limitano a citare la programmazione tra i loro punti forti.
const DESCRIZIONE_SPECIALIZZATA =
  /\b(coding agent|code|content safety|moderation|guard|health|medicine|medical|finance|financial)[\w\s,-]{0,50}\b(model|classifier)\b/i;

function isAdatto(model) {
  // I modelli a ragionamento obbligatorio spesso restituiscono il testo nel campo
  // del ragionamento, lasciando vuoto "message.content".
  if (model.reasoning?.mandatory === true) {
    return false;
  }
  if (NOME_SPECIALIZZATO.test(model.name)) {
    return false;
  }
  return !DESCRIZIONE_SPECIALIZZATA.test((model.description || '').slice(0, 220));
}

// Un provider è considerato sano se OpenRouter non lo segnala in errore
// (status negativo) e se non sta fallendo la maggior parte delle richieste.
// uptime null significa "troppo poco traffico per saperlo": non lo penalizziamo.
function countHealthyEndpoints(endpoints) {
  return endpoints.filter(
    (endpoint) =>
      endpoint.status >= 0 &&
      (endpoint.uptime_last_30m === null || endpoint.uptime_last_30m >= MIN_UPTIME)
  ).length;
}

// Restituisce il modello se è utilizzabile, altrimenti null.
async function checkModel(model) {
  try {
    const response = await fetch(`https://openrouter.ai${model.links.details}`, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT)
    });
    if (!response.ok) {
      return null;
    }

    const detail = await response.json();
    const healthyEndpoints = countHealthyEndpoints(detail.data?.endpoints || []);

    // Nessun provider sano = il modello risponderebbe "No endpoints found".
    if (healthyEndpoints === 0) {
      return null;
    }

    return { id: model.id, name: model.name, healthyEndpoints };
  } catch (error) {
    // Controllo fallito o troppo lento: nel dubbio non lo proponiamo.
    return null;
  }
}

export default async function handler(req, res) {
  const isCacheValid = cachedModels && Date.now() - cachedAt < CACHE_DURATION;
  if (isCacheValid) {
    return res.status(200).json({ ...cachedModels, cached: true });
  }

  try {
    // Questo endpoint è pubblico: non serve la API key.
    const response = await fetch('https://openrouter.ai/api/v1/models');
    if (!response.ok) {
      throw new Error(`OpenRouter ha risposto con stato ${response.status}`);
    }

    const data = await response.json();

    // Su OpenRouter i modelli gratuiti hanno l'id che finisce con ":free".
    const freeModels = data.data.filter(
      (model) => model.id.endsWith(':free') && model.links?.details && isAdatto(model)
    );

    // I controlli partono tutti insieme, non uno dopo l'altro: così l'attesa
    // totale è quella del controllo più lento, non la somma di tutti.
    const results = await Promise.all(freeModels.map(checkModel));

    // Prima i modelli serviti da più provider: sono i più difficili da far cadere.
    const available = results
      .filter((model) => model !== null)
      .sort(
        (a, b) => b.healthyEndpoints - a.healthyEndpoints || a.name.localeCompare(b.name)
      );

    cachedModels = {
      models: available,
      checked: freeModels.length,
      discarded: freeModels.length - available.length
    };
    cachedAt = Date.now();

    return res.status(200).json({ ...cachedModels, cached: false });
  } catch (error) {
    console.error('Errore nel recupero dei modelli:', error);
    return res.status(500).json({ error: error.message });
  }
}
