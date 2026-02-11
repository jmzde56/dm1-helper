// Parámetros y Estado Global
let USER_CONFIG = {
    ICR: 20,
    ISF: 50,
    TARGET_GLUCOSE: 100,
    XDRIP_URL: ''
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
    { name: 'empanada', carbs: 25, gi: 'Medio' }
];

let glucoseChart = null;

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initChart();
    setupNavigation();
    setupEventListeners();
    renderHistory();

    if (USER_CONFIG.XDRIP_URL) {
        fetchxDripGlucose();
        // Auto-refresh cada 5 minutos
        setInterval(fetchxDripGlucose, 300000);
    }
});

// Navegación SPA
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetView = item.getAttribute('data-view');

            // Update Nav UI
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Switch Views
            views.forEach(view => {
                view.classList.remove('active');
                if (view.id === `view-${targetView}`) {
                    view.classList.add('active');
                }
            });

            // Extra logic per view
            if (targetView === 'dashboard' && glucoseChart) {
                glucoseChart.update();
            }
        });
    });
}

function setupEventListeners() {
    // Análisis de comida
    document.getElementById('analyze-btn').addEventListener('click', analyzeFood);
    document.getElementById('save-btn').addEventListener('click', saveRecord);

    // Cámara
    const cameraTrigger = document.getElementById('camera-trigger');
    const fileInput = document.getElementById('food-photo');
    cameraTrigger.addEventListener('click', () => fileInput.click());

    // Ajustes
    document.getElementById('save-settings').addEventListener('click', saveSettings);

    // Live Dose Update
    document.getElementById('current-glucose').addEventListener('input', updateDoseDisplay);
}

// Lógica de Negocio
function analyzeFood() {
    const description = document.getElementById('food-description').value.toLowerCase();
    const resultsPanel = document.getElementById('results-panel');

    if (!description) return;

    let totalCarbs = 0;
    let mainGI = 'Bajo';

    FOOD_DATABASE.forEach(food => {
        if (description.includes(food.name)) {
            totalCarbs += food.carbs;
            if (food.gi === 'Alto') mainGI = 'Alto';
            else if (food.gi === 'Medio' && mainGI === 'Bajo') mainGI = 'Medio';
        }
    });

    if (totalCarbs === 0) {
        totalCarbs = 30;
        mainGI = 'Medio';
    }

    document.getElementById('res-carbs').textContent = `${totalCarbs}g`;
    document.getElementById('res-gi').textContent = mainGI;
    resultsPanel.classList.remove('hidden');

    updateDoseDisplay();
}

function updateDoseDisplay() {
    const carbs = parseInt(document.getElementById('res-carbs').textContent) || 0;
    const currentG = parseInt(document.getElementById('current-glucose').value) || 100;

    const carbsDose = carbs / USER_CONFIG.ICR;
    const correctionDose = (currentG - USER_CONFIG.TARGET_GLUCOSE) / USER_CONFIG.ISF;

    const totalDose = Math.max(0, carbsDose + correctionDose);
    document.getElementById('suggested-dose').textContent = totalDose.toFixed(1);
}

// xDrip Integration
async function fetchxDripGlucose() {
    if (!USER_CONFIG.XDRIP_URL) return;

    try {
        const response = await fetch(`${USER_CONFIG.XDRIP_URL}/sgv.json?count=1`);
        const data = await response.json();

        if (data && data.length > 0) {
            const entry = data[0];
            const glucose = entry.sgv;
            const direction = entry.direction || '';

            // Actualizar UI
            document.getElementById('display-glucose').textContent = glucose;
            document.getElementById('display-trend').textContent = getTrendIcon(direction);
            document.getElementById('current-glucose').value = glucose;

            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            document.getElementById('last-update').textContent = `Actualizado: ${time}`;

            updateDoseDisplay();
        }
    } catch (e) {
        console.error("xDrip Error:", e);
    }
}

function getTrendIcon(direction) {
    const directions = {
        'DoubleUp': '⇈', 'SingleUp': '↑', 'FortyFiveUp': '↗',
        'Flat': '→', 'FortyFiveDown': '↘', 'SingleDown': '↓', 'DoubleDown': '⇊'
    };
    return directions[direction] || '';
}

// Storage & Configuration
function loadSettings() {
    const saved = localStorage.getItem('dm1_config');
    if (saved) {
        USER_CONFIG = JSON.parse(saved);
        document.getElementById('cfg-icr').value = USER_CONFIG.ICR;
        document.getElementById('cfg-isf').value = USER_CONFIG.ISF;
        document.getElementById('cfg-target').value = USER_CONFIG.TARGET_GLUCOSE;
        document.getElementById('cfg-xdrip').value = USER_CONFIG.XDRIP_URL;
    }
}

function saveSettings() {
    USER_CONFIG.ICR = parseFloat(document.getElementById('cfg-icr').value) || 20;
    USER_CONFIG.ISF = parseFloat(document.getElementById('cfg-isf').value) || 50;
    USER_CONFIG.TARGET_GLUCOSE = parseFloat(document.getElementById('cfg-target').value) || 100;
    USER_CONFIG.XDRIP_URL = document.getElementById('cfg-xdrip').value;

    localStorage.setItem('dm1_config', JSON.stringify(USER_CONFIG));
    alert("✓ Ajustes guardados");
    if (USER_CONFIG.XDRIP_URL) fetchxDripGlucose();
}

function saveRecord() {
    const food = document.getElementById('food-description').value;
    const dose = document.getElementById('suggested-dose').textContent;
    const gi = document.getElementById('res-gi').textContent;

    const record = {
        id: Date.now(),
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        food, dose, gi
    };

    let history = JSON.parse(localStorage.getItem('dm1_history') || '[]');
    history.unshift(record);
    localStorage.setItem('dm1_history', JSON.stringify(history.slice(0, 15)));

    renderHistory();
    updateChart(gi);

    // Regresar al dashboard
    document.querySelector('[data-view="dashboard"]').click();
}

function renderHistory() {
    const historyList = document.getElementById('history-list');
    const history = JSON.parse(localStorage.getItem('dm1_history') || '[]');

    if (history.length === 0) {
        historyList.innerHTML = '<li class="subtitle" style="text-align:center; padding: 2rem;">No hay registros</li>';
        return;
    }

    historyList.innerHTML = history.map(item => `
        <li class="history-item">
            <div>
                <strong>${item.food}</strong><br>
                <span class="subtitle">${item.date}</span>
            </div>
            <div style="text-align: right">
                <span style="color: var(--accent-blue); font-weight: 700;">${item.dose} U</span><br>
                <span class="subtitle">IG ${item.gi}</span>
            </div>
        </li>
    `).join('');
}

// Chart.js
function initChart() {
    const ctx = document.getElementById('glucose-chart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.01)');

    glucoseChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['0h', '1h', '2h', '3h', '4h'],
            datasets: [{
                data: [100, 100, 100, 100, 100],
                borderColor: '#3b82f6',
                borderWidth: 3,
                backgroundColor: gradient,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { display: false, min: 40, max: 250 },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 10 } }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function updateChart(gi) {
    const currentG = parseInt(document.getElementById('current-glucose').value) || 100;
    let curve = [];

    if (gi === 'Alto') curve = [currentG, currentG + 80, currentG + 40, currentG + 10, currentG];
    else if (gi === 'Medio') curve = [currentG, currentG + 40, currentG + 50, currentG + 20, currentG];
    else curve = [currentG, currentG + 15, currentG + 20, currentG + 10, currentG];

    glucoseChart.data.datasets[0].data = curve;
    glucoseChart.update();
}
