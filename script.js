// ===== WORKING PROXIES ONLY =====
const CONFIG = {
    API: 'https://api.uspeoplesearch.site/tcpa/v1?x=',
    PROXIES: [
        'https://api.codetabs.com/v1/proxy?quest=',  // Working
        'https://corsproxy.io/?',                     // Working
        'https://proxy.cors.sh/'                       // Working
    ],
    BATCH_SIZE: 20,
    TIMEOUT: 5000,
    MAX_RETRIES: 2
};

// ===== STATE =====
const state = {
    dnc: [],
    clean: [],
    processing: false,
    abortController: null,
    total: 0,
    processed: 0,
    startTime: 0,
    currentProxy: 0
};

// ===== DOM =====
const el = {
    phoneInput: document.getElementById('phoneInput'),
    uploadZone: document.getElementById('uploadZone'),
    fileInput: document.getElementById('fileInput'),
    fileInfo: document.getElementById('fileInfo'),
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    proxyStatus: document.getElementById('proxyStatus'),
    progressContainer: document.getElementById('progressContainer'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    progressSpeed: document.getElementById('progressSpeed'),
    statTotal: document.getElementById('statTotal'),
    statDnc: document.getElementById('statDnc'),
    statClean: document.getElementById('statClean'),
    dncList: document.getElementById('dncList'),
    cleanList: document.getElementById('cleanList'),
    resultsGrid: document.getElementById('resultsGrid'),
    downloadBtn: document.getElementById('downloadBtn'),
    inputCount: document.getElementById('inputCount')
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    setupEvents();
    testProxies();
    updateCount();
});

function setupEvents() {
    el.uploadZone.addEventListener('click', () => el.fileInput.click());
    
    el.uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.uploadZone.style.background = '#2d3a4f';
    });

    el.uploadZone.addEventListener('dragleave', () => {
        el.uploadZone.style.background = '#1e293b';
    });

    el.uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        el.uploadZone.style.background = '#1e293b';
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    el.fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) handleFile(e.target.files[0]);
    });

    el.phoneInput.addEventListener('input', updateCount);
}

// ===== PROXY TEST =====
async function testProxies() {
    const testNum = '3034708896';
    let workingCount = 0;
    
    for (let i = 0; i < CONFIG.PROXIES.length; i++) {
        try {
            const res = await fetch(CONFIG.PROXIES[i] + encodeURIComponent(CONFIG.API + testNum), {
                signal: AbortSignal.timeout(3000)
            });
            if (res.ok) {
                workingCount++;
            }
        } catch (e) {
            console.log(`Proxy ${i} failed`);
        }
    }
    
    el.proxyStatus.innerHTML = `
        <i class="fas fa-check-circle" style="color:#22c55e"></i>
        <span>${workingCount} Working Proxies</span>
    `;
}

// ===== FILE HANDLER =====
function handleFile(file) {
    if (!file.name.match(/\.(txt|csv)$/)) {
        alert('Only .txt or .csv files allowed!');
        return;
    }

    el.fileInfo.innerHTML = `<i class="fas fa-file"></i> ${file.name}`;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        el.phoneInput.value = extractNumbers(e.target.result).join('\n');
        updateCount();
    };
    reader.readAsText(file);
}

function extractNumbers(text) {
    return text.split('\n')
        .map(l => l.trim())
        .filter(l => l)
        .map(n => n.replace(/\D/g, ''))
        .filter(n => n.length >= 10);
}

function updateCount() {
    const count = extractNumbers(el.phoneInput.value).length;
    el.inputCount.textContent = count;
    el.statTotal.textContent = count;
}

// ===== MAIN CHECK =====
window.app = {
    start: async function() {
        const numbers = extractNumbers(el.phoneInput.value);
        
        if (numbers.length === 0) {
            alert('Please enter numbers or upload a file!');
            return;
        }

        // Reset
        state.dnc = [];
        state.clean = [];
        state.total = numbers.length;
        state.processed = 0;
        state.processing = true;
        state.abortController = new AbortController();
        state.startTime = Date.now();

        // UI
        el.startBtn.disabled = true;
        el.stopBtn.style.display = 'flex';
        el.progressContainer.style.display = 'block';
        el.resultsGrid.style.display = 'none';
        el.downloadBtn.style.display = 'none';
        
        el.dncList.innerHTML = '<div class="empty">Checking...</div>';
        el.cleanList.innerHTML = '<div class="empty">Checking...</div>';

        // Process
        for (let i = 0; i < numbers.length; i += CONFIG.BATCH_SIZE) {
            if (!state.processing) break;
            
            const batch = numbers.slice(i, i + CONFIG.BATCH_SIZE);
            const promises = batch.map(num => this.checkNumber(num));
            
            const results = await Promise.allSettled(promises);
            
            results.forEach((result, idx) => {
                if (result.status === 'fulfilled' && result.value) {
                    if (result.value.isDnc) {
                        state.dnc.push(batch[idx]);
                    } else {
                        state.clean.push(batch[idx]);
                    }
                } else {
                    state.clean.push(batch[idx]); // Always clean on error
                }
                
                state.processed++;
                this.updateProgress();
            });
        }

        this.finish();
    },

    checkNumber: async function(phone) {
        for (let attempt = 0; attempt < CONFIG.MAX_RETRIES; attempt++) {
            // Rotate proxy
            const proxy = CONFIG.PROXIES[state.currentProxy % CONFIG.PROXIES.length];
            state.currentProxy++;
            
            try {
                const url = proxy + encodeURIComponent(CONFIG.API + phone);
                const res = await fetch(url, {
                    signal: state.abortController.signal,
                    timeout: CONFIG.TIMEOUT
                });
                
                if (res.ok) {
                    const text = await res.text();
                    try {
                        const data = JSON.parse(text);
                        const isDnc = data.listed === 'Yes' || 
                                     data.ndnc === 'Yes' || 
                                     data.sdnc === 'Yes';
                        return { isDnc };
                    } catch {
                        return { isDnc: false };
                    }
                }
            } catch (e) {
                console.log(`Attempt ${attempt + 1} failed for ${phone}`);
            }
        }
        return { isDnc: false };
    },

    updateProgress: function() {
        const percent = (state.processed / state.total) * 100;
        el.progressFill.style.width = percent + '%';
        
        const elapsed = (Date.now() - state.startTime) / 1000;
        const speed = Math.round(state.processed / elapsed) || 0;
        
        el.progressText.textContent = `${state.processed}/${state.total}`;
        el.progressSpeed.textContent = `${speed}/sec`;
        
        el.statDnc.textContent = state.dnc.length;
        el.statClean.textContent = state.clean.length;
    },

    finish: function() {
        state.processing = false;
        el.startBtn.disabled = false;
        el.stopBtn.style.display = 'none';

        // Show DNC
        if (state.dnc.length > 0) {
            el.dncList.innerHTML = state.dnc
                .map(n => `<div class="number-item red">${n}</div>`)
                .join('');
        } else {
            el.dncList.innerHTML = '<div class="empty">No DNC numbers</div>';
        }

        // Show Clean
        if (state.clean.length > 0) {
            el.cleanList.innerHTML = state.clean
                .map(n => `<div class="number-item green">${n}</div>`)
                .join('');
        } else {
            el.cleanList.innerHTML = '<div class="empty">No clean numbers</div>';
        }

        el.resultsGrid.style.display = 'grid';
        
        if (state.dnc.length > 0 || state.clean.length > 0) {
            el.downloadBtn.style.display = 'inline-flex';
        }
    },

    stop: function() {
        if (state.abortController) {
            state.abortController.abort();
            state.processing = false;
            this.finish();
        }
    },

    reset: function() {
        this.stop();
        state.dnc = [];
        state.clean = [];
        el.statDnc.textContent = '0';
        el.statClean.textContent = '0';
        el.resultsGrid.style.display = 'none';
        el.progressContainer.style.display = 'none';
        el.downloadBtn.style.display = 'none';
    },

    clearInput: function() {
        el.phoneInput.value = '';
        el.fileInfo.innerHTML = '<i class="fas fa-file"></i> No file selected';
        updateCount();
        this.reset();
    },

    copy: async function(type) {
        const numbers = type === 'dnc' ? state.dnc : state.clean;
        if (numbers.length === 0) return alert('No numbers!');
        await navigator.clipboard.writeText(numbers.join('\n'));
        alert(`✅ ${type.toUpperCase()} copied!`);
    },

    download: function(type) {
        const numbers = type === 'dnc' ? state.dnc : state.clean;
        if (numbers.length === 0) return alert('No numbers!');
        
        const blob = new Blob([numbers.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type}.txt`;
        a.click();
    },

    downloadAll: function() {
        const content = `DNC (${state.dnc.length})\n${state.dnc.join('\n')}\n\nCLEAN (${state.clean.length})\n${state.clean.join('\n')}`;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'all.txt';
        a.click();
    }
};
