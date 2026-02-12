// DM1 Helper - Motor de Lógica v11.0 (Activity Profiles)
const APP_VERSION = "11.0";

let USER_CONFIG = {
    ICR: 15,
    ISF: 70,
    ICR_ACT: 25,
    ISF_ACT: 100,
    TARGET_GLUCOSE: 100,
    XDRIP_URL: 'http://127.0.0.1:17580',
    GEMINI_KEY: '',
    GEMINI_KEY_BACKUP: '',
    CUSTOM_MODEL_ID: 'gemini-flash-latest',
    ACTIVITY_MODE: false
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
    syncUI(); // Sincroniza visualmente el toggle
    if (USER_CONFIG.XDRIP_URL) {
        fetchGlucose();
        fetchTreatments();
        setInterval(fetchGlucose, 300000);
        setInterval(fetchTreatments, 600000);
    }
});

function syncUI() {
    const toggle = document.getElementById('activity-toggle');
    const banner = document.getElementById('activity-banner');
    const desc = document.getElementById('activity-desc');

    toggle.checked = USER_CONFIG.ACTIVITY_MODE;
    if (USER_CONFIG.ACTIVITY_MODE) {
        banner.classList.add('active');
        desc.textContent = `ACTIVO (ICR 1/${USER_CONFIG.ICR_ACT}, ISF ${USER_CONFIG.ISF_ACT})`;
        desc.style.color = 'var(--accent-blue)';
    } else {
        banner.classList.remove('active');
        desc.textContent = `Normal (ICR 1/${USER_CONFIG.ICR}, ISF ${USER_CONFIG.ISF})`;
        desc.style.color = 'inherit';
    }
}

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
        const nuevo = prompt("Carbohidratos (g):", parseInt(document.getElementById('res-carbs').textContent));
        if (nuevo !== null && !isNaN(nuevo)) {
            document.getElementById('res-carbs').textContent = `${nuevo}g`;
            updateDoseDisplay();
        }
    });

    const fileInput = document.getElementById('food-photo');
    document.getElementById('camera-trigger').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            document.getElementById('food-description').value = "Analizando plato...";
            analyzeFood();
        }
    });

    document.getElementById('save-settings').addEventListener('click', saveSettings);
    document.getElementById('current-glucose').addEventListener('input', updateDoseDisplay);
    document.getElementById('test-key-1').addEventListener('click', () => testKey('cfg-gemini', 'test-key-1', 'IA'));
    document.getElementById('test-glucose-btn').addEventListener('click', testGlucoseConnection);
    document.getElementById('list-models-btn').addEventListener('click', listPossibleModels);

    document.getElementById('activity-toggle').addEventListener('change', (e) => {
        USER_CONFIG.ACTIVITY_MODE = e.target.checked;
        saveSettingsToLocal();
        syncUI();
        updateDoseDisplay();
    });

    document.getElementById('reset-app-btn').addEventListener('click', () => {
        if (confirm("⚠️ ¿Resetear app?")) { localStorage.clear(); location.reload(); }
    });
}

async function listPossibleModels() {
    const key = (document.getElementById('cfg-gemini').value || USER_CONFIG.GEMINI_KEY || "").trim();
    const display = document.getElementById('models-list-display');
    display.classList.remove('hidden'); display.innerHTML = "Cargando...";
    try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const d = await r.json();
        let html = "<ul>";
        (d.models || []).forEach(m => {
            const n = m.name.replace('models/', '');
            html += `<li style="cursor:pointer; color:var(--accent-blue)" onclick="document.getElementById('cfg-model-custom').value='${n}'">${n}</li>`;
        });
        display.innerHTML = html + "</ul>";
    } catch (e) { display.innerHTML = "Error"; }
}

async function testKey(idInput, idBtn, label) {
    const key = document.getElementById(idInput).value.trim();
    const btn = document.getElementById(idBtn);
    btn.disabled = true; btn.textContent = "Test...";
    try {
        const model = document.getElementById('cfg-model-custom').value.trim() || "gemini-flash-latest";
        const r = await callGeminiAI("Hola", null, key, model);
        alert(r ? "✅ Conexión Exitosa" : "❌ Error");
    } catch (e) { alert("❌ " + e.message); }
    btn.disabled = false; btn.textContent = "🧪 Probar " + label;
}

async function testGlucoseConnection() {
    const url = document.getElementById('cfg-xdrip').value;
    try {
        const r = await fetch(`${url}/sgv.json?count=1`);
        const d = await r.json();
        alert(`✅ Glucemia: ${d[0].sgv}`);
    } catch (e) { alert("❌ Error"); }
}

function updateDoseDisplay() {
    const carbs = parseInt(document.getElementById('res-carbs').textContent) || 0;
    const currentG = parseInt(document.getElementById('current-glucose').value) || 100;

    const icr = USER_CONFIG.ACTIVITY_MODE ? USER_CONFIG.ICR_ACT : USER_CONFIG.ICR;
    const isf = USER_CONFIG.ACTIVITY_MODE ? USER_CONFIG.ISF_ACT : USER_CONFIG.ISF;

    const dose = (carbs / icr) + ((currentG - USER_CONFIG.TARGET_GLUCOSE) / isf);
    document.getElementById('suggested-dose').textContent = Math.round(Math.max(0, dose));
}

async function analyzeFood() {
    const desc = document.getElementById('food-description');
    const btn = document.getElementById('analyze-btn');
    const file = document.getElementById('food-photo').files[0];
    btn.disabled = true; btn.textContent = "Analizando...";

    let photo = file;
    if (photo) photo = await resizeImage(photo, 1024);

    const model = USER_CONFIG.CUSTOM_MODEL_ID || "gemini-flash-latest";
    try {
        const r = await callGeminiAI(desc.value, photo, USER_CONFIG.GEMINI_KEY, model);
        if (r) applyResults(r);
        else throw new Error("Fallo");
    } catch (e) {
        if (USER_CONFIG.GEMINI_KEY_BACKUP) {
            try {
                const rb = await callGeminiAI(desc.value, photo, USER_CONFIG.GEMINI_KEY_BACKUP, model);
                if (rb) applyResults(rb);
            } catch (eb) { fallbackLocal(desc.value, photo); }
        } else fallbackLocal(desc.value, photo);
    }
    btn.disabled = false; btn.textContent = "Analizar";
}

async function resizeImage(file, maxSize) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image(); img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > h) { if (w > maxSize) { h *= maxSize / w; w = maxSize; } }
                else { if (h > maxSize) { w *= maxSize / h; h = maxSize; } }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob((b) => resolve(new File([b], file.name, { type: 'image/jpeg' })), 'image/jpeg', 0.8);
            };
        };
    });
}

function applyResults(r) {
    document.getElementById('res-carbs').textContent = `${r.carbs}g`;
    document.getElementById('res-gi').textContent = r.gi || 'Medio';
    document.getElementById('results-panel').classList.remove('hidden');
    updateDoseDisplay();
}

function fallbackLocal(desc, photo) {
    let c = 10; let gi = 'Medio';
    FOOD_DATABASE.forEach(f => { if (desc.toLowerCase().includes(f.name)) { c = f.carbs; gi = f.gi; } });
    document.getElementById('res-carbs').textContent = `${c}g`;
    document.getElementById('res-gi').textContent = gi;
    document.getElementById('results-panel').classList.remove('hidden');
    updateDoseDisplay();
}

async function callGeminiAI(txt, file, key, model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    let p = [];
    if (txt) p.push({ text: txt });
    if (file) p.push({ inline_data: { mime_type: file.type, data: (await fileToBase64(file)).split(',')[1] } });
    p.push({ text: "Analiza carbohidratos netos e IG (Alto/Medio/Bajo) para DM1. Responde SOLO JSON: {\"carbs\": número, \"gi\": \"Alto/Medio/Bajo\"}" });
    const r = await fetch(url, { method: 'POST', body: JSON.stringify({ contents: [{ parts: p }] }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message);
    return JSON.parse(d.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim());
}

function fileToBase64(f) { return new Promise((s, r) => { const rd = new FileReader(); rd.readAsDataURL(f); rd.onload = () => s(rd.result); }); }

async function fetchGlucose() {
    if (!USER_CONFIG.XDRIP_URL) return;
    try {
        const r = await fetch(`${USER_CONFIG.XDRIP_URL}/sgv.json?count=1`);
        const d = await r.json();
        document.getElementById('display-glucose').textContent = d[0].sgv;
        document.getElementById('current-glucose').value = d[0].sgv;
        updateDoseDisplay();
    } catch (e) { }
}

async function fetchTreatments() {
    if (!USER_CONFIG.XDRIP_URL) return;
    try {
        const r = await fetch(`${USER_CONFIG.XDRIP_URL}/treatments.json?count=40`);
        const d = await r.json();
        jugglucoTreatments = d.map(t => ({ timestamp: t.date || new Date(t.created_at).getTime(), food: t.notes || "Juggluco", carbs: t.carbs || 0, dose: t.insulin || 0, date: new Date(t.date || t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), type: 'Juggluco' }));
        renderHistory();
    } catch (e) { }
}

function loadSettings() {
    const s = localStorage.getItem('dm1_config');
    if (s) {
        USER_CONFIG = JSON.parse(s);
        document.getElementById('cfg-icr').value = USER_CONFIG.ICR;
        document.getElementById('cfg-isf').value = USER_CONFIG.ISF;
        document.getElementById('cfg-icr-act').value = USER_CONFIG.ICR_ACT;
        document.getElementById('cfg-isf-act').value = USER_CONFIG.ISF_ACT;
        document.getElementById('cfg-xdrip').value = USER_CONFIG.XDRIP_URL;
        document.getElementById('cfg-gemini').value = USER_CONFIG.GEMINI_KEY;
        document.getElementById('cfg-gemini-backup').value = USER_CONFIG.GEMINI_KEY_BACKUP;
        document.getElementById('cfg-model-custom').value = USER_CONFIG.CUSTOM_MODEL_ID;
    }
}

function saveSettings() {
    USER_CONFIG.ICR = parseFloat(document.getElementById('cfg-icr').value);
    USER_CONFIG.ISF = parseFloat(document.getElementById('cfg-isf').value);
    USER_CONFIG.ICR_ACT = parseFloat(document.getElementById('cfg-icr-act').value);
    USER_CONFIG.ISF_ACT = parseFloat(document.getElementById('cfg-isf-act').value);
    USER_CONFIG.XDRIP_URL = document.getElementById('cfg-xdrip').value;
    USER_CONFIG.GEMINI_KEY = document.getElementById('cfg-gemini').value.trim();
    USER_CONFIG.GEMINI_KEY_BACKUP = document.getElementById('cfg-gemini-backup').value.trim();
    USER_CONFIG.CUSTOM_MODEL_ID = document.getElementById('cfg-model-custom').value.trim();
    saveSettingsToLocal();
    alert("✓ Guardado");
    syncUI();
}

function saveSettingsToLocal() { localStorage.setItem('dm1_config', JSON.stringify(USER_CONFIG)); }

function saveRecord() {
    const r = { timestamp: Date.now(), date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), food: document.getElementById('food-description').value, dose: document.getElementById('suggested-dose').textContent, carbs: parseInt(document.getElementById('res-carbs').textContent), gi: document.getElementById('res-gi').textContent, type: 'App' };
    let h = JSON.parse(localStorage.getItem('dm1_history') || '[]');
    h.unshift(r); localStorage.setItem('dm1_history', JSON.stringify(h.slice(0, 20)));
    renderHistory(); document.querySelector('[data-view="dashboard"]').click();
}

function renderHistory() {
    const l = document.getElementById('history-list');
    let h = JSON.parse(localStorage.getItem('dm1_history') || '[]');
    let c = [...h, ...jugglucoTreatments].sort((a, b) => b.timestamp - a.timestamp).slice(0, 30);
    l.innerHTML = c.map(i => `<li class="history-item"><div><strong>${i.food}</strong> ${i.type === 'Juggluco' ? '<small>J</small>' : ''}<br>${i.date}</div><div style="text-align:right">${i.carbs}g<br>${i.dose}U</div></li>`).join('');
}

function initChart() {
    const ctx = document.getElementById('glucose-chart')?.getContext('2d'); if (!ctx) return;
    glucoseChart = new Chart(ctx, { type: 'line', data: { labels: ['0h', '1h', '2h', '3h', '4h'], datasets: [{ data: [100, 100, 100, 100, 100], borderColor: '#3b82f6', tension: 0.4, fill: true, pointRadius: 0 }] }, options: { scales: { y: { display: false, min: 40, max: 250 }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } } });
}
