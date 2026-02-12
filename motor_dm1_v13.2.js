// DM1 Helper - Motor de Lógica v13.2 (Details & Resiliency Fix)
const APP_VERSION = "13.2";

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

let jugglucoTreatments = [];
let glucoseStats = { tir: 0, low: 0, high: 0 };
let lastInjection = { dose: 0, time: '--:--' };

document.addEventListener('DOMContentLoaded', () => {
    updateUIElements();
    loadSettings();
    initChart();
    setupNavigation();
    setupEventListeners();
    syncUI();

    // Refresh inicial forzado
    refreshDashboardData();
    setInterval(refreshDashboardData, 300000);
});

function updateUIElements() {
    const vTags = document.querySelectorAll('[id^="app-version"]');
    vTags.forEach(t => t.textContent = "v" + APP_VERSION);
}

function syncUI() {
    const toggle = document.getElementById('activity-toggle');
    const banner = document.getElementById('activity-banner');
    const desc = document.getElementById('activity-desc');

    if (toggle) toggle.checked = USER_CONFIG.ACTIVITY_MODE;
    if (banner && desc) {
        if (USER_CONFIG.ACTIVITY_MODE) {
            banner.classList.add('active');
            desc.textContent = `ACTIVO (ICR 1/${USER_CONFIG.ICR_ACT}, ISF ${USER_CONFIG.ISF_ACT})`;
            desc.style.color = '#3b82f6';
        } else {
            banner.classList.remove('active');
            desc.textContent = `Normal (ICR 1/${USER_CONFIG.ICR}, ISF ${USER_CONFIG.ISF})`;
            desc.style.color = 'inherit';
        }
    }
}

async function refreshDashboardData() {
    console.log("DM1: Refrescando datos...");
    try {
        await Promise.allSettled([
            fetchGlucose(),
            fetchTreatments()
        ]);
        calculateStats();
        renderHistory();
    } catch (e) { console.error("Error en refresh:", e); }
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
            if (targetView === 'history') renderHistory();
            if (targetView === 'dashboard') refreshDashboardData();
        });
    });
}

function setupEventListeners() {
    document.getElementById('analyze-btn').addEventListener('click', () => analyzeFood());
    document.getElementById('save-btn').addEventListener('click', saveRecord);

    document.getElementById('res-carbs').addEventListener('click', () => {
        const val = parseInt(document.getElementById('res-carbs').textContent) || 0;
        const nuevo = prompt("Carbohidratos (g):", val);
        if (nuevo !== null && !isNaN(nuevo)) {
            document.getElementById('res-carbs').textContent = `${nuevo}g`;
            updateDoseDisplay();
        }
    });

    document.getElementById('camera-trigger').addEventListener('click', () => document.getElementById('food-photo').click());
    document.getElementById('food-photo').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            document.getElementById('food-description').value = "Analizando plato...";
            analyzeFood();
        }
    });

    document.getElementById('save-settings').addEventListener('click', saveSettings);
    document.getElementById('current-glucose').addEventListener('input', updateDoseDisplay);
    document.getElementById('test-key-1').addEventListener('click', () => testKey('cfg-gemini', 'test-key-1', 'IA'));
    document.getElementById('test-glucose-btn').addEventListener('click', testGlucoseConnection);
    document.getElementById('list-models-btn').addEventListener('click', listPossibleModels);
    document.getElementById('ai-answer-btn').addEventListener('click', submitAIAnswer);

    // NUEVO v13.2: Detalles de IOB y TIR
    document.getElementById('tir-card').addEventListener('click', showTIRDetails);
    // El primer stat-card es el de IOB
    const statsCards = document.querySelectorAll('.stat-card');
    if (statsCards[0]) statsCards[0].addEventListener('click', showIOBDetails);

    const activityToggle = document.getElementById('activity-toggle');
    if (activityToggle) {
        activityToggle.addEventListener('change', (e) => {
            USER_CONFIG.ACTIVITY_MODE = e.target.checked;
            saveSettingsToLocal();
            syncUI();
            updateDoseDisplay();
        });
    }

    document.getElementById('reset-app-btn').addEventListener('click', () => {
        if (confirm("⚠️ ¿Resetear app?")) { localStorage.clear(); location.reload(); }
    });
}

function showTIRDetails() {
    alert(`📊 Desglose de hoy:\n\n🟢 En Rango: ${glucoseStats.tir}%\n🟠 Alto: ${glucoseStats.high}%\n🔴 Bajo: ${glucoseStats.low}%`);
}

function showIOBDetails() {
    alert(`💉 Última aplicación:\n\n${lastInjection.dose} U a las ${lastInjection.time}\n\n(Basado en registros de la App y Juggluco)`);
}

async function fetchGlucose() {
    if (!USER_CONFIG.XDRIP_URL) return;
    try {
        // Fetch para TIR (últimos 100 registros = ~8 horas)
        const rTir = await fetch(`${USER_CONFIG.XDRIP_URL}/sgv.json?count=100`);
        const dTir = await rTir.json();
        if (dTir && dTir.length > 0) {
            let low = 0, ok = 0, high = 0;
            dTir.forEach(v => {
                if (v.sgv < 70) low++;
                else if (v.sgv <= 180) ok++;
                else high++;
            });
            glucoseStats.tir = Math.round((ok / dTir.length) * 100);
            glucoseStats.low = Math.round((low / dTir.length) * 100);
            glucoseStats.high = Math.round((high / dTir.length) * 100);

            const tirEl = document.getElementById('tir-value');
            if (tirEl) tirEl.textContent = `${glucoseStats.tir}%`;

            // Glucosa actual
            const g = dTir[0].sgv;
            const badge = document.getElementById('main-glucose-badge');
            document.getElementById('display-glucose').textContent = g;
            document.getElementById('current-glucose').value = g;

            badge.classList.remove('low', 'in-range', 'high');
            if (g < 70) badge.classList.add('low');
            else if (g <= 180) badge.classList.add('in-range');
            else badge.classList.add('high');

            updateDoseDisplay();
            document.getElementById('last-update').textContent = "Actualizado: " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    } catch (e) { console.error("Error glucosa:", e); }
}

async function fetchTreatments() {
    if (!USER_CONFIG.XDRIP_URL) return;
    try {
        const r = await fetch(`${USER_CONFIG.XDRIP_URL}/treatments.json?count=100`);
        const d = await r.json();
        if (!d) return;

        jugglucoTreatments = d.map(t => {
            const rawTs = t.date || (t.created_at ? new Date(t.created_at).getTime() : Date.now());
            const ts = isNaN(rawTs) ? new Date(rawTs).getTime() : rawTs;
            return {
                timestamp: ts,
                food: t.notes || (t.carbs ? "Carbos" : (t.insulin ? "Insulina" : "Registro")),
                carbs: parseFloat(t.carbs) || 0,
                dose: parseFloat(t.insulin) || 0,
                date: new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                day: new Date(ts).toDateString(),
                type: 'Juggluco'
            };
        });
    } catch (e) { console.error("Error tratamientos:", e); }
}

function calculateStats() {
    let carbsHoy = 0, iob = 0;
    const now = Date.now();
    const inicioHoy = new Date().setHours(0, 0, 0, 0);

    let local = JSON.parse(localStorage.getItem('dm1_history') || '[]');
    let all = [...local, ...jugglucoTreatments].sort((a, b) => b.timestamp - a.timestamp);

    // Encontrar última inyección
    const ultima = all.find(t => t.dose > 0);
    if (ultima) {
        lastInjection.dose = ultima.dose;
        lastInjection.time = ultima.date;
    }

    all.forEach(t => {
        if (t.timestamp >= inicioHoy) carbsHoy += t.carbs || 0;
        if (t.dose > 0) {
            const ageMins = (now - t.timestamp) / 60000;
            if (ageMins > 0 && ageMins < 240) {
                iob += t.dose * (1 - (ageMins / 240));
            }
        }
    });

    const iobVal = document.querySelector('.stat-value');
    if (iobVal) iobVal.textContent = `${iob.toFixed(1)} U`;
}

function renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;

    let localRaw = JSON.parse(localStorage.getItem('dm1_history') || '[]');
    let local = localRaw.map(i => {
        const ts = i.timestamp || Date.now();
        return { ...i, timestamp: ts, day: new Date(ts).toDateString() };
    });

    let combined = [...local, ...jugglucoTreatments].sort((a, b) => b.timestamp - a.timestamp);

    if (combined.length === 0) {
        list.innerHTML = '<li style="text-align:center; padding: 3rem; opacity: 0.5;">Sin registros</li>';
        return;
    }

    const groups = {};
    combined.forEach(i => {
        if (!i.day) i.day = new Date(i.timestamp).toDateString();
        if (!groups[i.day]) groups[i.day] = { items: [], carbs: 0, dose: 0 };
        groups[i.day].items.push(i);
        groups[i.day].carbs += i.carbs;
        groups[i.day].dose += (i.dose || 0);
    });

    let html = "";
    const todayStr = new Date().toDateString();
    const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
    const sortedDays = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));

    sortedDays.slice(0, 7).forEach(day => {
        let label = day;
        if (day === todayStr) label = "Hoy";
        else if (day === yesterdayStr) label = "Ayer";

        html += `<div class="day-header"><span>${label}</span><span class="day-totals">${Math.round(groups[day].carbs)}g • ${groups[day].dose.toFixed(1)}U</span></div>`;

        groups[day].items.forEach(i => {
            const isInsulin = i.dose > 0 && i.carbs === 0;
            html += `
                <li class="hist-card ${isInsulin ? 'hist-card-insulin' : 'hist-card-food'}">
                    <div class="hist-main">
                        <span class="hist-icon">${isInsulin ? '💧' : '🍖'}</span>
                        <div class="hist-details">
                            <span class="hist-food">${i.food}</span>
                            <span class="hist-time">${i.date} ${i.type === 'Juggluco' ? '• Juggluco' : ''}</span>
                        </div>
                    </div>
                    <div class="hist-values">
                        <span class="hist-amount">${isInsulin ? i.dose + 'U' : i.carbs + 'g'}</span>
                        ${!isInsulin && i.dose > 0 ? `<span class="hist-dose-mini">${i.dose}U</span>` : ''}
                    </div>
                </li>`;
        });
    });

    if (groups[todayStr]) {
        if (document.getElementById('day-carbs')) document.getElementById('day-carbs').textContent = Math.round(groups[todayStr].carbs);
        if (document.getElementById('day-insulin')) document.getElementById('day-insulin').textContent = groups[todayStr].dose.toFixed(1);
    }

    list.innerHTML = html;
}

// Resto de funciones auxiliares (analyzeFood, callGeminiAI, etc) se mantienen igual que v13.1
async function analyzeFood(extraPrompt = "") {
    const desc = document.getElementById('food-description');
    const btn = document.getElementById('analyze-btn');
    const fileInput = document.getElementById('food-photo');
    const qPanel = document.getElementById('ai-question-panel');
    btn.disabled = true; btn.textContent = "Analizando...";
    qPanel.classList.add('hidden');
    let photo = fileInput.files[0];
    if (photo && !extraPrompt) photo = await resizeImage(photo, 1024);
    const model = USER_CONFIG.CUSTOM_MODEL_ID || "gemini-flash-latest";
    try {
        const r = await callGeminiAI(desc.value + (extraPrompt ? ` (R: ${extraPrompt})` : ""), photo, USER_CONFIG.GEMINI_KEY, model);
        if (r.question) {
            document.getElementById('ai-question-text').textContent = r.question;
            qPanel.classList.remove('hidden');
            document.getElementById('results-panel').classList.remove('hidden');
        } else applyResults(r);
    } catch (e) { alert("Error IA: " + e.message); }
    btn.disabled = false; btn.textContent = "Analizar";
}

async function submitAIAnswer() {
    const ans = document.getElementById('ai-answer-input').value;
    if (!ans) return;
    document.getElementById('ai-answer-input').value = "";
    await analyzeFood(ans);
}

function applyResults(r) {
    document.getElementById('res-carbs').textContent = `${r.carbs}g`;
    document.getElementById('res-gi').textContent = r.gi || 'Medio';
    document.getElementById('results-panel').classList.remove('hidden');
    updateDoseDisplay();
}

async function callGeminiAI(txt, file, key, model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    let p = []; if (txt) p.push({ text: txt });
    if (file) p.push({ inline_data: { mime_type: "image/jpeg", data: (await fileToBase64(file)).split(',')[1] } });
    p.push({ text: "Analiza carbohidratos netos e IG. Si hay duda (cantidades o tipo de alimento en imagen), pregunta brevemente en campo 'question'. Responde JSON: {\"carbs\": num, \"gi\": \"Alto/Medio/Bajo\", \"question\": \"pregunta o null\"}" });
    const r = await fetch(url, { method: 'POST', body: JSON.stringify({ contents: [{ parts: p }] }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error?.message);
    const res = d.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
    return JSON.parse(res);
}

function saveRecord() {
    const record = {
        timestamp: Date.now(),
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        food: document.getElementById('food-description').value || "Comida",
        carbs: parseInt(document.getElementById('res-carbs').textContent) || 0,
        dose: parseFloat(document.getElementById('suggested-dose').textContent) || 0
    };
    let h = JSON.parse(localStorage.getItem('dm1_history') || '[]');
    h.unshift(record); localStorage.setItem('dm1_history', JSON.stringify(h.slice(0, 100)));
    refreshDashboardData();
    document.querySelector('[data-view="dashboard"]').click();
}

function loadSettings() {
    const s = localStorage.getItem('dm1_config');
    if (s) {
        USER_CONFIG = { ...USER_CONFIG, ...JSON.parse(s) };
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
    USER_CONFIG.ICR = parseFloat(document.getElementById('cfg-icr').value) || 15;
    USER_CONFIG.ISF = parseFloat(document.getElementById('cfg-isf').value) || 70;
    USER_CONFIG.ICR_ACT = parseFloat(document.getElementById('cfg-icr-act').value) || 25;
    USER_CONFIG.ISF_ACT = parseFloat(document.getElementById('cfg-isf-act').value) || 100;
    USER_CONFIG.XDRIP_URL = document.getElementById('cfg-xdrip').value;
    USER_CONFIG.GEMINI_KEY = document.getElementById('cfg-gemini').value.trim();
    USER_CONFIG.GEMINI_KEY_BACKUP = document.getElementById('cfg-gemini-backup').value.trim();
    USER_CONFIG.CUSTOM_MODEL_ID = document.getElementById('cfg-model-custom').value.trim();
    saveSettingsToLocal(); alert("✓ Ajustes guardados"); syncUI(); refreshDashboardData();
}

function saveSettingsToLocal() { localStorage.setItem('dm1_config', JSON.stringify(USER_CONFIG)); }

function updateDoseDisplay() {
    const carbs = parseInt(document.getElementById('res-carbs').textContent) || 0;
    const g = parseInt(document.getElementById('current-glucose').value) || 100;
    const icr = USER_CONFIG.ACTIVITY_MODE ? USER_CONFIG.ICR_ACT : USER_CONFIG.ICR;
    const isf = USER_CONFIG.ACTIVITY_MODE ? USER_CONFIG.ISF_ACT : USER_CONFIG.ISF;
    const dose = (carbs / icr) + ((g - 100) / isf);
    document.getElementById('suggested-dose').textContent = Math.round(Math.max(0, dose));
}

async function testKey(idIn, idBtn, lbl) {
    const key = document.getElementById(idIn).value;
    const btn = document.getElementById(idBtn); btn.disabled = true;
    try { await callGeminiAI("Test", null, key, "gemini-flash-latest"); alert("✅ OK"); }
    catch (e) { alert("❌ " + e.message); }
    btn.disabled = false; btn.textContent = "🧪 Probar " + lbl;
}

async function testGlucoseConnection() {
    try {
        const r = await fetch(`${document.getElementById('cfg-xdrip').value}/sgv.json?count=1`);
        const d = await r.json(); alert(`✅ ${d[0].sgv} mg/dL`);
    } catch (e) { alert("❌ Error"); }
}

async function listPossibleModels() {
    const key = document.getElementById('cfg-gemini').value || USER_CONFIG.GEMINI_KEY;
    const disp = document.getElementById('models-list-display'); disp.classList.remove('hidden');
    try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await r.json();
        let h = "<ul>"; (data.models || []).forEach(m => {
            const n = m.name.replace('models/', '');
            h += `<li style="cursor:pointer;color:var(--accent-blue)" onclick="document.getElementById('cfg-model-custom').value='${n}'">${n}</li>`;
        }); disp.innerHTML = h + "</ul>";
    } catch (e) { disp.innerHTML = "Error"; }
}

function initChart() {
    const ctx = document.getElementById('glucose-chart')?.getContext('2d'); if (!ctx) return;
    glucoseChart = new Chart(ctx, { type: 'line', data: { labels: ['-4h', '-3h', '-2h', '-1h', '0'], datasets: [{ data: [110, 130, 145, 120, 100], borderColor: '#3b82f6', tension: 0.4, fill: true, pointRadius: 0 }] }, options: { scales: { y: { display: false, min: 40, max: 250 }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } } });
}

function fileToBase64(f) { return new Promise((s) => { const r = new FileReader(); r.readAsDataURL(f); r.onload = () => s(r.result); }); }

async function resizeImage(file, maxSize) {
    return new Promise((resolve) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image(); img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > h) { if (w > maxSize) { h *= maxSize / w; w = maxSize; } }
                else { if (h > maxSize) { w *= maxSize / h; h = maxSize; } }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob((b) => resolve(new File([b], file.name, { type: 'image/jpeg' })), 'image/jpeg', 0.8);
            };
        };
    });
}
