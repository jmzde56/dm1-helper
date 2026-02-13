// DM1 Helper - Motor de Lógica v15.0 (AI Coach & Expert System)
const APP_VERSION = "15.1";

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
    ACTIVITY_MODE: false,
    ACTIVITY_UNTIL: null,
    SPORT_TYPE: 'active', // 'pre', 'active', 'recovery'
    // v15: Perfiles por franjas
    RATIOS: {
        BREAKFAST: { icr: 15, isf: 70, start: 6 }, // 6:00 - 11:00
        LUNCH: { icr: 15, isf: 70, start: 11 },   // 11:00 - 16:00
        DINNER: { icr: 15, isf: 70, start: 16 },  // 16:00 - 22:00
        NIGHT: { icr: 15, isf: 70, start: 22 }    // 22:00 - 06:00
    }
};

let jugglucoTreatments = [];
let glucoseStats = { tir: 0, low: 0, high: 0 };
let lastInjection = { dose: 0, time: '--:--' };
let selectedTrend = 'flat';
let glucoseChart;

document.addEventListener('DOMContentLoaded', () => {
    updateUIElements();
    loadSettings();
    initChart();
    setupNavigation();
    setupEventListeners();
    syncUI();

    checkActivityTimer(); // Verificar si el modo actividad expiró
    checkPizzaReminders();
    refreshDashboardData();
    setInterval(refreshDashboardData, 300000);
    setInterval(checkActivityTimer, 60000); // Check cada minuto
    setInterval(checkPizzaReminders, 60000);
});

function updateUIElements() {
    const vTags = document.querySelectorAll('[id^="app-version"]');
    vTags.forEach(t => t.textContent = "v" + APP_VERSION);
}

function syncUI() {
    const toggle = document.getElementById('activity-toggle');
    const banner = document.getElementById('activity-banner');
    const desc = document.getElementById('activity-desc');
    const timerOpts = document.getElementById('activity-timer-options');
    const timerDisplay = document.getElementById('active-timer-display');

    if (toggle) toggle.checked = USER_CONFIG.ACTIVITY_MODE;
    if (banner && desc) {
        if (USER_CONFIG.ACTIVITY_MODE) {
            const sportLabels = { 'pre': 'PRE-ENTRENO', 'active': 'ACTIVO', 'recovery': 'RECUPERACIÓN' };
            const sportType = USER_CONFIG.SPORT_TYPE || 'active';

            // Sensibilidades dinámicas por modo sport
            let actIcr = USER_CONFIG.ICR_ACT || 25;
            let actIsf = USER_CONFIG.ISF_ACT || 100;

            if (sportType === 'pre') { actIcr *= 1.2; actIsf *= 1.2; } // +20% menos insulina
            else if (sportType === 'recovery') { actIcr *= 1.1; actIsf *= 1.1; } // +10% menos insulina

            banner.classList.add('active');
            desc.textContent = `${sportLabels[sportType]} (ICR 1/${Math.round(actIcr)}, ISF ${Math.round(actIsf)})`;
            desc.style.color = '#3b82f6';

            const sportModesBox = document.getElementById('sport-modes');
            if (sportModesBox) sportModesBox.classList.remove('hidden');

            const sportOpts = document.querySelectorAll('.sport-opt');
            sportOpts.forEach(opt => opt.classList.toggle('active', opt.getAttribute('data-sport') === sportType));

            if (USER_CONFIG.ACTIVITY_UNTIL) {
                const mins = Math.round((USER_CONFIG.ACTIVITY_UNTIL - Date.now()) / 60000);
                if (timerDisplay) timerDisplay.textContent = mins > 0 ? `Quedan ${Math.floor(mins / 60)}h ${mins % 60}m` : "";
            }
        } else {
            const current = getCurrentRatios();
            banner.classList.remove('active');
            desc.textContent = `Normal (ICR 1/${current.icr}, ISF ${current.isf})`;
            desc.style.color = 'inherit';

            const sportModesBox = document.getElementById('sport-modes');
            if (sportModesBox) sportModesBox.classList.add('hidden');

            if (timerDisplay) timerDisplay.textContent = "";
        }
    }
}

async function refreshDashboardData() {
    try {
        await fetchGlucose();
        await fetchTreatments();
        calculateStats();
        renderHistory();
    } catch (e) { console.error("Error refresh:", e); }
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
            document.getElementById('food-description').value = "Identificando plato...";
            analyzeFood();
        }
    });

    document.getElementById('save-settings').addEventListener('click', saveSettings);
    document.getElementById('current-glucose').addEventListener('input', updateDoseDisplay);
    document.getElementById('test-key-1').addEventListener('click', () => testKey('cfg-gemini', 'test-key-1', 'IA'));
    document.getElementById('test-glucose-btn').addEventListener('click', testGlucoseConnection);
    document.getElementById('list-models-btn').addEventListener('click', listPossibleModels);
    document.getElementById('ai-answer-btn').addEventListener('click', submitAIAnswer);

    document.getElementById('tir-card').addEventListener('click', showTIRDetails);

    const statsCards = document.querySelectorAll('.stat-card');
    if (statsCards[0]) statsCards[0].addEventListener('click', showIOBDetails);

    // v14: Hypo SOS
    const hypoBtn = document.getElementById('hypo-btn');
    if (hypoBtn) hypoBtn.addEventListener('click', calculateHypoRescue);

    // v14: Trend Selector
    const trendOpts = document.querySelectorAll('.trend-opt');
    trendOpts.forEach(opt => {
        opt.addEventListener('click', () => {
            trendOpts.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            selectedTrend = opt.getAttribute('data-trend');
            updateDoseDisplay();
        });
    });

    // v14: Activity Timer
    const timerBtns = document.querySelectorAll('.timer-btn');
    timerBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const hrs = parseInt(btn.getAttribute('data-hours'));
            USER_CONFIG.ACTIVITY_UNTIL = Date.now() + (hrs * 3600000);
            timerBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            saveSettingsToLocal();
            syncUI();
            alert(`⏱️ Modo Actividad activo por ${hrs} horas.`);
        });
    });

    const activityToggle = document.getElementById('activity-toggle');
    if (activityToggle) {
        activityToggle.addEventListener('change', (e) => {
            USER_CONFIG.ACTIVITY_MODE = e.target.checked;
            if (!USER_CONFIG.ACTIVITY_MODE) {
                USER_CONFIG.ACTIVITY_UNTIL = null;
            }
            saveSettingsToLocal();
            syncUI();
            updateDoseDisplay();
        });
    }

    document.getElementById('reset-app-btn').addEventListener('click', () => {
        if (confirm("⚠️ ¿Resetear app?")) { localStorage.clear(); location.reload(); }
    });

    // v15: Sport Modes
    const sportOpts = document.querySelectorAll('.sport-opt');
    sportOpts.forEach(opt => {
        opt.addEventListener('click', () => {
            USER_CONFIG.SPORT_TYPE = opt.getAttribute('data-sport');
            sportOpts.forEach(o => o.classList.toggle('active', o === opt));
            syncUI();
            updateDoseDisplay();
            saveSettingsToLocal();
        });
    });

    // v15: AI Coach
    const coachBtn = document.getElementById('ai-coach-btn');
    if (coachBtn) coachBtn.addEventListener('click', consultAICoach);

    // v15.1: Exercise Advice & Modal
    const exerciseBtn = document.getElementById('exercise-advice-btn');
    if (exerciseBtn) exerciseBtn.addEventListener('click', getExerciseAdvice);

    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('modal-ok-btn').addEventListener('click', closeModal);
    window.addEventListener('click', (e) => { if (e.target.id === 'ai-modal') closeModal(); });
}

function calculateHypoRescue() {
    const g = parseInt(document.getElementById('display-glucose').textContent) || 0;
    if (g === 0 || g > 100) {
        alert("Glucemia estable o sin datos. No se requiere rescate.");
        return;
    }
    // Fórmula: (100 - Actual) / 4 (Aprox 1g sube 4mg/dL para 61kg)
    const chReq = Math.round((100 - g) / 4);
    alert(`🚨 RESCATE HIPO\n\nGlucemia: ${g} mg/dL\nNecesitas exactamente:\n\n👉 ${chReq}g de Carbohidratos Rápidos\n\nEjemplo: ${Math.round(chReq / 5)} sobres de azúcar o ${Math.round(chReq / 0.3)}ml de Coca-Cola.`);
}

function checkActivityTimer() {
    if (USER_CONFIG.ACTIVITY_MODE && USER_CONFIG.ACTIVITY_UNTIL) {
        if (Date.now() > USER_CONFIG.ACTIVITY_UNTIL) {
            USER_CONFIG.ACTIVITY_MODE = false;
            USER_CONFIG.ACTIVITY_UNTIL = null;
            saveSettingsToLocal();
            syncUI();
            updateDoseDisplay();
            alert("🔔 Temporizador: Modo Actividad finalizado. Volviendo a perfil Normal.");
        }
    }
}

function updateDoseDisplay() {
    const carbs = parseInt(document.getElementById('res-carbs').textContent) || 0;
    const g = parseInt(document.getElementById('current-glucose').value) || 100;

    // v15: Selección de ratio por horario vs actividad
    const current = getCurrentRatios();
    let icr = current.icr;
    let isf = current.isf;

    if (USER_CONFIG.ACTIVITY_MODE) {
        icr = USER_CONFIG.ICR_ACT;
        isf = USER_CONFIG.ISF_ACT;
        const sportType = USER_CONFIG.SPORT_TYPE || 'active';
        if (sportType === 'pre') { icr *= 1.2; isf *= 1.2; }
        else if (sportType === 'recovery') { icr *= 1.1; isf *= 1.1; }
    }

    let dose = (carbs / icr) + ((g - 100) / isf);

    // v14: Ajuste por Tendencia
    let multiplier = 1.0;
    if (selectedTrend === 'down2') multiplier = 0.7;  // -30%
    else if (selectedTrend === 'down1') multiplier = 0.8; // -20%
    else if (selectedTrend === 'up1') multiplier = 1.1;  // +10%
    else if (selectedTrend === 'up2') multiplier = 1.15; // +15%

    dose = dose * multiplier;

    const finalDose = Math.round(Math.max(0, dose));
    document.getElementById('suggested-dose').textContent = finalDose;
}

function showTIRDetails() {
    alert(`📊 TIR Hoy (desde 00:00):\n\n🟢 En Rango: ${glucoseStats.tir}%\n🟠 Alto: ${glucoseStats.high}%\n🔴 Bajo: ${glucoseStats.low}%`);
}

function showIOBDetails() {
    alert(`💉 Última aplicación:\n\n${lastInjection.dose} U a las ${lastInjection.time}\n\n(Dato más reciente de hoy)`);
}

async function fetchGlucose() {
    if (!USER_CONFIG.XDRIP_URL) return;
    try {
        const r = await fetch(`${USER_CONFIG.XDRIP_URL}/sgv.json?count=300`);
        const d = await r.json();
        if (d && d.length > 0) {
            const inicioHoy = new Date().setHours(0, 0, 0, 0);
            const hoyData = d.filter(v => (v.date || v.mills || Date.now()) >= inicioHoy);

            if (hoyData.length > 0) {
                let low = 0, ok = 0, high = 0;
                hoyData.forEach(v => {
                    if (v.sgv < 70) low++;
                    else if (v.sgv <= 180) ok++;
                    else high++;
                });
                glucoseStats.tir = Math.round((ok / hoyData.length) * 100);
                glucoseStats.low = Math.round((low / hoyData.length) * 100);
                glucoseStats.high = Math.round((high / hoyData.length) * 100);
            }

            const tirEl = document.getElementById('tir-value');
            if (tirEl) tirEl.textContent = `${glucoseStats.tir}%`;

            const g = d[0].sgv;
            const dir = d[0].direction;
            document.getElementById('display-glucose').textContent = g;
            document.getElementById('current-glucose').value = g;

            // v14.1: Auto-Trend Selection
            if (dir) {
                let targetTrend = 'flat';
                if (dir.includes('DownDown') || dir === 'DoubleDown') targetTrend = 'down2';
                else if (dir.includes('Down')) targetTrend = 'down1';
                else if (dir.includes('UpUp') || dir === 'DoubleUp') targetTrend = 'up2';
                else if (dir.includes('Up')) targetTrend = 'up1';

                selectedTrend = targetTrend;
                const trendOpts = document.querySelectorAll('.trend-opt');
                trendOpts.forEach(opt => {
                    opt.classList.toggle('active', opt.getAttribute('data-trend') === selectedTrend);
                });
            }

            const badge = document.getElementById('main-glucose-badge');
            badge.classList.remove('low', 'in-range', 'high');
            if (g < 70) badge.classList.add('low');
            else if (g <= 180) badge.classList.add('in-range');
            else badge.classList.add('high');

            updateDoseDisplay();
            document.getElementById('last-update').textContent = "Hoy: " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            updateChart(d);
        }
    } catch (e) { console.error("Error G:", e); }
}

function updateChart(sgvData) {
    if (!glucoseChart || !sgvData || sgvData.length === 0) return;

    const now = Date.now();
    const fourHoursAgo = now - (4 * 60 * 60 * 1000);

    const sortedData = sgvData
        .filter(v => {
            let ts = v.date || v.mills || 0;
            if (isNaN(ts)) ts = new Date(ts).getTime();
            return ts >= fourHoursAgo;
        })
        .sort((a, b) => {
            let tsA = a.date || a.mills || 0;
            let tsB = b.date || b.mills || 0;
            if (isNaN(tsA)) tsA = new Date(tsA).getTime();
            if (isNaN(tsB)) tsB = new Date(tsB).getTime();
            return tsA - tsB;
        });

    const labels = sortedData.map(v => {
        let ts = v.date || v.mills || 0;
        if (isNaN(ts)) ts = new Date(ts).getTime();
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    const values = sortedData.map(v => v.sgv);

    // v15: Calculate historical IOB for the chart points
    let local = JSON.parse(localStorage.getItem('dm1_history') || '[]');
    let allInjections = [...local, ...jugglucoTreatments].filter(t => t.dose > 0);

    const iobValues = sortedData.map(v => {
        let ts = v.date || v.mills || 0;
        if (isNaN(ts)) ts = new Date(ts).getTime();

        let totalIOB = 0;
        allInjections.forEach(inj => {
            const ageMins = (ts - inj.timestamp) / 60000;
            if (ageMins > 0 && ageMins < 240) {
                totalIOB += calculateIOB(inj.dose, ageMins);
            }
        });
        return parseFloat(totalIOB.toFixed(2));
    });

    // v14.1+: Multicolor Segmented Line
    const getSgvColor = (val) => {
        if (val < 70) return '#ef4444'; // Rojo (Bajo)
        if (val <= 180) return '#10b981'; // Verde (Rango)
        return '#f59e0b'; // Naranja (Alto)
    };

    glucoseChart.data.labels = labels;
    glucoseChart.data.datasets[0].data = values;
    glucoseChart.data.datasets[1].data = iobValues;

    // Colores por segmento (Chart.js 3.0+)
    glucoseChart.data.datasets[0].segment = {
        borderColor: ctx => {
            const val = ctx.p0.parsed.y || ctx.p1.parsed.y;
            return getSgvColor(val);
        }
    };

    // Colores de los puntos con borde para que resalten
    glucoseChart.data.datasets[0].pointBackgroundColor = values.map(v => getSgvColor(v));
    glucoseChart.data.datasets[0].pointBorderColor = values.map(v => getSgvColor(v));

    glucoseChart.update();
}

async function fetchTreatments() {
    if (!USER_CONFIG.XDRIP_URL) return;
    try {
        const r = await fetch(`${USER_CONFIG.XDRIP_URL}/treatments.json?count=50`);
        const d = await r.json();
        if (!d) return;

        jugglucoTreatments = d.map(t => {
            let ts = t.date || t.timestamp || (t.created_at ? new Date(t.created_at).getTime() : Date.now());
            if (isNaN(ts)) ts = new Date(ts).getTime();
            const dObj = new Date(ts);
            return {
                timestamp: ts,
                food: t.notes || (t.carbs ? "Carbos" : (t.insulin ? "Insulina" : "Trato.")),
                carbs: parseFloat(t.carbs) || 0,
                dose: parseFloat(t.insulin) || 0,
                timeStr: dObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                dateStr: dObj.toLocaleDateString(),
                type: 'Juggluco'
            };
        });
    } catch (e) { console.error("Error T:", e); }
}

function calculateIOB(dose, ageMins) {
    if (ageMins <= 0) return dose;
    if (ageMins >= 240) return 0; // 4 horas duración

    // Modelo de decaimiento parabólico (Fórmula simplificada farmacocinética)
    // IOB = dose * (1 - (age / duration)^2) -> No, mejor una curva sigmoide o bilineal
    // Usaremos el modelo de decaimiento lineal de 4h para máxima claridad
    return Math.max(0, dose * (1 - (ageMins / 240)));
}

function calculateStats() {
    let iob = 0;
    const now = Date.now();
    const inicioHoy = new Date().setHours(0, 0, 0, 0);

    let local = JSON.parse(localStorage.getItem('dm1_history') || '[]');
    let all = [...local, ...jugglucoTreatments].sort((a, b) => b.timestamp - a.timestamp);

    const hoyDosis = all.filter(t => t.dose > 0 && t.timestamp >= inicioHoy);
    if (hoyDosis.length > 0) {
        lastInjection.dose = hoyDosis[0].dose;
        lastInjection.time = hoyDosis[0].timeStr || hoyDosis[0].date;
    }

    all.forEach(t => {
        if (t.dose > 0) {
            const ageMins = (now - t.timestamp) / 60000;
            if (ageMins > 0 && ageMins < 240) {
                iob += calculateIOB(t.dose, ageMins);
            }
        }
    });

    const iobVal = document.querySelector('.stat-value');
    if (iobVal) iobVal.textContent = `${iob.toFixed(1)} U`;
}

function renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;

    let local = JSON.parse(localStorage.getItem('dm1_history') || '[]');
    let combined = [...local, ...jugglucoTreatments].sort((a, b) => b.timestamp - a.timestamp);

    if (combined.length === 0) {
        list.innerHTML = '<li style="text-align:center; padding: 2rem; opacity: 0.5;">Sin registros</li>';
        return;
    }

    const inicioHoy = new Date().setHours(0, 0, 0, 0);
    let h_carbs = 0, h_ins = 0;

    list.innerHTML = combined.slice(0, 40).map(i => {
        if (i.timestamp >= inicioHoy) {
            h_carbs += i.carbs;
            h_ins += (i.dose || 0);
        }
        const isInsulin = i.dose > 0 && i.carbs === 0;
        const time = i.timeStr || i.date;
        const dayPrefix = (new Date(i.timestamp).setHours(0, 0, 0, 0) === inicioHoy) ? "" : i.dateStr + " ";

        return `
            <li class="hist-card ${isInsulin ? 'hist-card-insulin' : 'hist-card-food'}">
                <div class="hist-main">
                    <span class="hist-icon">${isInsulin ? '💉' : '🍽️'}</span>
                    <div class="hist-details">
                        <span class="hist-food">${i.food}</span>
                        <span class="hist-time">${dayPrefix}${time} ${i.type === 'Juggluco' ? '• J' : ''}</span>
                    </div>
                </div>
                <div class="hist-values">
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${i.type !== 'Juggluco' ? `<button onclick="deleteRecord(${i.timestamp})" class="btn-delete" title="Borrar">🗑️</button>` : ''}
                        <div style="text-align:right">
                            <span class="hist-amount">${isInsulin ? i.dose + 'U' : i.carbs + 'g'}</span>
                            ${!isInsulin && i.dose > 0 ? `<span class="hist-dose-mini">${i.dose}U</span>` : ''}
                        </div>
                    </div>
                </div>
            </li>`;
    }).join('');

    if (document.getElementById('day-carbs')) document.getElementById('day-carbs').textContent = Math.round(h_carbs);
    if (document.getElementById('day-insulin')) document.getElementById('day-insulin').textContent = h_ins.toFixed(1);
}

function saveRecord() {
    const fullDose = parseFloat(document.getElementById('suggested-dose').textContent) || 0;
    const isPizza = document.getElementById('pizza-mode').checked;

    // v15: FAP Extension Calculation
    const fat = parseInt(document.getElementById('res-fat').textContent) || 0;
    const prot = parseInt(document.getElementById('res-protein').textContent) || 0;
    const ugp = (fat * 9 + prot * 4) / 100;

    let doseNow = fullDose;
    if (isPizza && fullDose > 0) {
        doseNow = fullDose / 2;

        // Determinar horas de extensión según algoritmo de Varsovia
        let extHours = 3;
        if (ugp >= 3) extHours = 8;
        else if (ugp >= 2) extHours = 5;
        else if (ugp >= 1) extHours = 3;

        alert(`🍕 MODO PIZZA/FAP\n\nTotal: ${fullDose} UI\n👉 Inyecta ${doseNow} UI ahora.\n🔔 Te avisaré en ${extHours} horas para las ${doseNow} UI restantes (por ${ugp.toFixed(1)} UGP).`);

        // Guardar recordatorio persistente
        let reminders = JSON.parse(localStorage.getItem('dm1_reminders') || '[]');
        reminders.push({
            time: Date.now() + (extHours * 3600000),
            message: `🔔 RECORDATORIO FAP: Inyectar 2da dosis (${doseNow} UI) para cubrir grasas/proteínas de la comida previa.`,
            shown: false
        });
        localStorage.setItem('dm1_reminders', JSON.stringify(reminders));
    }

    const record = {
        timestamp: Date.now(),
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        dateStr: new Date().toLocaleDateString(),
        food: (isPizza ? "🍕 " : "") + (document.getElementById('food-description').value || "Comida"),
        carbs: parseInt(document.getElementById('res-carbs').textContent) || 0,
        dose: doseNow,
        type: 'App'
    };

    let h = JSON.parse(localStorage.getItem('dm1_history') || '[]');
    h.unshift(record); localStorage.setItem('dm1_history', JSON.stringify(h.slice(0, 100)));

    refreshDashboardData();
    document.querySelector('[data-view="dashboard"]').click();
}

function deleteRecord(ts) {
    if (!confirm("¿Borrar este registro?")) return;
    let h = JSON.parse(localStorage.getItem('dm1_history') || '[]');
    h = h.filter(r => r.timestamp !== ts);
    localStorage.setItem('dm1_history', JSON.stringify(h));
    refreshDashboardData();
}

function checkPizzaReminders() {
    let reminders = JSON.parse(localStorage.getItem('dm1_reminders') || '[]');
    const now = Date.now();
    let updated = false;

    reminders.forEach(r => {
        if (!r.shown && now >= r.time) {
            alert(r.message);
            r.shown = true;
            updated = true;
        }
    });

    if (updated) {
        reminders = reminders.filter(r => !r.shown);
        localStorage.setItem('dm1_reminders', JSON.stringify(reminders));
    }
}

async function analyzeFood(extraPrompt = "") {
    const desc = document.getElementById('food-description');
    const btn = document.getElementById('analyze-btn');
    const fileInput = document.getElementById('food-photo');
    const qPanel = document.getElementById('ai-question-panel');
    btn.disabled = true; btn.textContent = "Analizando...";
    qPanel.classList.add('hidden');
    let photo = fileInput.files[0];
    if (photo && !extraPrompt) photo = await resizeImage(photo, 1024);
    try {
        const r = await callGeminiAI(desc.value + (extraPrompt ? ` (Aclaración: ${extraPrompt})` : ""), photo, USER_CONFIG.GEMINI_KEY);
        if (r.question) {
            document.getElementById('ai-question-text').textContent = r.question;
            qPanel.classList.remove('hidden');
            document.getElementById('results-panel').classList.remove('hidden');
        } else {
            if (r.food_name) desc.value = r.food_name;
            applyResults(r);
        }
    } catch (e) { alert("Error: " + e.message); }
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

    // v15: Fat & Protein
    const fat = r.fat || 0;
    const protein = r.protein || 0;
    document.getElementById('res-fat').textContent = `${fat}g`;
    document.getElementById('res-protein').textContent = `${protein}g`;

    // Sugerencia FAP
    const ugp = (fat * 9 + protein * 4) / 100;
    const fapHint = document.getElementById('fap-hint');
    const pizzaCheck = document.getElementById('pizza-mode');
    if (ugp >= 1) {
        if (fapHint) {
            fapHint.style.display = 'block';
            fapHint.textContent = `💡 Detectado ${ugp.toFixed(1)} UGP. Se recomienda Modo Pizza/FAP (${Math.round(ugp * 10)}g extra carb eq).`;
        }
        if (pizzaCheck) pizzaCheck.checked = true;
    } else {
        if (fapHint) fapHint.style.display = 'none';
        if (pizzaCheck) pizzaCheck.checked = false;
    }

    document.getElementById('results-panel').classList.remove('hidden');
    updateDoseDisplay();
}

async function callGeminiAI(txt, file, key) {
    const model = USER_CONFIG.CUSTOM_MODEL_ID || "gemini-flash-latest";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    let p = []; if (txt && !txt.startsWith("Identificando")) p.push({ text: `Contexto: ${txt}` });
    if (file) p.push({ inline_data: { mime_type: "image/jpeg", data: (await fileToBase64(file)).split(',')[1] } });

    p.push({
        text: `Analiza carbohidratos netos, IG, grasas y proteínas para paciente con DM1.
    1. Identifica el nombre del plato brevemente en 'food_name'.
    2. Si hay duda (cantidades o tipo), pregunta en 'question'.
    3. Devuelve gramos de grasas en 'fat' y proteínas en 'protein'.
     JSON: {"food_name": "nombre", "carbs": num, "gi": "Alto/Medio/Bajo", "fat": num, "protein": num, "question": "pregunta o null"}` });

    const r = await fetch(url, { method: 'POST', body: JSON.stringify({ contents: [{ parts: p }] }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error?.message);
    return JSON.parse(d.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim());
}

function loadSettings() {
    const s = localStorage.getItem('dm1_config');
    if (s) {
        USER_CONFIG = { ...USER_CONFIG, ...JSON.parse(s) };
        document.getElementById('cfg-icr').value = USER_CONFIG.ICR;
        document.getElementById('cfg-isf').value = USER_CONFIG.ISF;
        document.getElementById('cfg-xdrip').value = USER_CONFIG.XDRIP_URL;
        document.getElementById('cfg-gemini').value = USER_CONFIG.GEMINI_KEY;

        // v15: Load per-period ratios
        if (USER_CONFIG.RATIOS) {
            for (const p in USER_CONFIG.RATIOS) {
                const elIcr = document.getElementById(`cfg-icr-${p.toLowerCase()}`);
                const elIsf = document.getElementById(`cfg-isf-${p.toLowerCase()}`);
                if (elIcr) elIcr.value = USER_CONFIG.RATIOS[p].icr;
                if (elIsf) elIsf.value = USER_CONFIG.RATIOS[p].isf;
            }
        }
    }
}

function saveSettings() {
    USER_CONFIG.ICR = parseFloat(document.getElementById('cfg-icr').value);
    USER_CONFIG.ISF = parseFloat(document.getElementById('cfg-isf').value);

    // v15: Save per-period ratios
    for (const p in USER_CONFIG.RATIOS) {
        const elIcr = document.getElementById(`cfg-icr-${p.toLowerCase()}`);
        const elIsf = document.getElementById(`cfg-isf-${p.toLowerCase()}`);
        if (elIcr) USER_CONFIG.RATIOS[p].icr = parseFloat(elIcr.value);
        if (elIsf) USER_CONFIG.RATIOS[p].isf = parseFloat(elIsf.value);
    }

    USER_CONFIG.XDRIP_URL = document.getElementById('cfg-xdrip').value;
    USER_CONFIG.GEMINI_KEY = document.getElementById('cfg-gemini').value.trim();
    saveSettingsToLocal(); alert("✓ Guardado"); refreshDashboardData();
}

function getCurrentRatios() {
    const hour = new Date().getHours();
    const r = USER_CONFIG.RATIOS;
    if (hour >= r.NIGHT.start || hour < r.BREAKFAST.start) return r.NIGHT;
    if (hour >= r.DINNER.start) return r.DINNER;
    if (hour >= r.LUNCH.start) return r.LUNCH;
    return r.BREAKFAST;
}

const CLINICAL_CONTEXT = `
PACIENTE: Juan, 44 años, DM1 (41 años de evolución). Peso ~65kg.
BASAL: Tresiba 32 UI (Mañana). 
RATIOS: 1u:10g (Teórico, pero insuficiente en tardes).
REGLAS CRÍTICAS:
- Pre-bolus: 15-20 min siempre.
- Rescate: CH = (100-G)/4.
- IOB y Deporte: Prohibido salir con IOB > 0.5u sin 15g CH de seguridad.
- Sensibilidad Ejercicio: "Efecto Esponja" 24h tras MTB o caminata >5km. Reducir bolos -50%.
- Alimentos: 
  * Arroz/Pasta Fría = -30% dosis (Almidón resistente).
  * Alcohol (Vino/Cerveza) = Hipoglucemiante tardío.
  * Pizza/Grasa = Pico a las 3-4h.
PERSONALIDAD: Sé crítico, quirúrgico, directo y honesto. Sin "sugar-coating". Si el paciente comete un error (falla pre-bolus, ignora IOB en deporte), señálalo con dureza. Prioriza precisión clínica.
`;

function openModal(title, html) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = typeof html === 'string' ? html.replace(/\n/g, '<br>') : html;
    document.getElementById('ai-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('ai-modal').classList.add('hidden');
}

async function getExerciseAdvice() {
    const btn = document.getElementById('exercise-advice-btn');
    const originalText = btn.textContent;
    btn.disabled = true; btn.textContent = "...";

    try {
        const g = document.getElementById('display-glucose').textContent || '100';
        const trend = document.getElementById('display-trend').textContent || '→';
        const iob = document.querySelector('.stat-card .stat-value').textContent || '0.0';
        const time = new Date().toLocaleTimeString('es-ES', { hour: '2d-digit', minute: '2d-digit' });

        const prompt = `${CLINICAL_CONTEXT}\n
        ESTADO ACTUAL (${time}):
        - Glucemia: ${g} mg/dL.
        - Tendencia: ${trend}.
        - Insulina Activa (IOB): ${iob}.
        - Modo Deporte: ${USER_CONFIG.SPORT_TYPE}.

        TAREA: Actúa como deportólogo experto. Indica si es seguro empezar, si requiere carbohidratos previos (menciona la Manzana+Nueces si es tarde) y da ejemplos prácticos de comida según el estado actual. Sé breve y directo.`;

        const advice = await callGemini(prompt);
        openModal("🍎 Consejo Pre-Entreno", advice);
    } catch (e) {
        alert("Error: " + e.message);
    }
    btn.disabled = false; btn.textContent = originalText;
}

async function consultAICoach() {
    const userQuestion = prompt("👨‍⚕️ COACH EXPERTO\n\n¿Tienes alguna duda específica sobre tu entrenamiento o glucemia?\n(Deja vacío para un análisis general)");

    const btn = document.getElementById('ai-coach-btn');
    const originalText = btn.textContent;
    btn.disabled = true; btn.textContent = "Coach analizando...";

    try {
        const history = JSON.parse(localStorage.getItem('dm1_history') || '[]');
        const stats = JSON.stringify(glucoseStats);
        const g = document.getElementById('display-glucose').textContent || '100';
        const trend = document.getElementById('display-trend').textContent || '→';
        const iob = document.querySelector('.stat-card .stat-value').textContent || '0.0';

        const context = history.slice(0, 30).map(h => `${h.dateStr} ${h.date}: ${h.food} (${h.carbs}g HC, ${h.dose}U)`).join('\n');

        let promptText = `${CLINICAL_CONTEXT}\n
        HISTORIAL RECIENTE:\n${context}\n
        ESTADO ACTUAL: Glucemia ${g} mg/dL, Tendencia ${trend}, IOB ${iob}. TIR Reciente: ${glucoseStats.tir}%.\n\n`;

        if (userQuestion) {
            promptText += `EL PACIENTE PREGUNTA: "${userQuestion}"\nResponde con rigor científico, sin rodeos, analizando si su duda revela un fallo de gestión.`;
        } else {
            promptText += `Analiza con dureza los patrones recientes. Si ves picos de tarde (>180), explícale por qué está fallando (falta de pre-bolus o subestimación de HC). Da 3 órdenes directas para hoy.`;
        }

        const advice = await callGemini(promptText);
        openModal("🩺 Análisis del Coach", advice);
    } catch (e) {
        alert("Error Coach: " + e.message);
    }
    btn.disabled = false; btn.textContent = originalText;
}

async function callGemini(promptText) {
    const body = {
        contents: [{ parts: [{ text: promptText }] }]
    };
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${USER_CONFIG.CUSTOM_MODEL_ID || 'gemini-flash-latest'}:generateContent?key=${USER_CONFIG.GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const d = await r.json();
    if (!d.candidates || d.candidates.length === 0) {
        if (d.error) throw new Error(d.error.message);
        throw new Error("La IA no respondió. Revisa tu clave API.");
    }
    return d.candidates[0].content.parts[0].text;
}

function saveSettingsToLocal() { localStorage.setItem('dm1_config', JSON.stringify(USER_CONFIG)); }

function initChart() {
    const ctx = document.getElementById('glucose-chart')?.getContext('2d'); if (!ctx) return;
    glucoseChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['-4h', '-3h', '-2h', '-1h', '0'],
            datasets: [
                {
                    label: 'SGV',
                    data: [110, 130, 140, 120, 100],
                    borderColor: '#3b82f6',
                    tension: 0.4,
                    fill: false,
                    pointRadius: 2,
                    yAxisID: 'y'
                },
                {
                    label: 'IOB',
                    data: [0, 0, 0, 0, 0],
                    borderColor: 'rgba(139, 92, 246, 0.5)',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { display: false }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    min: 0,
                    max: 15, // Max 15U IOB visible por defecto
                    grid: { display: false },
                    ticks: { color: 'rgba(139, 92, 246, 0.8)', font: { size: 8 } }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
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
function testKey(i, b, l) { alert("Test IA"); }
function testGlucoseConnection() { alert("Test G"); }
function listPossibleModels() { alert("List M"); }

function showTIRDetails() {
    alert(`📊 RANGO (TIR)\n\nEn Rango: ${glucoseStats.tir}%\nBajo (<70): ${glucoseStats.low}%\nAlto (>180): ${glucoseStats.high}%`);
}

function showIOBDetails() {
    alert(`💉 INSULINA ACTIVA (IOB)\n\nTotal a bordo: ${document.querySelector('.stat-value').textContent}\n\nEste cálculo estima la insulina que sigue actuando en tu cuerpo basándose en una duración de 4 horas.`);
}
