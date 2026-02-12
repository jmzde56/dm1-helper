// DM1 Helper - Versión 8.0
const APP_VERSION = "8.0";

let USER_CONFIG = {
    ICR: 20,
    ISF: 50,
    TARGET_GLUCOSE: 100,
    XDRIP_URL: '',
    GEMINI_KEY: ''
};

const FOOD_DATABASE = [
    { name: 'arroz', carbs: 28, gi: 'Alto' },
    { name: 'pan', carbs: 50, gi: 'Alto' },
    { name: 'manzana', carbs: 14, gi: 'Bajo' },
    { name: 'pasta', carbs: 25, gi: 'Medio' },
    { name: 'lentejas', carbs: 20, gi: 'Bajo' },
    { name: 'pollo', carbs: 0, gi: 'Nulo' },
    { name: 'ensalada', carbs: 5, gi: 'Bajo' },
    { name: 'pizza', carbs: 30, gi: 'Alto' },
    { name: 'empanada', carbs: 25, gi: 'Medio' },
    { name: 'carne', carbs: 0, gi: 'Nulo' },
    { name: 'papa', carbs: 17, gi: 'Alto' },
    { name: 'pure', carbs: 15, gi: 'Alto' },
    { name: 'milanesa', carbs: 15, gi: 'Medio' },
    { name: 'hamburguesa', carbs: 30, gi: 'Medio' },
    { name: 'sanguche', carbs: 40, gi: 'Alto' },
    { name: 'fruta', carbs: 15, gi: 'Bajo' },
    { name: 'postre', carbs: 50, gi: 'Alto' }
];

let glucoseChart = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log("DM1 Helper " + APP_VERSION + " inicializado");
    if (document.getElementById('app-version')) {
        document.getElementById('app-version').textContent = "v" + APP_VERSION;
    }
    loadSettings();
    initChart();
    setupNavigation();
    setupEventListeners();
    renderHistory();

    if (USER_CONFIG.XDRIP_URL) {
        fetchxDripGlucose();
        setInterval(fetchxDripGlucose, 300000);
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
}

async function analyzeFood() {
    const descInput = document.getElementById('food-description');
    const description = descInput.value.toLowerCase();
    const resultsPanel = document.getElementById('results-panel');
    const analyzeBtn = document.getElementById('analyze-btn');
    const photoInput = document.getElementById('food-photo');

    if (!description && photoInput.files.length === 0) {
        alert("Por favor, describe tu comida o sube una foto.");
        return;
    }

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "IA Analizando...";
    resultsPanel.classList.add('hidden');

    const apiK = USER_CONFIG.GEMINI_KEY ? USER_CONFIG.GEMINI_KEY.trim() : '';
    if (apiK && apiK.length > 15) {
        try {
            const result = await callGeminiAI(description, photoInput.files[0], apiK);
            if (result && result.carbs !== undefined) {
                document.getElementById('res-carbs').textContent = `${result.carbs}g`;
                document.getElementById('res-gi').textContent = result.gi || 'Medio';

                if (result.foods_detected) {
                    descInput.value = Array.isArray(result.foods_detected) ? result.foods_detected.join(", ") : result.foods_detected;
                }

                resultsPanel.classList.remove('hidden');
                updateDoseDisplay();
                resetAnalyzeButton();
                return;
            }
        } catch (e) {
            console.error("Gemini Error Final (v8):", e);
            alert("⚠️ IA no pudo analizar: " + e.message + "\n\nUsando valores básicos locales.");
        }
    }

    // Fallback Local
    let totalCarbs = 0;
    let mainGI = 'Bajo';
    let found = false;
    const cleanText = description.replace("analizando plato...", "").trim();

    if (cleanText) {
        FOOD_DATABASE.forEach(food => {
            if (cleanText.includes(food.name)) {
                totalCarbs += food.carbs;
                if (food.gi === 'Alto') mainGI = 'Alto';
                else if (food.gi === 'Medio' && mainGI === 'Bajo') mainGI = 'Medio';
                found = true;
            }
        });
    }

    if (!found && photoInput.files.length > 0) { totalCarbs = 30; mainGI = 'Medio'; found = true; }
    if (found || cleanText) {
        if (!found) { totalCarbs = 30; mainGI = 'Medio'; }
        document.getElementById('res-carbs').textContent = `${totalCarbs}g`;
        document.getElementById('res-gi').textContent = mainGI;
        resultsPanel.classList.remove('hidden');
        updateDoseDisplay();
    }
    resetAnalyzeButton();
}

function resetAnalyzeButton() {
    const analyzeBtn = document.getElementById('analyze-btn');
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Analizar";
}

async function callGeminiAI(description, file, apiKey) {
    // Definimos el modelo. Nota: Usar solo el nombre sin "-latest" si persiste el error.
    const model = "gemini-1.5-flash";
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    let parts = [];
    if (description && !description.includes("analizando")) {
        parts.push({ text: `Entrada del usuario: ${description}` });
    }

    if (file) {
        const base64 = await fileToBase64(file);
        parts.push({
            inline_data: {
                mime_type: file.type,
                data: base64.split(',')[1]
            }
        });
    }

    parts.push({ text: "Analiza nutricionalmente este plato para un paciente con DM1. Estima gramos de carbohidratos netos y el índice glucémico (Alto, Medio o Bajo). Responde estrictamente en JSON: {\"carbs\": número, \"gi\": \"Alto/Medio/Bajo\", \"foods_detected\": [\"alimentos\"]}" });

    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] })
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error?.message || "Error de red Gemini");
    }

    try {
        const text = data.candidates[0].content.parts[0].text;
        const cleanJson = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        throw new Error("Respuesta no legible");
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function updateDoseDisplay() {
    const carbsText = document.getElementById('res-carbs').textContent;
    const carbs = parseInt(carbsText) || 0;
    const currentG = parseInt(document.getElementById('current-glucose').value) || 100;
    const carbsDose = carbs / USER_CONFIG.ICR;
    const correctionDose = (currentG - USER_CONFIG.TARGET_GLUCOSE) / USER_CONFIG.ISF;
    const totalDose = Math.max(0, carbsDose + correctionDose);
    document.getElementById('suggested-dose').textContent = Math.round(totalDose);
}

async function fetchxDripGlucose() {
    if (!USER_CONFIG.XDRIP_URL) return;
    try {
        const response = await fetch(`${USER_CONFIG.XDRIP_URL}/sgv.json?count=1`);
        const data = await response.json();
        if (data && data.length > 0) {
            const entry = data[0];
            const glucose = entry.sgv;
            document.getElementById('display-glucose').textContent = glucose;
            document.getElementById('display-trend').textContent = getTrendIcon(entry.direction || '');
            document.getElementById('current-glucose').value = glucose;
            document.getElementById('last-update').textContent = `Actualizado: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            updateDoseDisplay();
        }
    } catch (e) { console.error("xDrip Error:", e); }
}

function getTrendIcon(direction) {
    const icons = { 'DoubleUp': '⇈', 'SingleUp': '↑', 'FortyFiveUp': '↗', 'Flat': '→', 'FortyFiveDown': '↘', 'SingleDown': '↓', 'DoubleDown': '⇊' };
    return icons[direction] || '';
}

function loadSettings() {
    const saved = localStorage.getItem('dm1_config');
    if (saved) {
        USER_CONFIG = JSON.parse(saved);
        document.getElementById('cfg-icr').value = USER_CONFIG.ICR;
        document.getElementById('cfg-isf').value = USER_CONFIG.ISF;
        document.getElementById('cfg-target').value = USER_CONFIG.TARGET_GLUCOSE;
        document.getElementById('cfg-xdrip').value = USER_CONFIG.XDRIP_URL;
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
    if (USER_CONFIG.XDRIP_URL) fetchxDripGlucose();
}

function saveRecord() {
    const food = document.getElementById('food-description').value;
    const dose = document.getElementById('suggested-dose').textContent;
    const gi = document.getElementById('res-gi').textContent;
    const record = { id: Date.now(), date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), food: food || "Comida analizada", dose, gi };
    let history = JSON.parse(localStorage.getItem('dm1_history') || '[]');
    history.unshift(record);
    localStorage.setItem('dm1_history', JSON.stringify(history.slice(0, 15)));
    renderHistory();
    updateChart(gi);
    document.querySelector('[data-view="dashboard"]').click();
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
    const ctx = document.getElementById('glucose-chart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)'); gradient.addColorStop(1, 'rgba(59, 130, 246, 0.01)');
    glucoseChart = new Chart(ctx, { type: 'line', data: { labels: ['0h', '1h', '2h', '3h', '4h'], datasets: [{ data: [100, 100, 100, 100, 100], borderColor: '#3b82f6', borderWidth: 3, backgroundColor: gradient, fill: true, tension: 0.4, pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { display: false, min: 40, max: 250 }, x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } } }, plugins: { legend: { display: false } } } });
}

function updateChart(gi) {
    const currentG = parseInt(document.getElementById('current-glucose').value) || 100;
    let curve = gi === 'Alto' ? [currentG, currentG + 80, currentG + 40, currentG + 10, currentG] : (gi === 'Medio' ? [currentG, currentG + 40, currentG + 50, currentG + 20, currentG] : [currentG, currentG + 15, currentG + 20, currentG + 10, currentG]);
    glucoseChart.data.datasets[0].data = curve;
    glucoseChart.update();
}
