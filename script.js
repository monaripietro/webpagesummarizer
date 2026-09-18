document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('url-input');
    const modelSelect = document.getElementById('model-select');
    const summarizeBtn = document.getElementById('summarize-btn');
    const resultSection = document.getElementById('result-section');
    const summaryContent = document.getElementById('summary-content');
    const summaryModel = document.getElementById('summary-model');
    const loader = document.getElementById('loader');
    const copyBtn = document.getElementById('copy-btn');
    const modelStatus = document.getElementById('model-status');
    const loaderStep = document.getElementById('loader-step');
    const loaderTime = document.getElementById('loader-time');
    const errorSection = document.getElementById('error-section');
    const errorMessage = document.getElementById('error-message');
    const errorHint = document.getElementById('error-hint');
    const introModal = document.getElementById('intro-modal');
    const introStatus = document.getElementById('intro-status');
    const introSpinner = document.getElementById('intro-spinner');
    const introBtn = document.getElementById('intro-btn');

    // --- Modello locale (gira nel browser, via WebLLM) ---
    // Scaricarlo è sempre una scelta esplicita dell'utente: pesa 276 MB e su
    // macchine poco potenti è meglio non farlo partire da soli.
    const LOCAL_MODEL_ID = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
    const localBtn = document.getElementById('local-btn');
    const localStatus = document.getElementById('local-status');
    const introLocalBtn = document.getElementById('intro-local-btn');
    const introLocalStatus = document.getElementById('intro-local-status');
    const localColumn = document.getElementById('local-column');
    const localContent = document.getElementById('local-content');
    const localModelLabel = document.getElementById('local-model-label');

    let localEngine = null;
    let localLoading = null;

    // I due punti di accesso (pop-up e pagina) mostrano sempre lo stesso stato.
    function setLocalStatus(text) {
        localStatus.textContent = text;
        introLocalStatus.textContent = text;
    }

    function setLocalButtons(disabled, label) {
        [localBtn, introLocalBtn].forEach((btn) => {
            btn.disabled = disabled;
            if (label) {
                btn.textContent = label;
            }
        });
    }

    async function loadLocalModel() {
        if (localEngine) {
            return localEngine;
        }
        if (localLoading) {
            return localLoading;
        }

        localLoading = (async () => {
            if (!navigator.gpu) {
                throw new Error('Questo browser non supporta WebGPU: servono Chrome o Edge aggiornati.');
            }
            const webllm = await import('https://esm.run/@mlc-ai/web-llm');
            const engine = await webllm.CreateMLCEngine(LOCAL_MODEL_ID, {
                initProgressCallback: (report) => setLocalStatus(report.text)
            });
            localEngine = engine;
            return engine;
        })();

        try {
            const engine = await localLoading;
            setLocalStatus('Modello locale pronto: il prossimo riassunto mostrerà il confronto.');
            setLocalButtons(true, 'Modello locale attivo');
            localModelLabel.textContent = `Generato da: ${LOCAL_MODEL_ID}`;
            return engine;
        } catch (error) {
            setLocalStatus(`Non è stato possibile caricare il modello locale: ${error.message}`);
            setLocalButtons(false, 'Riprova a scaricare il modello locale');
            throw error;
        } finally {
            localLoading = null;
        }
    }

    function startLocalDownload() {
        setLocalButtons(true, 'Scaricamento in corso...');
        loadLocalModel().catch(() => {
            // il messaggio di errore è già stato mostrato da loadLocalModel
        });
    }

    localBtn.addEventListener('click', startLocalDownload);
    introLocalBtn.addEventListener('click', startLocalDownload);

    // Sblocca il pulsante del pop-up. Viene chiamata sia in caso di successo
    // sia in caso di errore: l'utente non deve mai restare bloccato fuori dall'app.
    function unlockIntro(message) {
        introStatus.textContent = message;
        introSpinner.classList.add('hidden');
        introBtn.disabled = false;
    }

    function closeIntro() {
        if (introBtn.disabled) {
            return;
        }
        introModal.classList.add('hidden');
    }

    introBtn.addEventListener('click', closeIntro);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeIntro();
        }
    });

    // Chiede al backend quali modelli gratuiti stanno rispondendo ora e li
    // aggiunge al menu a tendina. Il backend ha già scartato quelli irraggiungibili.
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

            const riepilogo = `${data.models.length} modelli gratuiti attivi`
                + (data.discarded ? ` (${data.discarded} scartati perché non raggiungibili)` : '');

            modelStatus.textContent = `${riepilogo}.`;
            unlockIntro(`Pronto: ${riepilogo}.`);
        } catch (error) {
            // Se la lista non arriva, l'opzione "CASUALE" resta comunque utilizzabile.
            const fallback = 'Lista modelli non disponibile: puoi usare l\'opzione CASUALE.';
            modelStatus.textContent = fallback;
            unlockIntro(fallback);
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
        let promptDaConfrontare = null;

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

            summaryModel.textContent = `Generato da: ${data.model}`;
            summaryContent.textContent = data.summary;
            resultSection.classList.remove('hidden');

            // Il confronto parte solo se l'utente ha scaricato il modello locale.
            promptDaConfrontare = localEngine ? data.debug.fullPrompt : null;
        } catch (error) {
            showError(error.message, error.isModelError === true);
        } finally {
            stopProgress();
            loader.classList.add('hidden');
            summarizeBtn.disabled = false;
        }

        if (promptDaConfrontare) {
            await runLocalComparison(promptDaConfrontare);
        }
    });

    // Riceve lo stesso identico array di messaggi che il backend ha spedito al
    // modello remoto: se i due prompt differissero, il confronto non direbbe nulla.
    async function runLocalComparison(messages) {
        localColumn.classList.remove('hidden');
        localContent.textContent = 'Elaborazione in corso nel tuo browser...';
        try {
            const reply = await localEngine.chat.completions.create({ messages });
            localContent.textContent = reply.choices[0].message.content;
        } catch (error) {
            localContent.textContent = `Il modello locale non è riuscito a rispondere: ${error.message}`;
        }
    }

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
