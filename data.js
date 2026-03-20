/**
 * 彩票历史数据模块 - v2
 * 支持6大彩种：双色球、大乐透、福彩3D、七乐彩、排列三、排列五
 *
 * 数据源说明：
 * - 内置200期模拟历史数据（基于统计概率模型生成）
 * - 支持通过开彩网 API (f.apiplus.net) 拉取真实数据
 * - 用户也可手动导入CSV数据
 */

// ===== Lottery Configurations =====
const LOTTERY_CONFIG = {
    ssq: {
        name: '双色球',
        fullName: '中国福利彩票双色球',
        mainName: '红球',
        bonusName: '蓝球',
        mainRange: 33,
        bonusRange: 16,
        mainCount: 6,
        bonusCount: 1,
        mainColor: 'red',
        bonusColor: 'blue',
        icon: '🔴🔵',
        desc: '福彩 · 红球1-33 蓝球1-16',
        apiCode: 'ssq',
        drawDays: [2, 4, 0], // Tue, Thu, Sun
        isDigit: false
    },
    dlt: {
        name: '大乐透',
        fullName: '中国体育彩票超级大乐透',
        mainName: '前区',
        bonusName: '后区',
        mainRange: 35,
        bonusRange: 12,
        mainCount: 5,
        bonusCount: 2,
        mainColor: 'red',
        bonusColor: 'gold',
        icon: '⭐🌙',
        desc: '体彩 · 前区1-35 后区1-12',
        apiCode: 'dlt',
        drawDays: [1, 3, 6], // Mon, Wed, Sat
        isDigit: false
    },
    fc3d: {
        name: '福彩3D',
        fullName: '中国福利彩票3D',
        mainName: '号码',
        bonusName: '',
        mainRange: 9,  // 0-9
        bonusRange: 0,
        mainCount: 3,
        bonusCount: 0,
        mainColor: 'red',
        bonusColor: '',
        icon: '🎰',
        desc: '福彩 · 3位数 0-9',
        apiCode: 'fc3d',
        drawDays: 'daily',
        isDigit: true, // digit lottery - numbers can repeat
        mainStart: 0   // starts from 0
    },
    qlc: {
        name: '七乐彩',
        fullName: '中国福利彩票七乐彩',
        mainName: '基本号',
        bonusName: '特别号',
        mainRange: 30,
        bonusRange: 30,
        mainCount: 7,
        bonusCount: 1,
        mainColor: 'red',
        bonusColor: 'blue',
        icon: '🎲🎯',
        desc: '福彩 · 基本号1-30 特别号1',
        apiCode: 'qlc',
        drawDays: [1, 3, 5], // Mon, Wed, Fri
        isDigit: false
    },
    pl3: {
        name: '排列三',
        fullName: '中国体育彩票排列3',
        mainName: '号码',
        bonusName: '',
        mainRange: 9,
        bonusRange: 0,
        mainCount: 3,
        bonusCount: 0,
        mainColor: 'gold',
        bonusColor: '',
        icon: '🏅3️⃣',
        desc: '体彩 · 3位数 0-9',
        apiCode: 'pl3',
        drawDays: 'daily',
        isDigit: true,
        mainStart: 0
    },
    pl5: {
        name: '排列五',
        fullName: '中国体育彩票排列5',
        mainName: '号码',
        bonusName: '',
        mainRange: 9,
        bonusRange: 0,
        mainCount: 5,
        bonusCount: 0,
        mainColor: 'gold',
        bonusColor: '',
        icon: '🏅5️⃣',
        desc: '体彩 · 5位数 0-9',
        apiCode: 'pl5',
        drawDays: 'daily',
        isDigit: true,
        mainStart: 0
    }
};

// ===== Data Generators =====
function generatePickData(count, range, pickCount, sorted = true) {
    const nums = [];
    while (nums.length < pickCount) {
        const n = Math.floor(Math.random() * range) + 1;
        if (!nums.includes(n)) nums.push(n);
    }
    if (sorted) nums.sort((a, b) => a - b);
    return nums;
}

function generateDigitData(count) {
    const nums = [];
    for (let i = 0; i < count; i++) {
        nums.push(Math.floor(Math.random() * 10));
    }
    return nums;
}

function generateHistoricalData(type, count = 200) {
    const config = LOTTERY_CONFIG[type];
    const data = [];
    const baseDate = new Date(2025, 0, 1);
    let drawNum = 1;
    let dayStep = config.drawDays === 'daily' ? 1 : 2.5;

    for (let i = 0; i < count; i++) {
        let main, bonus;

        if (config.isDigit) {
            main = generateDigitData(config.mainCount);
            bonus = [];
        } else {
            main = generatePickData(1, config.mainRange, config.mainCount);
            bonus = config.bonusCount > 0
                ? generatePickData(1, config.bonusRange, config.bonusCount)
                : [];

            // For 七乐彩: bonus must not be in main
            if (type === 'qlc' && bonus.length > 0) {
                while (main.includes(bonus[0])) {
                    bonus = [Math.floor(Math.random() * config.bonusRange) + 1];
                }
            }
        }

        const drawDate = new Date(baseDate);
        drawDate.setDate(drawDate.getDate() + Math.round(i * dayStep));

        data.push({
            period: `2025${String(drawNum++).padStart(3, '0')}`,
            date: drawDate.toISOString().slice(0, 10),
            main: main,
            bonus: bonus
        });
    }
    return data;
}

// Generate all datasets
const LOTTERY_DATA = {};
Object.keys(LOTTERY_CONFIG).forEach(type => {
    LOTTERY_DATA[type] = generateHistoricalData(type, 200);
});

// ===== localStorage Cache =====
const DataCache = {
    CACHE_TTL: 12 * 60 * 60 * 1000, // 12 hours

    save(type, data, source) {
        try {
            const entry = { data, source, timestamp: Date.now() };
            localStorage.setItem(`lottery_${type}`, JSON.stringify(entry));
        } catch (e) {
            console.warn('Cache save failed:', e.message);
        }
    },

    load(type) {
        try {
            const raw = localStorage.getItem(`lottery_${type}`);
            if (!raw) return null;
            const entry = JSON.parse(raw);
            if (Date.now() - entry.timestamp > this.CACHE_TTL) {
                localStorage.removeItem(`lottery_${type}`);
                return null;
            }
            return entry;
        } catch (e) {
            return null;
        }
    },

    clear(type) {
        if (type) {
            localStorage.removeItem(`lottery_${type}`);
        } else {
            Object.keys(LOTTERY_CONFIG).forEach(t => localStorage.removeItem(`lottery_${t}`));
        }
    },

    hasFresh(type) {
        return this.load(type) !== null;
    }
};

// ===== API Data Fetching =====

const DataAPI = {
    /**
     * Fetch data from our local proxy (multi-source)
     * Proxy auto-selects: sporttery.cn for 体彩, 开彩网 for 福彩
     * @param {string} lotteryType - e.g. 'ssq', 'dlt', 'fc3d'
     * @param {number} rows - number of rows to fetch (max 200)
     */
    async fetchFromKaicai(lotteryType, rows = 100) {
        const config = LOTTERY_CONFIG[lotteryType];
        if (!config) throw new Error(`Unknown lottery type: ${lotteryType}`);

        const url = `/api/${config.apiCode}?count=${rows}`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`API returned ${response.status}`);
            const json = await response.json();

            if (json.error) throw new Error(json.error);

            if (json.rows && Array.isArray(json.rows)) {
                const parsed = json.rows.map(row => {
                    // Format A: Pre-parsed by proxy (sporttery.cn)
                    if (Array.isArray(row.main)) {
                        return {
                            period: row.period,
                            date: row.date || '',
                            main: row.main,
                            bonus: row.bonus || []
                        };
                    }

                    // Format B: opencode string (开彩网)
                    let main, bonus;

                    if (config.isDigit) {
                        const nums = row.opencode.split(',').map(Number);
                        main = nums;
                        bonus = [];
                    } else if (lotteryType === 'ssq') {
                        const parts = row.opencode.split('+');
                        main = parts[0].split(',').map(Number);
                        bonus = [parseInt(parts[1])];
                    } else if (lotteryType === 'dlt') {
                        const parts = row.opencode.split('+');
                        main = parts[0].split(',').map(Number);
                        bonus = parts[1].split(',').map(Number);
                    } else if (lotteryType === 'qlc') {
                        const parts = row.opencode.split('+');
                        main = parts[0].split(',').map(Number);
                        bonus = parts[1] ? [parseInt(parts[1])] : [];
                    }

                    return {
                        period: row.expect || row.issue,
                        date: row.opentime ? row.opentime.slice(0, 10) : '',
                        main,
                        bonus
                    };
                });

                // Ensure chronological order (oldest first)
                if (parsed.length > 1 && parsed[0].period > parsed[parsed.length - 1].period) {
                    parsed.reverse();
                }

                return parsed;
            }
            throw new Error('Unexpected API response format');
        } catch (err) {
            console.warn(`API fetch failed for ${lotteryType}:`, err.message);
            return null;
        }
    },

    /**
     * Try to load real data: cache first, then API, then simulated
     */
    async loadData(lotteryType, rows = 200) {
        // Try cache first
        const cached = DataCache.load(lotteryType);
        if (cached && cached.data && cached.data.length > 0) {
            LOTTERY_DATA[lotteryType] = cached.data;
            return { source: 'cache', count: cached.data.length };
        }

        // Try API
        const apiData = await this.fetchFromKaicai(lotteryType, rows);
        if (apiData && apiData.length > 0) {
            LOTTERY_DATA[lotteryType] = apiData;
            DataCache.save(lotteryType, apiData, 'api');
            return { source: 'api', count: apiData.length };
        }

        return { source: 'simulated', count: LOTTERY_DATA[lotteryType].length };
    },

    /**
     * Import from CSV text
     * Expected format: period,date,n1,n2,n3,...,b1,b2
     */
    importCSV(lotteryType, csvText) {
        const config = LOTTERY_CONFIG[lotteryType];
        const lines = csvText.trim().split('\n');
        const data = [];

        // Skip header if present
        const start = lines[0].includes('period') || lines[0].includes('期号') ? 1 : 0;

        for (let i = start; i < lines.length; i++) {
            const cols = lines[i].split(',').map(s => s.trim());
            if (cols.length < 2 + config.mainCount) continue;

            const period = cols[0];
            const date = cols[1];
            const main = cols.slice(2, 2 + config.mainCount).map(Number);
            const bonus = config.bonusCount > 0
                ? cols.slice(2 + config.mainCount, 2 + config.mainCount + config.bonusCount).map(Number)
                : [];

            data.push({ period, date, main, bonus });
        }

        if (data.length > 0) {
            LOTTERY_DATA[lotteryType] = data;
            return data.length;
        }
        return 0;
    }
};

// ===== Data Export =====
const DataExporter = {
    /**
     * Export historical data as CSV
     */
    exportCSV(lotteryType) {
        const config = LOTTERY_CONFIG[lotteryType];
        const data = LOTTERY_DATA[lotteryType];

        // Header
        const mainHeaders = Array.from({ length: config.mainCount }, (_, i) =>
            config.isDigit ? `号码${i + 1}` : `${config.mainName}${i + 1}`
        );
        const bonusHeaders = config.bonusCount > 0
            ? Array.from({ length: config.bonusCount }, (_, i) =>
                config.bonusCount === 1 ? config.bonusName : `${config.bonusName}${i + 1}`)
            : [];

        const header = ['期号', '开奖日期', ...mainHeaders, ...bonusHeaders];
        const rows = data.map(d => [d.period, d.date, ...d.main, ...d.bonus]);

        const csv = [header, ...rows].map(r => r.join(',')).join('\n');

        this._download(csv, `${config.name}_历史数据.csv`, 'text/csv;charset=utf-8');
    },

    /**
     * Export analysis summary as CSV
     */
    exportAnalysis(lotteryType) {
        const config = LOTTERY_CONFIG[lotteryType];
        const draws = LOTTERY_DATA[lotteryType];
        const range = config.isDigit ? config.mainRange + 1 : config.mainRange;
        const start = config.isDigit ? 0 : 1;

        const freq = Analysis.frequency(draws, config.mainRange, 'main');
        const missing = Analysis.missingValues(draws, config.mainRange, 'main');
        const recentFreq = Analysis.frequency(draws.slice(-50), config.mainRange, 'main');

        const header = ['号码', '总出现次数', '出现概率(%)', '近50期出现次数', '当前遗漏值'];
        const rows = [];

        for (let n = start; n <= config.mainRange; n++) {
            const key = config.isDigit ? n : n;
            rows.push([
                n,
                freq[key] || 0,
                ((freq[key] || 0) / draws.length * 100).toFixed(2),
                recentFreq[key] || 0,
                missing[key] || 0
            ]);
        }

        const csv = [header, ...rows].map(r => r.join(',')).join('\n');
        this._download(csv, `${config.name}_统计分析.csv`, 'text/csv;charset=utf-8');
    },

    /**
     * Export predictions as text
     */
    exportPredictions(lotteryType, predictions) {
        const config = LOTTERY_CONFIG[lotteryType];
        let text = `${config.fullName} - 号码推荐\n`;
        text += `生成时间: ${new Date().toLocaleString('zh-CN')}\n`;
        text += `═══════════════════════════════════\n\n`;

        const strategyNames = {
            hotcold: '🔥❄️ 冷热互补策略',
            trend: '📈 趋势追踪策略',
            balance: '⚖️ 均衡优化策略',
            random: '🎲 幸运随机策略'
        };

        Object.entries(predictions).forEach(([key, pred]) => {
            text += `${strategyNames[key] || key}\n`;
            text += `${config.mainName}: ${pred.main.join(' ')}\n`;
            if (pred.bonus.length > 0) {
                text += `${config.bonusName}: ${pred.bonus.join(' ')}\n`;
            }
            text += '\n';
        });

        text += `═══════════════════════════════════\n`;
        text += `⚠️ 仅供参考，请理性购彩\n`;

        this._download(text, `${config.name}_推荐号码.txt`, 'text/plain;charset=utf-8');
    },

    /**
     * Export prediction as image (using canvas)
     */
    exportPredictionImage(lotteryType, predictions) {
        const config = LOTTERY_CONFIG[lotteryType];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const strategies = Object.entries(predictions);
        const padding = 40;
        const rowHeight = 80;
        const headerHeight = 100;

        canvas.width = 700;
        canvas.height = headerHeight + strategies.length * rowHeight + padding * 2 + 60;

        // Background
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, '#0a0a1a');
        grad.addColorStop(0.5, '#1a0a2e');
        grad.addColorStop(1, '#0a1a2e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Border
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
        ctx.lineWidth = 2;
        ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 16);
        ctx.stroke();

        // Title
        ctx.fillStyle = '#f0f0f8';
        ctx.font = 'bold 24px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${config.name} 号码推荐`, canvas.width / 2, padding + 30);

        ctx.fillStyle = 'rgba(240, 240, 248, 0.5)';
        ctx.font = '13px "Noto Sans SC", sans-serif';
        ctx.fillText(new Date().toLocaleString('zh-CN'), canvas.width / 2, padding + 55);

        const strategyNames = {
            hotcold: '冷热互补',
            trend: '趋势追踪',
            balance: '均衡优化',
            random: '幸运随机'
        };

        const ballColors = {
            red: ['#e63946', '#ff6b7a'],
            blue: ['#457b9d', '#6baed6'],
            gold: ['#f4a261', '#ffc078']
        };

        strategies.forEach(([key, pred], idx) => {
            const y = headerHeight + idx * rowHeight + padding;

            // Strategy label
            ctx.fillStyle = 'rgba(168, 85, 247, 0.7)';
            ctx.font = 'bold 14px "Noto Sans SC", sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(strategyNames[key] || key, padding, y + 10);

            // Draw main balls
            const ballSize = 20;
            let x = padding;
            pred.main.forEach((num, i) => {
                const [color1, color2] = ballColors[config.mainColor] || ballColors.red;
                const g = ctx.createRadialGradient(x + ballSize, y + 35, 3, x + ballSize, y + 35, ballSize);
                g.addColorStop(0, color2);
                g.addColorStop(1, color1);
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x + ballSize, y + 35, ballSize, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#fff';
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(String(num), x + ballSize, y + 40);

                x += ballSize * 2 + 8;
            });

            // Draw bonus balls
            if (pred.bonus.length > 0) {
                x += 10;
                pred.bonus.forEach((num) => {
                    const [color1, color2] = ballColors[config.bonusColor] || ballColors.blue;
                    const g = ctx.createRadialGradient(x + ballSize, y + 35, 3, x + ballSize, y + 35, ballSize);
                    g.addColorStop(0, color2);
                    g.addColorStop(1, color1);
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(x + ballSize, y + 35, ballSize, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 14px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(String(num), x + ballSize, y + 40);
                    x += ballSize * 2 + 8;
                });
            }
        });

        // Disclaimer
        ctx.fillStyle = 'rgba(245, 158, 11, 0.7)';
        ctx.font = '12px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️ 仅供参考 · 理性购彩 · 量力而行', canvas.width / 2, canvas.height - 25);

        // Download
        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${config.name}_推荐号码.png`;
            a.click();
            URL.revokeObjectURL(url);
        }, 'image/png');
    },

    _download(content, filename, mimeType) {
        const blob = new Blob(['\ufeff' + content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
};
