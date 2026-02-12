document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('url-input');
    const modelSelect = document.getElementById('model-select');
    const summarizeBtn = document.getElementById('summarize-btn');
    const resultSection = document.getElementById('result-section');
    const summaryContent = document.getElementById('summary-content');
    const loader = document.getElementById('loader');
    const copyBtn = document.getElementById('copy-btn');

    summarizeBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        const model = modelSelect.value;

        if (!url) {
            alert('Please enter a valid URL');
            return;
        }

        // Reset UI
        resultSection.classList.add('hidden');
        loader.classList.remove('hidden');
        summarizeBtn.disabled = true;

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
                throw new Error(data.error || 'Something went wrong');
            }

            summaryContent.textContent = data.summary;
            resultSection.classList.remove('hidden');
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
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
