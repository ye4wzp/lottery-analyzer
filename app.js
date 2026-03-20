/**
 * 彩票数据分析大师 - 主控制器 v3
 * Supports 7 prediction strategies, multi-bet, filter, backtest, history table, countdown, theme
 */

let currentType = 'ssq';
let currentPredictions = {};
let currentFilter = null;
let historyPage = 1;
const HISTORY_PER_PAGE = 20;
let historySortDesc = true;
let countdownInterval = null;

// ============= INITIALIZATION =============
document.addEventListener('DOMContentLoaded', () => {
    createBackgroundParticles();
    setupEventListeners();
    loadTheme();
    updateAll();
    autoLoadAPIData();
    startCountdown();
});

async function autoLoadAPIData() {
    const status = document.getElementById('dataSourceLabel');
    status.textContent = '加载中...';

    try {
        const result = await DataAPI.loadData(currentType, 100);
        if (result.source === 'api' || result.source === 'cache') {
            document.getElementById('dataStatusDot').classList.add('live');
            const label = result.source === 'cache' ? '缓存' : 'API';
            status.textContent = `${label} · ${result.count}期`;
            updateAll();
        } else {
            document.getElementById('dataStatusDot').classList.remove('live');
            status.textContent = '模拟数据';
        }
    } catch (e) {
        document.getElementById('dataStatusDot').classList.remove('live');
        status.textContent = '模拟数据';
    }
}

function createBackgroundParticles() {
    const container = document.getElementById('bgParticles');
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 15 + 's';
        particle.style.animationDuration = (8 + Math.random() * 12) + 's';
        particle.style.width = (2 + Math.random() * 4) + 'px';
        particle.style.height = particle.style.width;
        const colors = [
            'rgba(168, 85, 247, 0.3)',
            'rgba(236, 72, 153, 0.2)',
            'rgba(59, 130, 246, 0.2)',
            'rgba(42, 157, 143, 0.2)'
        ];
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        container.appendChild(particle);
    }
}

function setupEventListeners() {
    // Lottery type nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentType = btn.dataset.type;
            currentFilter = null;
            historyPage = 1;
            updateAll();
            autoLoadAPIData();
            startCountdown();
        });
    });

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const target = document.getElementById('content' + capitalize(btn.dataset.tab));
            if (target) target.classList.add('active');
            // Lazy-render history table
            if (btn.dataset.tab === 'history') renderHistoryTable();
        });
    });

    // Trend line toggle
    document.getElementById('showTrendLines')?.addEventListener('change', () => {
        const draws = LOTTERY_DATA[currentType];
        const config = LOTTERY_CONFIG[currentType];
        renderTrendChart(draws, config);
    });

    // Export dropdown
    const exportBtn = document.getElementById('btnExport');
    const exportMenu = document.getElementById('exportMenu');
    if (exportBtn && exportMenu) {
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportMenu.classList.toggle('show');
        });
        document.addEventListener('click', () => {
            exportMenu.classList.remove('show');
        });
    }

    // History search
    document.getElementById('historySearch')?.addEventListener('input', (e) => {
        historyPage = 1;
        renderHistoryTable();
    });

    // History sort
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            historySortDesc = !historySortDesc;
            th.textContent = `期号 ${historySortDesc ? '▾' : '▴'}`;
            renderHistoryTable();
        });
    });
}

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// ============= UPDATE ALL VIEWS =============
function updateAll() {
    const draws = LOTTERY_DATA[currentType];
    const config = LOTTERY_CONFIG[currentType];

    updateLabels(config);
    updateStats(draws, config);
    updateLatestDraw(draws, config);
    updateFrequencyTab(draws, config);
    updateTrendTab(draws, config);
    updateMissingTab(draws, config);
    updatePatternTab(draws, config);
    generateAllPredictions();
}

// ============= DYNAMIC LABELS =============
function updateLabels(config) {
    document.querySelectorAll('.main-name-label').forEach(el => {
        el.textContent = config.mainName;
    });
    document.querySelectorAll('.bonus-name-label').forEach(el => {
        el.textContent = config.bonusName || '特别号';
    });

    const bonusCard = document.getElementById('bonusChartCard');
    if (bonusCard) {
        bonusCard.style.display = config.bonusCount > 0 ? '' : 'none';
    }
}

// ============= STATS OVERVIEW =============
function updateStats(draws, config) {
    document.getElementById('statTotalDraws').textContent = draws.length;

    const hotList = Analysis.hotNumbers(draws, config.mainRange, 'main', 50, 1, config);
    document.getElementById('statHotNumber').textContent = hotList.length ? hotList[0].num : '-';

    const coldList = Analysis.coldNumbers(draws, config.mainRange, 'main', 50, 1, config);
    document.getElementById('statColdNumber').textContent = coldList.length ? coldList[0].num : '-';

    const sums = Analysis.sumValues(draws, 'main', draws.length);
    const avgSum = sums.length > 0 ? sums.reduce((a, b) => a + b.sum, 0) / sums.length : 0;
    document.getElementById('statAvgSum').textContent = Math.round(avgSum);
}

// ============= LATEST DRAW =============
function updateLatestDraw(draws, config) {
    const latest = draws[draws.length - 1];
    document.getElementById('latestDrawInfo').textContent = `第 ${latest.period} 期 · ${latest.date}`;

    const container = document.getElementById('latestNumbers');
    container.innerHTML = '';

    latest.main.forEach((num, i) => {
        const ball = document.createElement('span');
        ball.className = `ball ball-${config.mainColor}`;
        ball.textContent = num;
        ball.style.animationDelay = `${i * 0.08}s`;
        container.appendChild(ball);
    });

    if (config.bonusCount > 0 && latest.bonus.length > 0) {
        const sep = document.createElement('span');
        sep.className = 'separator';
        container.appendChild(sep);

        latest.bonus.forEach((num, i) => {
            const ball = document.createElement('span');
            ball.className = `ball ball-${config.bonusColor}`;
            ball.textContent = num;
            ball.style.animationDelay = `${(latest.main.length + i) * 0.08}s`;
            container.appendChild(ball);
        });
    }
}

// ============= FREQUENCY TAB =============
function updateFrequencyTab(draws, config) {
    renderMainFreqChart(draws, config);
    if (config.bonusCount > 0) {
        renderBonusFreqChart(draws, config);
    }
    renderHotColdLists(draws, config);
}

function renderHotColdLists(draws, config) {
    const hotContainer = document.getElementById('hotNumbers');
    const coldContainer = document.getElementById('coldNumbers');

    const hot = Analysis.hotNumbers(draws, config.mainRange, 'main', 50, 10, config);
    const cold = Analysis.coldNumbers(draws, config.mainRange, 'main', 50, 10, config);

    hotContainer.innerHTML = hot.map(h => `
        <div class="number-item hot">
            <span class="ball ball-${config.mainColor}">${h.num}</span>
            <span class="count">${h.count}次</span>
        </div>
    `).join('');

    coldContainer.innerHTML = cold.map(c => `
        <div class="number-item cold">
            <span class="ball ball-blue">${c.num}</span>
            <span class="count">${c.count}次</span>
        </div>
    `).join('');
}

// ============= TREND TAB =============
function updateTrendTab(draws, config) {
    renderTrendChart(draws, config);
    renderSumTrendChart(draws, config);
}

// ============= MISSING TAB =============
function updateMissingTab(draws, config) {
    const missing = Analysis.missingValues(draws, config.mainRange, 'main', config);
    const maxMissing = Math.max(...Object.values(missing), 1);
    const start = config.isDigit ? 0 : 1;

    const container = document.getElementById('missingHeatmap');
    container.innerHTML = '';

    for (let num = start; num <= config.mainRange; num++) {
        const val = missing[num] || 0;
        const level = Math.min(4, Math.floor(val / (maxMissing / 5)));

        const cell = document.createElement('div');
        cell.className = `heatmap-cell heat-${level}`;
        cell.innerHTML = `
            <span class="cell-num">${num}</span>
            <span class="cell-val">遗漏${val}</span>
        `;
        cell.title = `号码 ${num}: 已遗漏 ${val} 期`;
        container.appendChild(cell);
    }

    const bigMissing = Object.entries(missing)
        .map(([num, val]) => ({ num: parseInt(num), val }))
        .sort((a, b) => b.val - a.val)
        .slice(0, 10);

    document.getElementById('bigMissingNumbers').innerHTML = bigMissing.map(m => `
        <div class="number-item">
            <span class="ball ball-${config.mainColor}">${m.num}</span>
            <span class="count">遗漏${m.val}期</span>
        </div>
    `).join('');

    const consecutive = Analysis.consecutiveNumbers(draws, 'main', config);
    document.getElementById('consecutiveNumbers').innerHTML = consecutive.length > 0
        ? consecutive.slice(0, 8).map(c => `
            <div class="number-item">
                <span class="ball ball-${config.mainColor}">${c.num}</span>
                <span class="count">连出${c.streak}期</span>
            </div>
        `).join('')
        : '<p style="color: var(--text-muted); font-size: 13px;">当前无连续出现号码</p>';
}

// ============= PATTERN TAB =============
function updatePatternTab(draws, config) {
    renderOddEvenChart(draws, config);
    renderBigSmallChart(draws, config);
    renderSumDistChart(draws, config);
    renderSpanDistChart(draws, config);

    const zones = Analysis.zoneAnalysis(draws, config.mainRange, 'main', 50, 3, config);
    const zoneContainer = document.getElementById('zoneAnalysis');

    const zoneColors = ['#e63946', '#a855f7', '#2a9d8f', '#f4a261'];
    zoneContainer.innerHTML = zones.map((z, i) => `
        <div class="zone-card">
            <div class="zone-name">${z.name}</div>
            <div class="zone-value" style="color: ${zoneColors[i % zoneColors.length]}">${z.count}</div>
            <div class="zone-pct">占比 ${z.percentage}%</div>
        </div>
    `).join('');
}

// ============= PREDICTION (7 strategies × N bets) =============
const STRATEGY_METHODS = {
    hotcold: 'hotColdStrategy',
    trend: 'trendStrategy',
    balance: 'balanceStrategy',
    markov: 'markovStrategy',
    bayesian: 'bayesianStrategy',
    movingAvg: 'movingAvgStrategy',
    random: 'randomStrategy'
};

function generatePrediction(strategy) {
    const draws = LOTTERY_DATA[currentType];
    const config = LOTTERY_CONFIG[currentType];
    const method = STRATEGY_METHODS[strategy];
    if (!method || !Predictor[method]) return;

    const betCount = parseInt(document.getElementById('betCount')?.value || '1');
    const bets = [];

    for (let i = 0; i < betCount; i++) {
        let result = strategy === 'random'
            ? Predictor[method](config)
            : Predictor[method](draws, config);

        if (currentFilter) {
            result = Predictor.applyFilter(result, config, currentFilter);
        }
        bets.push(result);
    }

    currentPredictions[strategy] = bets;

    const containerId = 'predict' + capitalize(strategy === 'movingAvg' ? 'movingAvg' : strategy);
    const idMap = {
        hotcold: 'predictHotCold',
        trend: 'predictTrend',
        balance: 'predictBalance',
        markov: 'predictMarkov',
        bayesian: 'predictBayesian',
        movingAvg: 'predictMovingAvg',
        random: 'predictRandom'
    };

    renderMultiBet(idMap[strategy], bets, config);
}

function generateAllPredictions() {
    Object.keys(STRATEGY_METHODS).forEach(s => generatePrediction(s));
}

function renderMultiBet(containerId, bets, config) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    bets.forEach((result, idx) => {
        const row = document.createElement('div');
        row.className = 'bet-row';
        if (bets.length > 1) {
            const label = document.createElement('span');
            label.className = 'bet-label';
            label.textContent = `第${idx + 1}注`;
            row.appendChild(label);
        }

        const nums = document.createElement('span');
        nums.className = 'bet-numbers';

        result.main.forEach(num => {
            const ball = document.createElement('span');
            ball.className = `ball ball-sm ball-${config.mainColor}`;
            ball.textContent = num;
            nums.appendChild(ball);
        });

        if (config.bonusCount > 0 && result.bonus.length > 0) {
            const sep = document.createElement('span');
            sep.className = 'separator-sm';
            nums.appendChild(sep);
            result.bonus.forEach(num => {
                const ball = document.createElement('span');
                ball.className = `ball ball-sm ball-${config.bonusColor}`;
                ball.textContent = num;
                nums.appendChild(ball);
            });
        }

        row.appendChild(nums);
        container.appendChild(row);
    });
}

// ============= FILTER =============
function toggleFilter() {
    const body = document.getElementById('filterBody');
    const icon = document.getElementById('filterToggleIcon');
    const visible = body.style.display !== 'none';
    body.style.display = visible ? 'none' : 'block';
    icon.textContent = visible ? '▸' : '▾';
}

function applyFilter() {
    const lockedStr = document.getElementById('filterLocked').value.trim();
    const killedStr = document.getElementById('filterKilled').value.trim();

    const locked = lockedStr ? lockedStr.split(/[,，\s]+/).map(Number).filter(n => !isNaN(n)) : [];
    const killed = killedStr ? killedStr.split(/[,，\s]+/).map(Number).filter(n => !isNaN(n)) : [];

    currentFilter = (locked.length > 0 || killed.length > 0) ? { locked, killed } : null;
    generateAllPredictions();
}

// ============= BACKTEST =============
function toggleBacktest() {
    const body = document.getElementById('backtestBody');
    const icon = document.getElementById('backtestToggleIcon');
    const visible = body.style.display !== 'none';
    body.style.display = visible ? 'none' : 'block';
    icon.textContent = visible ? '▸' : '▾';
}

function runBacktest() {
    const testN = parseInt(document.getElementById('backtestPeriods').value);
    const draws = LOTTERY_DATA[currentType];
    const config = LOTTERY_CONFIG[currentType];

    const container = document.getElementById('backtestResults');
    container.innerHTML = '<p class="loading-text">⏳ 回测中，请稍候...</p>';

    setTimeout(() => {
        const bt = Backtester.run(draws, config, testN);
        if (bt.error) {
            container.innerHTML = `<p class="error-text">❌ ${bt.error}</p>`;
            return;
        }

        let html = `<div class="backtest-summary">
            <p>基于 ${bt.totalDraws} 期数据，回测最近 ${bt.testN} 期</p>
        </div>
        <table class="backtest-table">
            <thead><tr>
                <th>策略</th>
                <th>平均命中</th>
                <th>≥3个命中率</th>
                <th>最大命中</th>
            </tr></thead><tbody>`;

        Object.values(bt.results).forEach(r => {
            html += `<tr>
                <td>${r.name}</td>
                <td><strong>${r.avgHit}</strong></td>
                <td>${r.hit3plusPct}%</td>
                <td>${r.maxHit}</td>
            </tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }, 100);
}

// ============= NUMBER COMPARISON =============
function toggleCompare() {
    const body = document.getElementById('compareBody');
    const icon = document.getElementById('compareToggleIcon');
    const visible = body.style.display !== 'none';
    body.style.display = visible ? 'none' : 'block';
    icon.textContent = visible ? '▸' : '▾';
}

function runCompare() {
    const input = document.getElementById('compareInput').value.trim();
    const container = document.getElementById('compareResults');
    if (!input) { container.innerHTML = '<p class="error-text">请输入号码</p>'; return; }

    const userNums = input.split(/[,，\s]+/).map(Number).filter(n => !isNaN(n));
    const draws = LOTTERY_DATA[currentType];
    const config = LOTTERY_CONFIG[currentType];

    let totalHits = 0;
    let maxHit = 0;
    let maxHitPeriod = '';
    const hitDist = {};

    draws.forEach(d => {
        const hits = userNums.filter(n => (d.main || []).includes(n)).length;
        totalHits += hits;
        hitDist[hits] = (hitDist[hits] || 0) + 1;
        if (hits > maxHit) { maxHit = hits; maxHitPeriod = d.period; }
    });

    const avgHit = (totalHits / draws.length).toFixed(2);

    let html = `<div class="compare-result-card">
        <p>📌 你的号码：<strong>${userNums.join(', ')}</strong></p>
        <p>📊 平均每期命中：<strong>${avgHit}</strong> 个</p>
        <p>🏆 最多命中 <strong>${maxHit}</strong> 个（第 ${maxHitPeriod} 期）</p>
        <p>📈 命中分布：${Object.entries(hitDist).sort((a,b) => b[0]-a[0]).map(([h,c]) => `${h}个:${c}期`).join(' | ')}</p>
    </div>`;

    container.innerHTML = html;
}

// ============= HISTORY TABLE =============
function renderHistoryTable() {
    const draws = LOTTERY_DATA[currentType];
    const config = LOTTERY_CONFIG[currentType];
    const search = document.getElementById('historySearch')?.value.trim() || '';

    let filtered = draws;
    if (search) {
        filtered = draws.filter(d => d.period.includes(search) || d.date.includes(search));
    }

    // Sort
    const sorted = [...filtered];
    if (historySortDesc) sorted.reverse();

    // Paginate
    const totalPages = Math.ceil(sorted.length / HISTORY_PER_PAGE);
    if (historyPage > totalPages) historyPage = totalPages || 1;
    const start = (historyPage - 1) * HISTORY_PER_PAGE;
    const page = sorted.slice(start, start + HISTORY_PER_PAGE);

    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = page.map(d => {
        const mainHtml = d.main.map(n => `<span class="ball ball-sm ball-${config.mainColor}">${n}</span>`).join('');
        const bonusHtml = config.bonusCount > 0 && d.bonus.length > 0
            ? `<span class="separator-sm"></span>` + d.bonus.map(n => `<span class="ball ball-sm ball-${config.bonusColor}">${n}</span>`).join('')
            : '';
        const sum = d.main.reduce((a, b) => a + b, 0);
        const odds = d.main.filter(n => n % 2 === 1).length;
        const evens = d.main.length - odds;

        return `<tr>
            <td class="td-period">${d.period}</td>
            <td class="td-date">${d.date}</td>
            <td class="td-numbers">${mainHtml}${bonusHtml}</td>
            <td>${sum}</td>
            <td>${odds}:${evens}</td>
        </tr>`;
    }).join('');

    // Pagination
    const pag = document.getElementById('historyPagination');
    if (totalPages <= 1) { pag.innerHTML = ''; return; }

    let pagHtml = '';
    if (historyPage > 1) pagHtml += `<button onclick="goHistoryPage(${historyPage - 1})">◀</button>`;
    for (let p = Math.max(1, historyPage - 2); p <= Math.min(totalPages, historyPage + 2); p++) {
        pagHtml += `<button class="${p === historyPage ? 'active' : ''}" onclick="goHistoryPage(${p})">${p}</button>`;
    }
    if (historyPage < totalPages) pagHtml += `<button onclick="goHistoryPage(${historyPage + 1})">▶</button>`;
    pag.innerHTML = pagHtml;
}

function goHistoryPage(p) {
    historyPage = p;
    renderHistoryTable();
}

// ============= COUNTDOWN TIMER =============
function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}

function updateCountdown() {
    const config = LOTTERY_CONFIG[currentType];
    const badge = document.getElementById('countdownText');
    if (!badge) return;

    const now = new Date();
    const next = getNextDrawDate(config, now);
    const diff = next - now;

    if (diff <= 0) {
        badge.textContent = '开奖中';
        return;
    }

    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        badge.textContent = `${days}天 ${hours % 24}时`;
    } else {
        badge.textContent = `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
}

function getNextDrawDate(config, now) {
    const drawTime = 21; // 21:00 draw time
    const next = new Date(now);
    next.setHours(drawTime, 15, 0, 0); // 21:15 (result available)

    if (config.drawDays === 'daily') {
        if (now >= next) next.setDate(next.getDate() + 1);
        return next;
    }

    // Find next draw day
    for (let i = 0; i < 8; i++) {
        const check = new Date(next);
        check.setDate(check.getDate() + i);
        if (config.drawDays.includes(check.getDay())) {
            if (i === 0 && now >= next) continue;
            return check;
        }
    }
    return next;
}

// ============= THEME TOGGLE =============
function toggleTheme() {
    const body = document.body;
    const isDark = !body.classList.contains('light-theme');
    body.classList.toggle('light-theme', isDark);
    document.getElementById('btnThemeToggle').textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('lottery_theme', isDark ? 'light' : 'dark');
}

function loadTheme() {
    const saved = localStorage.getItem('lottery_theme');
    if (saved === 'light') {
        document.body.classList.add('light-theme');
        document.getElementById('btnThemeToggle').textContent = '☀️';
    }
}

// ============= DATA SOURCE MODAL =============
function showDataSourceModal() {
    document.getElementById('dataSourceModal').classList.add('show');
}

function hideDataSourceModal() {
    document.getElementById('dataSourceModal').classList.remove('show');
}

async function fetchAPIData() {
    const status = document.getElementById('apiStatus');
    const rows = parseInt(document.getElementById('apiRows').value);

    status.className = 'api-status loading';
    status.textContent = `⏳ 正在获取 ${LOTTERY_CONFIG[currentType].name} 最近 ${rows} 期数据...`;

    // Clear cache first to force fresh fetch
    DataCache.clear(currentType);

    try {
        const result = await DataAPI.loadData(currentType, rows);

        if (result.source === 'api') {
            status.className = 'api-status success';
            status.textContent = `✅ 成功获取 ${result.count} 期真实数据！`;
            document.getElementById('dataStatusDot').classList.add('live');
            document.getElementById('dataSourceLabel').textContent = `API · ${result.count}期`;
            updateAll();
        } else {
            status.className = 'api-status error';
            status.textContent = '❌ API 获取失败，仍使用模拟数据。';
        }
    } catch (err) {
        status.className = 'api-status error';
        status.textContent = `❌ 错误: ${err.message}`;
    }
}

function importCSVFile(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const count = DataAPI.importCSV(currentType, e.target.result);
        const status = document.getElementById('apiStatus');
        if (count > 0) {
            status.className = 'api-status success';
            status.textContent = `✅ 成功导入 ${count} 期数据！`;
            document.getElementById('dataSourceLabel').textContent = `CSV · ${count}期`;
            updateAll();
        } else {
            status.className = 'api-status error';
            status.textContent = '❌ 导入失败，请检查CSV格式。';
        }
    };
    reader.readAsText(file);
}

function clearCache() {
    DataCache.clear();
    const status = document.getElementById('apiStatus');
    status.className = 'api-status success';
    status.textContent = '✅ 缓存已清除';
}

function resetToSimulatedData() {
    DataCache.clear(currentType);
    LOTTERY_DATA[currentType] = generateHistoricalData(currentType, 200);
    document.getElementById('dataStatusDot').classList.remove('live');
    document.getElementById('dataSourceLabel').textContent = '模拟数据';
    document.getElementById('apiStatus').textContent = '';
    updateAll();
    hideDataSourceModal();
}

// ============= EXPORT FUNCTIONS =============
function exportHistoryCSV() {
    DataExporter.exportCSV(currentType);
    document.getElementById('exportMenu')?.classList.remove('show');
}

function exportAnalysisCSV() {
    DataExporter.exportAnalysis(currentType);
    document.getElementById('exportMenu')?.classList.remove('show');
}

function exportPredictionsTxt() {
    // Flatten multi-bet predictions for export
    const flat = {};
    Object.entries(currentPredictions).forEach(([k, bets]) => {
        if (Array.isArray(bets) && bets.length > 0) flat[k] = bets[0];
    });
    DataExporter.exportPredictions(currentType, flat);
    document.getElementById('exportMenu')?.classList.remove('show');
}

function exportPredictionsImg() {
    const flat = {};
    Object.entries(currentPredictions).forEach(([k, bets]) => {
        if (Array.isArray(bets) && bets.length > 0) flat[k] = bets[0];
    });
    DataExporter.exportPredictionImage(currentType, flat);
    document.getElementById('exportMenu')?.classList.remove('show');
}

// Make functions available globally
window.generatePrediction = generatePrediction;
window.generateAllPredictions = generateAllPredictions;
window.showDataSourceModal = showDataSourceModal;
window.hideDataSourceModal = hideDataSourceModal;
window.fetchAPIData = fetchAPIData;
window.importCSVFile = importCSVFile;
window.clearCache = clearCache;
window.resetToSimulatedData = resetToSimulatedData;
window.exportHistoryCSV = exportHistoryCSV;
window.exportAnalysisCSV = exportAnalysisCSV;
window.exportPredictionsTxt = exportPredictionsTxt;
window.exportPredictionsImg = exportPredictionsImg;
window.toggleFilter = toggleFilter;
window.applyFilter = applyFilter;
window.toggleBacktest = toggleBacktest;
window.runBacktest = runBacktest;
window.toggleCompare = toggleCompare;
window.runCompare = runCompare;
window.goHistoryPage = goHistoryPage;
window.toggleTheme = toggleTheme;
