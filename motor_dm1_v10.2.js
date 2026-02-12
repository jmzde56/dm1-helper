// DM1 Helper - Motor de Lógica v10.2 (Performance & Stability)
const APP_VERSION = "10.2";

let USER_CONFIG = {
    ICR: 20,
    ISF: 50,
    TARGET_GLUCOSE: 100,
    XDRIP_URL: 'http://127.0.0.1:17580',
    GEMINI_KEY: '',
    GEMINI_KEY_BACKUP: '',
    SELECTED_MODEL: 'gemini-1.5-flash',
    CUSTOM_MODEL_ID: ''
};

const FOOD_DATABASE = [
    { name: 'arroz', carbs: 28, gi: 'Alto' }, { name: 'pan blanco', carbs: 50, gi: 'Alto' },
    { name: 'pan integral', carbs: 40, gi: 'Medio' }, { name: 'manzana', carbs: 14, gi: 'Bajo' },
    { name: 'pasta', carbs: 25, gi: 'Medio' }, { name: 'lentejas', carbs: 20, gi: 'Bajo' },
    { name: 'pollo', carbs: 0, gi: 'Nulo' }, { name: 'ensalada', carbs: 5, gi: 'Bajo' },
    { name: 'pizza (porcion)', carbs: 30, gi: 'Alto' }, { name: 'empanada', carbs: 25, gi: 'Medio' },
    { name: 'carne', carbs: 0, gi: 'Nulo' }, { name: 'papa hervida', carbs: 17, gi: 'Alto' },
    { name: 'pure de papa', carbs: 15, gi: 'Alto' }, { name: 'milanesa', carbs: 15, gi: 'Medio' },
    { name: 'hamburguesa (solo carne)', carbs: 0, gi: 'Nulo' }, { name: 'galletita de agua (unidad)', carbs: 5, gi: 'Medio' },
    { name: 'galletita dulce (unidad)', carbs: 7, gi: 'Alto' }, { name: 'factura (unidad)', carbs: 35, gi: 'Alto' },
    { name: 'yogur entero', carbs: 12, gi: 'Bajo' }, { name: 'leche (vaso)', carbs: 10, gi: 'Bajo' },
    { name: 'alfajor', carbs: 45, gi: 'Alto' }, { name: 'bananas', carbs: 20, gi: 'Medio' },
    { name: 'naranja', carbs: 12, gi: 'Bajo' }
];

let glucoseChart = null;
let jugglucoTreatments = [];

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('app-version')) document.getElementById('app-version').textContent = "v" + APP_VERSION;
    if (document.getElementById('app-version-header')) document.getElementById('app-version-header').textContent = "v" + APP_VERSION;
    loadSettings();
    initChart();
    setupNavigation();
    setupEventListeners();
    renderHistory();
    if (USER_CONFIG.XDRIP_URL) {
        fetchGlucose();
        fetchTreatments();
        setInterval(fetchGlucose, 300000);
        setInterval(fetchTreatments, 600000);
    }
});

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetView = item.getAttribute('data-view');
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            views.forEach(view => {
                view.classList.remove('active');
                if (view.id === `view-${targetView}`) view.classList.add('active');
            });
        });
    });
}

function setupEventListeners() {
    document.getElementById('analyze-btn').addEventListener('click', analyzeFood);
    document.getElementById('save-btn').addEventListener('click', saveRecord);

    document.getElementById('res-carbs').addEventListener('click', () => {
        const nuevo = prompt("Editar Carbohidratos (g):", parseInt(document.getElementById('res-carbs').textContent));
        if (nuevo !== null && !isNaN(nuevo)) {
            document.getElementById('res-carbs').textContent = `${nuevo}g`;
            updateDoseDisplay();
        }
    });

    const cameraTrigger = document.getElementById('camera-trigger');
    const fileInput = document.getElementById('food-photo');
    cameraTrigger.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            document.getElementById('food-description').value = "Analizando plato...";
            analyzeFood();
        }
    });

    document.getElementById('save-settings').addEventListener('click', saveSettings);
    document.getElementById('current-glucose').addEventListener('input', updateDoseDisplay);
    document.getElementById('test-key-1').addEventListener('click', () => testKey('cfg-gemini', 'test-key-1', 'Principal'));
    document.getElementById('test-key-2').addEventListener('click', () => testKey('cfg-gemini-backup', 'test-key-2', 'Respaldo'));
    document.getElementById('test-glucose-btn').addEventListener('click', testGlucoseConnection);
    document.getElementById('list-models-btn').addEventListener('click', listPossibleModels);

    document.getElementById('reset-app-btn').addEventListener('click', () => {
        if (confirm("⚠️ ¿Borrar todo?")) { localStorage.clear(); location.reload(); }
    });
}

async function listPossibleModels() {
    const key = (document.getElementById('cfg-gemini').value || USER_CONFIG.GEMINI_KEY || "").trim();
    if (!key) { alert("⚠️ Falta API Key."); return; }
    const btn = document.getElementById('list-models-btn');
    const display = document.getElementById('models-list-display');
    btn.disabled = true; btn.textContent = "Obteniendo...";
    display.classList.remove('hidden'); display.innerHTML = "Cargando modelos...";

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
        const response = await fetch(url);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "Fallo Google");
        const models = data.models || [];
        if (models.length === 0) display.innerHTML = "No se encontraron modelos.";
        else {
            let html = "<strong>Elige uno:</strong><ul style='margin-top: 5px; text-align: left;'>";
            models.forEach(m => {
                const name = m.name.replace('models/', '');
                html += `<li style="color: var(--accent-blue); cursor: pointer;" onclick="document.getElementById('cfg-model-custom').value='${name}'; alert('Copiado: ${name}');">${name}</li>`;
            });
            html += "</ul>"; display.innerHTML = html;
        }
    } catch (e) { display.innerHTML = `Error: ${e.message}`; }
    finally { btn.disabled = false; btn.textContent = "📋 Listar mis Modelos"; }
}

async function testKey(idInput, idBtn, label) {
    const key = (document.getElementById(idInput).value || "").trim();
    if (!key) { alert(`⚠️ Sin clave ${label}`); return; }
    const btn = document.getElementById(idBtn);
    btn.disabled = true; btn.textContent = "Probando...";
    const modelId = document.getElementById('cfg-model-custom').value.trim() || document.getElementById('cfg-model').value;

    try {
        const result = await callGeminiAI("Saluda con HOLA", null, key, modelId);
        if (result) alert(`✅ CLAVE ${label} EXITOSA\nModelo: ${modelId}`);
    } catch (e) {
        alert(`❌ ERROR ${label}:\n${e.message}\nCódigo: ${e.technical?.code}`);
    } finally { btn.disabled = false; btn.textContent = `🧪 Probar ${label}`; }
}

async function testGlucoseConnection() {
    const btn = document.getElementById('test-glucose-btn');
    const url = document.getElementById('cfg-xdrip').value || USER_CONFIG.XDRIP_URL;
    btn.disabled = true; btn.textContent = "Probando...";
    try {
        const resp = await fetch(`${url}/sgv.json?count=1`);
        const data = await resp.json();
        if (data && data.length > 0) alert(`✅ Glucemia: ${data[0].sgv} mg/dL`);
    } catch (e) { alert("❌ Error Glucosa"); }
    finally { btn.disabled = false; btn.textContent = "📡 Probar Glucemia"; }
}

function handleAIError(e, isBackup = false) {
    if (e.message.includes("quota") || e.technical?.code === 429) {
        if (!isBackup && USER_CONFIG.GEMINI_KEY_BACKUP) return;
        alert(`⌛ CUOTA AGOTADA.\nConsejo: Usa 'gemini-flash-latest' o 'gemini-1.5-flash'.\nLos modelos 2.0 y 2.5 tienen cuotas muy bajas.`);
    } else { alert(`⚠️ ERROR IA: ${e.message}`); }
}

async function analyzeFood() {
    const descInput = document.getElementById('food-description');
    const analyzeBtn = document.getElementById('analyze-btn');
    const photoInput = document.getElementById('food-photo');
    analyzeBtn.disabled = true; analyzeBtn.textContent = "Analizando...";

    const key1 = USER_CONFIG.GEMINI_KEY ? USER_CONFIG.GEMINI_KEY.trim() : '';
    const key2 = USER_CONFIG.GEMINI_KEY_BACKUP ? USER_CONFIG.GEMINI_KEY_BACKUP.trim() : '';
    const modelId = USER_CONFIG.CUSTOM_MODEL_ID || USER_CONFIG.SELECTED_MODEL || 'gemini-1.5-flash';

    let photo = photoInput.files[0];
    if (photo) {
        try { photo = await resizeImage(photo, 1024); } catch (e) { console.error("Resize error"); }
    }

    let success = false;
    if (key1) {
        try {
            const result = await callGeminiAI(descInput.value, photo, key1, modelId);
            if (result && result.carbs !== undefined) { applyResults(result); success = true; }
        } catch (e) { handleAIError(e, false); }
    }
    if (!success && key2) {
        try {
            const result = await callGeminiAI(descInput.value, photo, key2, modelId);
            if (result && result.carbs !== undefined) { applyResults(result); success = true; }
        } catch (e) { handleAIError(e, true); }
    }
    if (!success) fallbackLocal(descInput.value, photo);
    analyzeBtn.disabled = false; analyzeBtn.textContent = "Analizar";
}

async function resizeImage(file, maxSize) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width; let height = img.height;
                if (width > height) {
                    if (width > maxSize) { height *= maxSize / width; width = maxSize; }
                } else {
                    if (height > maxSize) { width *= maxSize / height; height = maxSize; }
                }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', 0.8);
            };
        };
    });
}

function applyResults(result) {
    document.getElementById('res-carbs').textContent = `${result.carbs}g`;
    document.getElementById('res-gi').textContent = result.gi || 'Medio';
    if (result.foods_detected) document.getElementById('food-description').value = Array.isArray(result.foods_detected) ? result.foods_detected.join(", ") : result.foods_detected;
    document.getElementById('results-panel').classList.remove('hidden');
    updateDoseDisplay();
}

function fallbackLocal(description, hasPhoto) {
    let carbs = 5; let gi = 'Medio';
    const txt = (description || "").toLowerCase();
    FOOD_DATABASE.forEach(f => { if (txt.includes(f.name)) { carbs = f.carbs; gi = f.gi; } });
    if (hasPhoto) alert("Fallo IA por cuota. Usando estimación local aproximada.");
    document.getElementById('res-carbs').textContent = `${carbs}g`;
    document.getElementById('res-gi').textContent = gi;
    document.getElementById('results-panel').classList.remove('hidden');
    updateDoseDisplay();
}

async function callGeminiAI(promptTxt, file, apiKey, modelId) {
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
    let parts = [];
    if (promptTxt && !promptTxt.includes("analizando")) parts.push({ text: `Entrada: ${promptTxt}` });
    if (file) {
        const b64 = await fileToBase64(file);
        parts.push({ inline_data: { mime_type: file.type, data: b64.split(',')[1] } });
    }
    parts.push({ text: "Analiza nutricionalmente para DM1. Estima Carbohidratos Netos e IG (Alto/Medio/Bajo). Responde EXCLUSIVAMENTE JSON: {\"carbs\": número, \"gi\": \"Alto/Medio/Bajo\", \"foods_detected\": [\"alimentos\"]}" });
    const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }] }) });
    const data = await response.json();
    if (!response.ok) {
        const err = new Error(data.error?.message || "Fallo API");
        err.technical = data.error; throw err;
    }
    try {
        const text = data.candidates[0].content.parts[0].text;
        return JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) { throw new Error("Respuesta no válida."); }
}

function fileToBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); reader.onerror = e => reject(e); }); }

function updateDoseDisplay() {
    const carbs = parseInt(document.getElementById('res-carbs').textContent) || 0;
    const currentG = parseInt(document.getElementById('current-glucose').value) || 100;
    const dose = (carbs / USER_CONFIG.ICR) + ((currentG - USER_CONFIG.TARGET_GLUCOSE) / USER_CONFIG.ISF);
    document.getElementById('suggested-dose').textContent = Math.round(Math.max(0, dose));
}

async function fetchGlucose() {
    if (!USER_CONFIG.XDRIP_URL) return;
    try {
        const resp = await fetch(`${USER_CONFIG.XDRIP_URL}/sgv.json?count=1`);
        const data = await resp.json();
        if (data && data.length > 0) {
            document.getElementById('display-glucose').textContent = data[0].sgv;
            document.getElementById('display-trend').textContent = getTrendIcon(data[0].direction || '');
            document.getElementById('current-glucose').value = data[0].sgv;
            updateDoseDisplay();
        }
    } catch (e) { }
}

async function fetchTreatments() {
    if (!USER_CONFIG.XDRIP_URL) return;
    try {
        const resp = await fetch(`${USER_CONFIG.XDRIP_URL}/treatments.json?count=40`);
        const data = await resp.json();
        if (!data || data.length === 0) return;
        jugglucoTreatments = data.map(t => {
            const tDate = t.date || new Date(t.created_at).getTime();
            return { id: t._id || tDate, timestamp: tDate, date: new Date(tDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), food: t.notes || (t.carbs ? "Carbos" : "Insulina"), dose: t.insulin || 0, carbs: t.carbs || 0, type: 'Juggluco', eventType: t.eventType };
        });
        let carbsT = 0; let iob = 0; const now = Date.now(); const dTab = new Date().setHours(0, 0, 0, 0);
        jugglucoTreatments.forEach(t => {
            if (t.timestamp >= dTab && t.carbs) carbsT += parseFloat(t.carbs);
            if (t.dose && t.eventType !== 'Basal' && !t.food.toLowerCase().includes('tresiba')) {
                const age = (now - t.timestamp) / 60000; if (age > 0 && age < 240) iob += t.dose * (1 - (age / 240));
            }
        });
        const stats = document.querySelectorAll('.stat-value');
        if (stats.length >= 2) { stats[0].textContent = `${iob.toFixed(1)} U`; stats[1].textContent = `${Math.round(carbsT)} g`; }
        renderHistory();
    } catch (e) { }
}

function getTrendIcon(d) { return { 'DoubleUp': '⇈', 'SingleUp': '↑', 'FortyFiveUp': '↗', 'Flat': '→', 'FortyFiveDown': '↘', 'SingleDown': '↓', 'DoubleDown': '⇊' }[d] || ''; }

function loadSettings() {
    const saved = localStorage.getItem('dm1_config');
    if (saved) {
        USER_CONFIG = JSON.parse(saved);
        document.getElementById('cfg-icr').value = USER_CONFIG.ICR || 20;
        document.getElementById('cfg-isf').value = USER_CONFIG.ISF || 50;
        document.getElementById('cfg-target').value = USER_CONFIG.TARGET_GLUCOSE || 100;
        document.getElementById('cfg-xdrip').value = USER_CONFIG.XDRIP_URL || '';
        document.getElementById('cfg-gemini').value = USER_CONFIG.GEMINI_KEY || '';
        document.getElementById('cfg-gemini-backup').value = USER_CONFIG.GEMINI_KEY_BACKUP || '';
        document.getElementById('cfg-model').value = USER_CONFIG.SELECTED_MODEL || 'gemini-1.5-flash';
        document.getElementById('cfg-model-custom').value = USER_CONFIG.CUSTOM_MODEL_ID || '';
    }
}

function saveSettings() {
    USER_CONFIG.ICR = parseFloat(document.getElementById('cfg-icr').value) || 20;
    USER_CONFIG.ISF = parseFloat(document.getElementById('cfg-isf').value) || 50;
    USER_CONFIG.TARGET_GLUCOSE = parseFloat(document.getElementById('cfg-target').value) || 100;
    USER_CONFIG.XDRIP_URL = document.getElementById('cfg-xdrip').value;
    USER_CONFIG.GEMINI_KEY = document.getElementById('cfg-gemini').value.trim();
    USER_CONFIG.GEMINI_KEY_BACKUP = document.getElementById('cfg-gemini-backup').value.trim();
    USER_CONFIG.SELECTED_MODEL = document.getElementById('cfg-model').value;
    USER_CONFIG.CUSTOM_MODEL_ID = document.getElementById('cfg-model-custom').value.trim();
    localStorage.setItem('dm1_config', JSON.stringify(USER_CONFIG));
    alert("✓ Guardado."); if (USER_CONFIG.XDRIP_URL) { fetchGlucose(); fetchTreatments(); }
}

function saveRecord() {
    const record = { id: Date.now(), timestamp: Date.now(), date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), food: document.getElementById('food-description').value, dose: document.getElementById('suggested-dose').textContent, carbs: parseInt(document.getElementById('res-carbs').textContent) || 0, gi: document.getElementById('res-gi').textContent, type: 'App' };
    let history = JSON.parse(localStorage.getItem('dm1_history') || '[]');
    history.unshift(record); localStorage.setItem('dm1_history', JSON.stringify(history.slice(0, 20)));
    renderHistory(); updateChart(record.gi); document.querySelector('[data-view="dashboard"]').click();
}

function renderHistory() {
    const list = document.getElementById('history-list');
    let h = JSON.parse(localStorage.getItem('dm1_history') || '[]');
    let combined = [...h, ...jugglucoTreatments].sort((a, b) => b.timestamp - a.timestamp).slice(0, 30);
    if (!combined.length) { list.innerHTML = '<li>Sin registros</li>'; return; }
    list.innerHTML = combined.map(i => `<li class="history-item"><div><strong>${i.food}</strong> ${i.type === 'Juggluco' ? '<span class="badge-juggluco">Juggluco</span>' : ''}<br><span class="subtitle">${i.date}</span></div><div style="text-align: right"><span style="color: var(--accent-blue);">${i.carbs} g</span><br><span class="subtitle">${i.dose} U</span></div></li>`).join('');
}

function initChart() {
    const canvas = document.getElementById('glucose-chart'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 180); grad.addColorStop(0, 'rgba(59, 130, 246, 0.3)'); grad.addColorStop(1, 'rgba(59, 130, 246, 0.01)');
    glucoseChart = new Chart(ctx, { type: 'line', data: { labels: ['0h', '1h', '2h', '3h', '4h'], datasets: [{ data: [100, 100, 100, 100, 100], borderColor: '#3b82f6', tension: 0.4, fill: true, backgroundColor: grad, pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { display: false, min: 40, max: 250 }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } } });
}

function updateChart(gi) {
    if (!glucoseChart) return;
    const curr = parseInt(document.getElementById('current-glucose').value) || 100;
    let d = gi === 'Alto' ? [curr, curr + 80, curr + 40, curr + 10, curr] : (gi === 'Medio' ? [curr, curr + 40, curr + 50, curr + 20, curr] : [curr, curr + 15, curr + 20, curr + 10, curr]);
    glucoseChart.data.datasets[0].data = d; glucoseChart.update();
}
