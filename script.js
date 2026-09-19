document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('url-input');
    const summarizeBtn = document.getElementById('summarize-btn');
    const resultSection = document.getElementById('result-section');
    const summaryContent = document.getElementById('summary-content');
    const summaryModel = document.getElementById('summary-model');
    const pipelineHint = document.getElementById('pipeline-hint');
    const liveSteps = [...document.querySelectorAll('.live-step')];
    const archBlocks = [...document.querySelectorAll('.arch-block')];
    const loader = document.getElementById('loader');
    const copyBtn = document.getElementById('copy-btn');
    const loaderStep = document.getElementById('loader-step');
    const loaderTime = document.getElementById('loader-time');
    const errorSection = document.getElementById('error-section');
    const errorMessage = document.getElementById('error-message');
    const errorHint = document.getElementById('error-hint');
    const introModal = document.getElementById('intro-modal');
    const introBtn = document.getElementById('intro-btn');

    function closeIntro() {
        introModal.classList.add('hidden');
    }

    introBtn.addEventListener('click', closeIntro);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeIntro();
        }
    });

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

    // --- Pipeline passo per passo ---
    // I dati mostrati sono quelli veri restituiti dal backend. Il backend però
    // risponde in un colpo solo: la pausa fra un passo e l'altro serve a rendere
    // leggibile il percorso, non misura il tempo di ciascuna fase.
    const PAUSA_FRA_PASSI = 900;

    function resetPipeline() {
        liveSteps.forEach((step) => {
            step.classList.remove('visible');
            step.querySelector('.live-data').textContent = '';
        });
        archBlocks.forEach((block) => block.classList.remove('done'));
        pipelineHint.classList.remove('hidden');
    }

    function mostraPasso(numero, contenuto) {
        const step = liveSteps[numero - 1];
        step.querySelector('.live-data').textContent = contenuto;
        step.classList.add('visible');
        archBlocks[numero - 1]?.classList.add('done');
        step.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    async function animaPipeline(data) {
        const s = data.steps;
        const troncatura = s.truncated ? `, troncati a ${s.maxLength}` : '';

        const contenuti = [
            s.url,
            `${s.htmlLength} caratteri di HTML scaricati. I primi 1200:\n\n${s.htmlSnippet}`,
            `${s.cleanedLength} caratteri di testo leggibile${troncatura}:\n\n${s.cleanedText}`,
            s.prompt.map((m) => `[${m.role}]\n${m.content}`).join('\n\n'),
            `Ha risposto: ${data.model}\n\n${data.summary}`
        ];

        pipelineHint.classList.add('hidden');
        for (let i = 0; i < contenuti.length; i++) {
            mostraPasso(i + 1, contenuti[i]);
            if (i < contenuti.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, PAUSA_FRA_PASSI));
            }
        }
    }

    // Il prompt è lungo: di default il riquadro resta basso, e da qui lo si apre
    // per intero o lo si copia per riprovarlo altrove.
    const promptBox = document.querySelector('.live-step[data-step="4"] .live-data');
    const promptToggle = document.getElementById('prompt-toggle');
    const promptCopy = document.getElementById('prompt-copy');

    promptToggle.addEventListener('click', () => {
        const aperto = promptBox.classList.toggle('expanded');
        promptToggle.textContent = aperto ? 'Riduci' : 'Mostra tutto';
        promptToggle.setAttribute('aria-expanded', String(aperto));
    });

    promptCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(promptBox.textContent).then(() => {
            promptCopy.textContent = 'Copiato';
            setTimeout(() => { promptCopy.textContent = 'Copia il prompt'; }, 2000);
        });
    });

    function showError(message, isModelError) {
        errorMessage.textContent = message;
        errorHint.classList.toggle('hidden', !isModelError);
        errorSection.classList.remove('hidden');
    }

    summarizeBtn.addEventListener('click', async () => {
        let url = urlInput.value.trim();
        // Router di OpenRouter: sceglie da solo un modello gratuito disponibile.
        const model = 'openrouter/free';

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
        resetPipeline();
        loader.classList.remove('hidden');
        summarizeBtn.disabled = true;
        startProgress();

        let datiPipeline = null;

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
            datiPipeline = data;
        } catch (error) {
            showError(error.message, error.isModelError === true);
        } finally {
            stopProgress();
            loader.classList.add('hidden');
        }

        // La pipeline si popola dopo la risposta, poi compare il riassunto in cima.
        if (datiPipeline) {
            await animaPipeline(datiPipeline);
            resultSection.classList.remove('hidden');
        }
        summarizeBtn.disabled = false;
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
