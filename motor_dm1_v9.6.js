// DM1 Helper - Motor de Lógica v9.6 (Juggluco Debug)
const APP_VERSION = "9.6";

let USER_CONFIG = {
    ICR: 20,
    ISF: 50,
    TARGET_GLUCOSE: 100,
    XDRIP_URL: 'http://127.0.0.1:17580',
    GEMINI_KEY: '',
    LAST_WORKING_MODEL: ''
};

const FOOD_DATABASE = [
    { name: 'arroz', carbs: 28, gi: 'Alto' },
    { name: 'pan blanco', carbs: 50, gi: 'Alto' },
    { name: 'pan integral', carbs: 40, gi: 'Medio' },
    { name: 'manzana', carbs: 14, gi: 'Bajo' },
    { name: 'pasta', carbs: 25, gi: 'Medio' },
    { name: 'lentejas', carbs: 20, gi: 'Bajo' },
    { name: 'pollo', carbs: 0, gi: 'Nulo' },
    { name: 'ensalada', carbs: 5, gi: 'Bajo' },
    { name: 'pizza (porcion)', carbs: 30, gi: 'Alto' },
    { name: 'empanada', carbs: 25, gi: 'Medio' },
    { name: 'carne', carbs: 0, gi: 'Nulo' },
    { name: 'papa hervida', carbs: 17, gi: 'Alto' },
    { name: 'pure de papa', carbs: 15, gi: 'Alto' },
    { name: 'milanesa', carbs: 15, gi: 'Medio' },
    { name: 'hamburguesa (solo carne)', carbs: 0, gi: 'Nulo' },
    { name: 'galletita de agua (unidad)', carbs: 5, gi: 'Medio' },
    { name: 'galletita dulce (unidad)', carbs: 7, gi: 'Alto' },
    { name: 'factura (unidad)', carbs: 35, gi: 'Alto' },
    { name: 'yogur entero', carbs: 12, gi: 'Bajo' },
    { name: 'leche (vaso)', carbs: 10, gi: 'Bajo' },
    { name: 'alfajor', carbs: 45, gi: 'Alto' },
    { name: 'bananas', carbs: 20, gi: 'Medio' },
    { name: 'naranja', carbs: 12, gi: 'Bajo' }
];

let glucoseChart = null;

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('app-version')) document.getElementById('app-version').textContent = "v" + APP_VERSION;
    if (document.getElementById('app-version-header')) document.getElementById('app-version-header').textContent = "v" + APP_VERSION;
    loadSettings();
    initChart();
    setupNavigation();
    setupEventListeners();
    renderHistory();
    if (USER_CONFIG.XDRIP_URL) fetchGlucose();
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
    document.getElementById('test-api-btn').addEventListener('click', testGeminiConnection);
    document.getElementById('test-glucose-btn').addEventListener('click', testGlucoseConnection);
}

async function testGlucoseConnection() {
    const btn = document.getElementById('test-glucose-btn');
    const url = document.getElementById('cfg-xdrip').value || USER_CONFIG.XDRIP_URL;
    btn.disabled = true;
    btn.textContent = "Intentando conectar...";

    try {
        const resp = await fetch(`${url}/sgv.json?count=1`);
        const data = await resp.json();
        if (data && data.length > 0) {
            alert(`✅ ¡CONEXIÓN ÉXITO!\nGlucemia detectada: ${data[0].sgv} mg/dL`);
            fetchGlucose();
        } else {
            throw new Error("Respuesta vacía del servidor.");
        }
    } catch (e) {
        let msg = "❌ ERROR DE CONEXIÓN:\n" + e.message;
        if (location.protocol === 'https:' && url.startsWith('http:')) {
            msg += "\n\n⚠️ POSIBLE CAUSA: Estás usando la app por HTTPS y Juggluco por HTTP. Chrome bloquea esto por seguridad ('Mixed Content').";
        }
        alert(msg);
    } finally {
        btn.disabled = false;
        btn.textContent = "📡 Probar Glucemia";
    }
}

async function testGeminiConnection() {
    const key = USER_CONFIG.GEMINI_KEY ? USER_CONFIG.GEMINI_KEY.trim() : '';
    if (!key) { alert("⚠️ Pega tu clave en Ajustes."); return; }
    const btn = document.getElementById('test-api-btn');
    btn.disabled = true;
    btn.textContent = "Probando...";
    try {
        const modelId = await getBestModel(key, true);
        await callGeminiAI("Hola", null, key, modelId);
        alert("✅ ¡Éxito! Conectado con: " + modelId);
    } catch (e) {
        handleAIError(e);
    } finally {
        btn.disabled = false;
        btn.textContent = "🌩️ Probar Conexión IA";
    }
}

function handleAIError(e) {
    if (e.message.includes("quota")) alert("⌛ Cuota IA agotada. Usando base local.");
    else alert("⚠️ IA no disponible: " + e.message);
}

async function getBestModel(apiKey, forceSearch = false) {
    if (!forceSearch && USER_CONFIG.LAST_WORKING_MODEL) return USER_CONFIG.LAST_WORKING_MODEL;
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        const models = data.models || [];
        const best = models.find(m => m.name.includes('flash') && m.name.includes('2.0')) ||
            models.find(m => m.name.includes('flash') && m.name.includes('1.5')) ||
            models.find(m => m.name.includes('flash')) || models[0];
        const modelId = best.name.split('/').pop();
        USER_CONFIG.LAST_WORKING_MODEL = modelId;
        localStorage.setItem('dm1_config', JSON.stringify(USER_CONFIG));
        return modelId;
    } catch (e) { return "gemini-1.5-flash"; }
}

async function analyzeFood() {
    const descInput = document.getElementById('food-description');
    const resultsPanel = document.getElementById('results-panel');
    const analyzeBtn = document.getElementById('analyze-btn');
    const photoInput = document.getElementById('food-photo');
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Estimando...";
    const apiK = USER_CONFIG.GEMINI_KEY ? USER_CONFIG.GEMINI_KEY.trim() : '';
    let successAI = false;

    if (apiK && apiK.length > 15) {
        try {
            const modelId = await getBestModel(apiK);
            const result = await callGeminiAI(descInput.value, photoInput.files[0], apiK, modelId);
            if (result && result.carbs !== undefined) {
                applyResults(result);
                successAI = true;
                if (result.clarification_needed) setTimeout(() => alert("🙋 Pregunta de la IA: " + result.clarification_needed), 500);
            }
        } catch (e) { handleAIError(e); }
    }
    if (!successAI) fallbackLocal(descInput.value, photoInput.files[0]);
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Analizar";
}

function applyResults(result) {
    document.getElementById('res-carbs').textContent = `${result.carbs}g`;
    document.getElementById('res-gi').textContent = result.gi || 'Medio';
    if (result.foods_detected) document.getElementById('food-description').value = Array.isArray(result.foods_detected) ? result.foods_detected.join(", ") : result.foods_detected;
    document.getElementById('results-panel').classList.remove('hidden');
    updateDoseDisplay();
}

function fallbackLocal(description, hasPhoto) {
    let totalCarbs = 0; let mainGI = 'Bajo'; let foundCount = 0;
    const cleanText = description.toLowerCase().replace("analizando plato...", "").trim();
    FOOD_DATABASE.forEach(food => {
        if (cleanText.includes(food.name)) {
            totalCarbs += food.carbs;
            if (food.gi === 'Alto') mainGI = 'Alto';
            else if (food.gi === 'Medio' && mainGI === 'Bajo') mainGI = 'Medio';
            foundCount++;
        }
    });
    if (foundCount === 0) {
        if (hasPhoto) { totalCarbs = parseInt(prompt("No reconozco el plato. ¿Cuántos carbs estimas?", "15")) || 15; mainGI = "Medio"; }
        else if (cleanText.length > 3) { alert("No tengo '" + cleanText + "' en mi base local. Edita los carbs manualmente."); totalCarbs = 0; }
    } else if (totalCarbs > 0 && totalCarbs < 10 && cleanText.includes("galletta")) {
        totalCarbs = totalCarbs * (parseInt(prompt("¿Cuántas unidades son?", "1")) || 1);
    }
    document.getElementById('res-carbs').textContent = `${totalCarbs}g`;
    document.getElementById('res-gi').textContent = mainGI;
    document.getElementById('results-panel').classList.remove('hidden');
    updateDoseDisplay();
}

async function callGeminiAI(promptTxt, file, apiKey, modelId) {
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
    let parts = [];
    if (promptTxt && !promptTxt.includes("analizando")) parts.push({ text: `Entrada: ${promptTxt}` });
    if (file) {
        const base64 = await fileToBase64(file);
        parts.push({ inline_data: { mime_type: file.type, data: base64.split(',')[1] } });
    }
    parts.push({ text: "Analiza nutricionalmente para DM1. Estima gramos de Carbohidratos Netos e IG (Alto/Medio/Bajo). Si dudas, pregunta en 'clarification_needed'. Responde SOLO JSON: {\"carbs\": número, \"gi\": \"Alto/Medio/Bajo\", \"foods_detected\": [\"alimentos\"], \"clarification_needed\": \"pregunta opcional\"}" });
    const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }] }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Fallo API");
    try {
        const text = data.candidates[0].content.parts[0].text;
        return JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) { return null; }
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
            const e = data[0];
            document.getElementById('display-glucose').textContent = e.sgv;
            document.getElementById('display-trend').textContent = getTrendIcon(e.direction || '');
            document.getElementById('current-glucose').value = e.sgv;
            updateDoseDisplay();
        }
    } catch (e) { console.warn("Sync error"); }
}

function getTrendIcon(d) {
    return { 'DoubleUp': '⇈', 'SingleUp': '↑', 'FortyFiveUp': '↗', 'Flat': '→', 'FortyFiveDown': '↘', 'SingleDown': '↓', 'DoubleDown': '⇊' }[d] || '';
}

function loadSettings() {
    const saved = localStorage.getItem('dm1_config');
    if (saved) {
        USER_CONFIG = JSON.parse(saved);
        document.getElementById('cfg-icr').value = USER_CONFIG.ICR || 20;
        document.getElementById('cfg-isf').value = USER_CONFIG.ISF || 50;
        document.getElementById('cfg-target').value = USER_CONFIG.TARGET_GLUCOSE || 100;
        document.getElementById('cfg-xdrip').value = USER_CONFIG.XDRIP_URL || '';
        document.getElementById('cfg-gemini').value = USER_CONFIG.GEMINI_KEY || '';
    }
}

function saveSettings() {
    USER_CONFIG.ICR = parseFloat(document.getElementById('cfg-icr').value) || 20;
    USER_CONFIG.ISF = parseFloat(document.getElementById('cfg-isf').value) || 50;
    USER_CONFIG.TARGET_GLUCOSE = parseFloat(document.getElementById('cfg-target').value) || 100;
    USER_CONFIG.XDRIP_URL = document.getElementById('cfg-xdrip').value;
    USER_CONFIG.GEMINI_KEY = document.getElementById('cfg-gemini').value.trim();
    localStorage.setItem('dm1_config', JSON.stringify(USER_CONFIG));
    alert("✓ Ajustes guardados");
    if (USER_CONFIG.XDRIP_URL) fetchGlucose();
}

function saveRecord() {
    const record = { id: Date.now(), date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), food: document.getElementById('food-description').value || "Comida", dose: document.getElementById('suggested-dose').textContent, gi: document.getElementById('res-gi').textContent };
    let history = JSON.parse(localStorage.getItem('dm1_history') || '[]');
    history.unshift(record);
    localStorage.setItem('dm1_history', JSON.stringify(history.slice(0, 15)));
    renderHistory(); updateChart(record.gi); document.querySelector('[data-view="dashboard"]').click();
}

function renderHistory() {
    const list = document.getElementById('history-list');
    const history = JSON.parse(localStorage.getItem('dm1_history') || '[]');
    if (history.length === 0) { list.innerHTML = '<li class="subtitle" style="text-align:center; padding: 2rem;">No hay registros</li>'; return; }
    list.innerHTML = history.map(item => `
        <li class="history-item">
            <div><strong>${item.food}</strong><br><span class="subtitle">${item.date}</span></div>
            <div style="text-align: right"><span style="color: var(--accent-blue); font-weight: 700;">${item.dose} U</span><br><span class="subtitle">IG ${item.gi}</span></div>
        </li>
    `).join('');
}

function initChart() {
    const canvas = document.getElementById('glucose-chart'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)'); gradient.addColorStop(1, 'rgba(59, 130, 246, 0.01)');
    glucoseChart = new Chart(ctx, { type: 'line', data: { labels: ['0h', '1h', '2h', '3h', '4h'], datasets: [{ data: [100, 100, 100, 100, 100], borderColor: '#3b82f6', borderWidth: 3, backgroundColor: gradient, fill: true, tension: 0.4, pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { display: false, min: 40, max: 250 }, x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } } }, plugins: { legend: { display: false } } } });
}

function updateChart(gi) {
    if (!glucoseChart) return;
    const currentG = parseInt(document.getElementById('current-glucose').value) || 100;
    let curve = gi === 'Alto' ? [currentG, currentG + 80, currentG + 40, currentG + 10, currentG] : (gi === 'Medio' ? [currentG, currentG + 40, currentG + 50, currentG + 20, currentG] : [currentG, currentG + 15, currentG + 20, currentG + 10, currentG]);
    glucoseChart.data.datasets[0].data = curve; glucoseChart.update();
}
