document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('url-input');
    const modelSelect = document.getElementById('model-select');
    const summarizeBtn = document.getElementById('summarize-btn');
    const resultSection = document.getElementById('result-section');
    const summaryContent = document.getElementById('summary-content');
    const loader = document.getElementById('loader');
    const copyBtn = document.getElementById('copy-btn');
    const modelStatus = document.getElementById('model-status');
    const loaderStep = document.getElementById('loader-step');
    const loaderTime = document.getElementById('loader-time');
    const errorSection = document.getElementById('error-section');
    const errorMessage = document.getElementById('error-message');
    const errorHint = document.getElementById('error-hint');

    // Chiede al backend quali modelli gratuiti sono disponibili ora su OpenRouter
    // e li aggiunge al menu a tendina.
    async function loadFreeModels() {
        try {
            const response = await fetch('/api/models');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Errore nel caricamento dei modelli');
            }

            data.models.forEach((model) => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name;
                modelSelect.appendChild(option);
            });

            modelStatus.textContent = `${data.models.length} modelli gratuiti disponibili.`;
        } catch (error) {
            // Se la lista non arriva, l'opzione "CASUALE" resta comunque utilizzabile.
            modelStatus.textContent = 'Lista modelli non disponibile: puoi usare l\'opzione CASUALE.';
        }
    }

    loadFreeModels();

    // Le fasi seguono la pipeline descritta più in basso nella pagina.
    // Il backend risponde in un colpo solo, quindi i tempi sono indicativi:
    // servono a far capire all'utente cosa sta succedendo mentre aspetta.
    // Il contatore dei secondi, invece, è reale.
    const PHASES = [
        '🌐 Scarico la pagina web...',
        '🧹 Ripulisco l\'HTML ed estraggo il testo leggibile...',
        '📝 Preparo il prompt da inviare al modello...',
        '🤖 Il modello sta leggendo e scrivendo il riassunto...'
    ];
    const SECONDS_PER_PHASE = 3;
    const SLOW_AFTER_SECONDS = 20;

    let progressTimer = null;

    function startProgress() {
        const startedAt = Date.now();
        loaderStep.textContent = PHASES[0];
        loaderTime.textContent = '0s';

        progressTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startedAt) / 1000);
            loaderTime.textContent = `${elapsed}s`;

            if (elapsed >= SLOW_AFTER_SECONDS) {
                loaderStep.textContent = '⏳ Il modello gratuito ci sta mettendo più del solito. Ancora un momento...';
                return;
            }

            const phase = Math.min(Math.floor(elapsed / SECONDS_PER_PHASE), PHASES.length - 1);
            loaderStep.textContent = PHASES[phase];
        }, 1000);
    }

    function stopProgress() {
        clearInterval(progressTimer);
        progressTimer = null;
    }

    function showError(message, isModelError) {
        errorMessage.textContent = message;
        errorHint.classList.toggle('hidden', !isModelError);
        errorSection.classList.remove('hidden');
    }

    summarizeBtn.addEventListener('click', async () => {
        let url = urlInput.value.trim();
        const model = modelSelect.value;

        if (!url) {
            showError('Inserisci l\'indirizzo di una pagina web da riassumere.', false);
            return;
        }

        // Add https:// if missing
        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
            urlInput.value = url; // Update input field to show the user
        }

        try {
            new URL(url);
        } catch (e) {
            showError('L\'indirizzo non sembra valido (esempio: https://esempio.it).', false);
            return;
        }

        // Reset UI
        resultSection.classList.add('hidden');
        errorSection.classList.add('hidden');
        loader.classList.remove('hidden');
        summarizeBtn.disabled = true;
        startProgress();

        try {
            const response = await fetch('/api/summarize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url, model })
            });

            const data = await response.json();

            if (!response.ok) {
                const requestError = new Error(data.error || 'Si è verificato un errore');
                requestError.isModelError = data.modelError === true;
                throw requestError;
            }

            summaryContent.textContent = data.summary;
            resultSection.classList.remove('hidden');
        } catch (error) {
            showError(error.message, error.isModelError === true);
        } finally {
            stopProgress();
            loader.classList.add('hidden');
            summarizeBtn.disabled = false;
        }
    });

    copyBtn.addEventListener('click', () => {
        const text = summaryContent.textContent;
        navigator.clipboard.writeText(text).then(() => {
            const originalIcon = copyBtn.innerHTML;
            copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            setTimeout(() => {
                copyBtn.innerHTML = originalIcon;
            }, 2000);
        });
    });
});
