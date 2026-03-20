/**
 * 统计分析引擎 - v2
 * Supports both pick-type (SSQ, DLT, QLC) and digit-type (FC3D, PL3, PL5) lotteries
 */

const Analysis = {

    /**
     * Get the effective range start for a lottery type
     */
    _getStart(config) {
        return config && config.isDigit ? 0 : 1;
    },

    /**
     * Calculate frequency of each number in main/bonus zones
     */
    frequency(draws, range, field, config) {
        const start = config && config.isDigit ? 0 : 1;
        const freq = {};
        for (let i = start; i <= range; i++) freq[i] = 0;

        draws.forEach(d => {
            if (d[field]) {
                d[field].forEach(n => {
                    if (freq[n] !== undefined) freq[n]++;
                    else freq[n] = 1;
                });
            }
        });
        return freq;
    },

    /**
     * Get hot numbers (most frequent in recent N draws)
     */
    hotNumbers(draws, range, field, recentN = 50, topK = 10, config) {
        const recent = draws.slice(-recentN);
        const freq = this.frequency(recent, range, field, config);
        return Object.entries(freq)
            .map(([num, count]) => ({ num: parseInt(num), count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, topK);
    },

    /**
     * Get cold numbers (least frequent in recent N draws)
     */
    coldNumbers(draws, range, field, recentN = 50, topK = 10, config) {
        const recent = draws.slice(-recentN);
        const freq = this.frequency(recent, range, field, config);
        return Object.entries(freq)
            .map(([num, count]) => ({ num: parseInt(num), count }))
            .sort((a, b) => a.count - b.count)
            .slice(0, topK);
    },

    /**
     * Calculate missing values (遗漏值) for each number
     */
    missingValues(draws, range, field, config) {
        const start = config && config.isDigit ? 0 : 1;
        const missing = {};
        for (let i = start; i <= range; i++) missing[i] = 0;

        for (let i = draws.length - 1; i >= 0; i--) {
            const nums = draws[i][field] || [];
            for (let n = start; n <= range; n++) {
                if (!nums.includes(n) && missing[n] === (draws.length - 1 - i)) {
                    missing[n]++;
                }
            }
        }
        return missing;
    },

    /**
     * Calculate odd/even ratio for recent draws
     */
    oddEvenRatio(draws, field, recentN = 50) {
        const recent = draws.slice(-recentN);
        const ratios = {};

        recent.forEach(d => {
            const nums = d[field] || [];
            const odds = nums.filter(n => n % 2 === 1).length;
            const evens = nums.length - odds;
            const key = `${odds}:${evens}`;
            ratios[key] = (ratios[key] || 0) + 1;
        });

        return Object.entries(ratios)
            .map(([ratio, count]) => ({ ratio, count }))
            .sort((a, b) => b.count - a.count);
    },

    /**
     * Calculate big/small ratio
     */
    bigSmallRatio(draws, range, field, recentN = 50) {
        const recent = draws.slice(-recentN);
        const mid = Math.ceil(range / 2);
        const ratios = {};

        recent.forEach(d => {
            const nums = d[field] || [];
            const bigs = nums.filter(n => n > mid).length;
            const smalls = nums.length - bigs;
            const key = `${bigs}:${smalls}`;
            ratios[key] = (ratios[key] || 0) + 1;
        });

        return Object.entries(ratios)
            .map(([ratio, count]) => ({ ratio, count }))
            .sort((a, b) => b.count - a.count);
    },

    /**
     * Calculate sum values for recent draws
     */
    sumValues(draws, field, recentN = 50) {
        const recent = draws.slice(-recentN);
        return recent.map(d => ({
            period: d.period,
            sum: (d[field] || []).reduce((a, b) => a + b, 0)
        }));
    },

    /**
     * Calculate span (max - min) for recent draws
     */
    spanValues(draws, field, recentN = 50) {
        const recent = draws.slice(-recentN);
        return recent.map(d => {
            const nums = d[field] || [];
            return {
                period: d.period,
                span: nums.length > 0 ? Math.max(...nums) - Math.min(...nums) : 0
            };
        });
    },

    /**
     * Zone distribution analysis
     */
    zoneAnalysis(draws, range, field, recentN = 50, zones = 3, config) {
        const recent = draws.slice(-recentN);
        const start = config && config.isDigit ? 0 : 1;
        const totalRange = range - start + 1;
        const zoneSize = Math.ceil(totalRange / zones);
        const zoneData = [];

        for (let z = 0; z < zones; z++) {
            const from = start + z * zoneSize;
            const to = Math.min(start + (z + 1) * zoneSize - 1, range);
            let total = 0;

            recent.forEach(d => {
                total += (d[field] || []).filter(n => n >= from && n <= to).length;
            });

            const totalNums = recent.reduce((acc, d) => acc + (d[field] || []).length, 0);

            zoneData.push({
                name: `第${z + 1}区 (${from}-${to})`,
                count: total,
                percentage: totalNums > 0 ? (total / totalNums * 100).toFixed(1) : '0.0'
            });
        }

        return zoneData;
    },

    /**
     * Find consecutive appearing numbers
     */
    consecutiveNumbers(draws, field, config) {
        if (draws.length < 2) return [];
        const results = [];
        const range = config ? config.mainRange : Math.max(...draws.flatMap(d => d[field] || []));
        const start = config && config.isDigit ? 0 : 1;

        for (let n = start; n <= range; n++) {
            let streak = 0;
            for (let i = draws.length - 1; i >= 0; i--) {
                if ((draws[i][field] || []).includes(n)) {
                    streak++;
                } else {
                    break;
                }
            }
            if (streak >= 2) {
                results.push({ num: n, streak });
            }
        }

        return results.sort((a, b) => b.streak - a.streak);
    },

    /**
     * Sum distribution histogram
     */
    sumDistribution(draws, field, recentN = 100) {
        const recent = draws.slice(-recentN);
        const sums = recent.map(d => (d[field] || []).reduce((a, b) => a + b, 0));
        if (sums.length === 0) return [];

        const min = Math.min(...sums);
        const max = Math.max(...sums);
        if (min === max) return [{ range: `${min}`, count: sums.length }];

        const bucketSize = Math.max(1, Math.ceil((max - min) / 12));
        const buckets = {};

        for (let i = min; i <= max; i += bucketSize) {
            const key = `${i}-${Math.min(i + bucketSize - 1, max)}`;
            buckets[key] = 0;
        }

        sums.forEach(s => {
            const idx = Math.floor((s - min) / bucketSize);
            const start = min + idx * bucketSize;
            const key = `${start}-${Math.min(start + bucketSize - 1, max)}`;
            if (buckets[key] !== undefined) buckets[key]++;
        });

        return Object.entries(buckets).map(([range, count]) => ({ range, count }));
    },

    /**
     * Span distribution histogram
     */
    spanDistribution(draws, field, recentN = 100) {
        const recent = draws.slice(-recentN);
        const spans = recent.map(d => {
            const nums = d[field] || [];
            return nums.length > 0 ? Math.max(...nums) - Math.min(...nums) : 0;
        });
        const dist = {};

        spans.forEach(s => {
            dist[s] = (dist[s] || 0) + 1;
        });

        return Object.entries(dist)
            .map(([span, count]) => ({ span: parseInt(span), count }))
            .sort((a, b) => a.span - b.span);
    },

    /**
     * Digit position frequency (for digit-type lotteries like FC3D, PL3, PL5)
     * Returns frequency for each position independently
     */
    digitPositionFrequency(draws, field, position, recentN) {
        const recent = recentN ? draws.slice(-recentN) : draws;
        const freq = {};
        for (let i = 0; i <= 9; i++) freq[i] = 0;

        recent.forEach(d => {
            const nums = d[field] || [];
            if (position < nums.length) {
                freq[nums[position]]++;
            }
        });
        return freq;
    }
};

/**
 * 预测引擎 - v2
 * Supports both pick-type and digit-type lotteries
 */
const Predictor = {

    /**
     * Hot-Cold Balance Strategy
     */
    hotColdStrategy(draws, config) {
        if (config.isDigit) {
            return this._digitHotCold(draws, config);
        }

        const hot = Analysis.hotNumbers(draws, config.mainRange, 'main', 30, 20, config);
        const cold = Analysis.coldNumbers(draws, config.mainRange, 'main', 50, 20, config);
        const missing = Analysis.missingValues(draws, config.mainRange, 'main', config);

        const hotCount = Math.ceil(config.mainCount * 0.6);
        const selected = [];

        const hotPool = [...hot];
        while (selected.length < hotCount && hotPool.length > 0) {
            const idx = Math.floor(Math.random() * Math.min(hotPool.length, 10));
            const pick = hotPool.splice(idx, 1)[0];
            if (!selected.includes(pick.num)) selected.push(pick.num);
        }

        const coldPool = cold.sort((a, b) => (missing[b.num] || 0) - (missing[a.num] || 0));
        let ci = 0;
        while (selected.length < config.mainCount && ci < coldPool.length) {
            if (!selected.includes(coldPool[ci].num)) selected.push(coldPool[ci].num);
            ci++;
        }

        selected.sort((a, b) => a - b);

        const bonus = this._generateBonus(draws, config);
        return { main: selected, bonus };
    },

    _digitHotCold(draws, config) {
        const main = [];
        for (let pos = 0; pos < config.mainCount; pos++) {
            const freq = Analysis.digitPositionFrequency(draws, 'main', pos, 50);
            const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
            // Mix: pick from top 3 hot and occasionally from cold
            if (Math.random() > 0.3) {
                const topIdx = Math.floor(Math.random() * Math.min(3, sorted.length));
                main.push(parseInt(sorted[topIdx][0]));
            } else {
                const bottomIdx = sorted.length - 1 - Math.floor(Math.random() * 3);
                main.push(parseInt(sorted[Math.max(0, bottomIdx)][0]));
            }
        }
        return { main, bonus: [] };
    },

    /**
     * Trend Following Strategy
     */
    trendStrategy(draws, config) {
        if (config.isDigit) {
            return this._digitTrend(draws, config);
        }

        const missing = Analysis.missingValues(draws, config.mainRange, 'main', config);
        const freq = Analysis.frequency(draws.slice(-20), config.mainRange, 'main', config);
        const start = config.isDigit ? 0 : 1;

        const scores = {};
        for (let i = start; i <= config.mainRange; i++) {
            scores[i] = (missing[i] || 0) * 2 + (freq[i] || 0) * 3 + Math.random() * 5;
        }

        const sorted = Object.entries(scores)
            .sort((a, b) => b[1] - a[1])
            .map(([num]) => parseInt(num));

        const selected = [];
        for (let i = 0; i < sorted.length && selected.length < config.mainCount; i++) {
            if (Math.random() > 0.2 || selected.length >= config.mainCount - 2) {
                selected.push(sorted[i]);
            }
        }
        selected.sort((a, b) => a - b);

        const bonus = this._generateBonus(draws, config);
        return { main: selected, bonus };
    },

    _digitTrend(draws, config) {
        const main = [];
        for (let pos = 0; pos < config.mainCount; pos++) {
            const freq = Analysis.digitPositionFrequency(draws, 'main', pos, 20);
            const missing = {};
            for (let n = 0; n <= 9; n++) {
                missing[n] = 0;
                for (let i = draws.length - 1; i >= 0; i--) {
                    if ((draws[i].main || [])[pos] !== n) missing[n]++;
                    else break;
                }
            }
            const scores = {};
            for (let n = 0; n <= 9; n++) {
                scores[n] = (missing[n] || 0) * 2 + (freq[n] || 0) * 3 + Math.random() * 5;
            }
            const best = Object.entries(scores).sort((a, b) => b[1] - a[1]);
            const pick = Math.floor(Math.random() * Math.min(3, best.length));
            main.push(parseInt(best[pick][0]));
        }
        return { main, bonus: [] };
    },

    /**
     * Balanced Strategy
     */
    balanceStrategy(draws, config) {
        if (config.isDigit) {
            return this._digitBalance(draws, config);
        }

        const freq = Analysis.frequency(draws.slice(-50), config.mainRange, 'main', config);
        const targetOdd = Math.ceil(config.mainCount / 2);
        const mid = Math.ceil(config.mainRange / 2);
        const zones = config.mainCount <= 5 ? 3 : Math.min(4, Math.ceil(config.mainRange / 8));
        const zoneSize = Math.ceil(config.mainRange / zones);

        let best = null;
        let bestScore = -Infinity;

        for (let attempt = 0; attempt < 1000; attempt++) {
            const candidate = [];
            while (candidate.length < config.mainCount) {
                const n = Math.floor(Math.random() * config.mainRange) + 1;
                if (!candidate.includes(n)) candidate.push(n);
            }

            const odds = candidate.filter(n => n % 2 === 1).length;
            const bigs = candidate.filter(n => n > mid).length;
            const zoneArr = new Array(zones).fill(0);
            candidate.forEach(n => {
                const z = Math.min(zones - 1, Math.floor((n - 1) / zoneSize));
                zoneArr[z]++;
            });

            let score = 0;
            score -= Math.abs(odds - targetOdd) * 10;
            score -= Math.abs(bigs - Math.floor(config.mainCount / 2)) * 10;
            for (let z = 0; z < zones - 1; z++) {
                score -= Math.abs(zoneArr[z] - zoneArr[z + 1]) * 5;
            }
            candidate.forEach(n => score += (freq[n] || 0));
            const sum = candidate.reduce((a, b) => a + b, 0);
            const sums = Analysis.sumValues(draws, 'main', 50);
            const avgSum = sums.length > 0 ? sums.reduce((a, b) => a + b.sum, 0) / sums.length : sum;
            score -= Math.abs(sum - avgSum) * 0.5;
            score += Math.random() * 5;

            if (score > bestScore) {
                bestScore = score;
                best = [...candidate];
            }
        }

        best.sort((a, b) => a - b);
        const bonus = this._generateBonus(draws, config);
        return { main: best, bonus };
    },

    _digitBalance(draws, config) {
        const main = [];
        let bestScore = -Infinity;
        let bestMain = null;

        for (let attempt = 0; attempt < 500; attempt++) {
            const candidate = [];
            for (let i = 0; i < config.mainCount; i++) {
                candidate.push(Math.floor(Math.random() * 10));
            }

            const odds = candidate.filter(n => n % 2 === 1).length;
            const sum = candidate.reduce((a, b) => a + b, 0);
            let score = 0;
            score -= Math.abs(odds - Math.ceil(config.mainCount / 2)) * 10;

            const sums = Analysis.sumValues(draws, 'main', 50);
            const avgSum = sums.length > 0 ? sums.reduce((a, b) => a + b.sum, 0) / sums.length : sum;
            score -= Math.abs(sum - avgSum) * 2;
            score += Math.random() * 5;

            if (score > bestScore) {
                bestScore = score;
                bestMain = [...candidate];
            }
        }

        return { main: bestMain || [0, 0, 0], bonus: [] };
    },

    /**
     * Pure Random Strategy
     */
    randomStrategy(config) {
        if (config.isDigit) {
            const main = [];
            for (let i = 0; i < config.mainCount; i++) {
                main.push(Math.floor(Math.random() * 10));
            }
            return { main, bonus: [] };
        }

        const main = [];
        while (main.length < config.mainCount) {
            const n = Math.floor(Math.random() * config.mainRange) + 1;
            if (!main.includes(n)) main.push(n);
        }
        main.sort((a, b) => a - b);

        const bonus = this._generateBonus(null, config);
        return { main, bonus };
    },

    /**
     * Helper: generate bonus numbers
     */
    _generateBonus(draws, config) {
        if (config.bonusCount === 0) return [];

        const bonus = [];
        while (bonus.length < config.bonusCount) {
            const n = Math.floor(Math.random() * config.bonusRange) + 1;
            if (!bonus.includes(n)) bonus.push(n);
        }
        bonus.sort((a, b) => a - b);
        return bonus;
    },

    /**
     * Apply filter constraints to a result
     */
    applyFilter(result, config, filter) {
        if (!filter) return result;
        let main = [...result.main];

        // Locked numbers must be included
        if (filter.locked && filter.locked.length > 0) {
            filter.locked.forEach(n => {
                if (!main.includes(n)) main.push(n);
            });
        }

        // Killed numbers must be excluded
        if (filter.killed && filter.killed.length > 0) {
            main = main.filter(n => !filter.killed.includes(n));
        }

        // Adjust to correct count
        if (!config.isDigit) {
            const start = config.isDigit ? 0 : 1;
            while (main.length < config.mainCount) {
                const n = Math.floor(Math.random() * config.mainRange) + start;
                if (!main.includes(n) && !(filter.killed || []).includes(n)) main.push(n);
            }
            if (main.length > config.mainCount) {
                const locked = new Set(filter.locked || []);
                main = main.filter(n => locked.has(n))
                    .concat(main.filter(n => !locked.has(n)).slice(0, config.mainCount - (filter.locked || []).length));
            }
            main.sort((a, b) => a - b);
        }

        return { main, bonus: result.bonus };
    },

    // ===== Advanced Algorithms =====

    /**
     * Markov Chain Strategy
     * Builds transition probability matrix from consecutive draws
     */
    markovStrategy(draws, config) {
        if (config.isDigit) return this._digitMarkov(draws, config);

        const start = 1;
        const range = config.mainRange;
        // Build transition matrix: P(next=j | prev=i)
        const trans = {};
        for (let i = start; i <= range; i++) {
            trans[i] = {};
            for (let j = start; j <= range; j++) trans[i][j] = 0;
        }

        for (let d = 1; d < draws.length; d++) {
            const prev = draws[d - 1].main || [];
            const curr = draws[d].main || [];
            prev.forEach(p => {
                curr.forEach(c => { trans[p][c]++; });
            });
        }

        // Score each number based on transition from last draw
        const lastDraw = draws[draws.length - 1].main || [];
        const scores = {};
        for (let j = start; j <= range; j++) {
            scores[j] = 0;
            lastDraw.forEach(p => { scores[j] += trans[p][j] || 0; });
            scores[j] += Math.random() * 3; // perturbation
        }

        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        const selected = sorted.slice(0, config.mainCount).map(([n]) => parseInt(n));
        selected.sort((a, b) => a - b);

        return { main: selected, bonus: this._generateBonus(draws, config) };
    },

    _digitMarkov(draws, config) {
        const main = [];
        for (let pos = 0; pos < config.mainCount; pos++) {
            const trans = {};
            for (let i = 0; i <= 9; i++) { trans[i] = {}; for (let j = 0; j <= 9; j++) trans[i][j] = 0; }
            for (let d = 1; d < draws.length; d++) {
                const prev = (draws[d - 1].main || [])[pos];
                const curr = (draws[d].main || [])[pos];
                if (prev !== undefined && curr !== undefined) trans[prev][curr]++;
            }
            const last = (draws[draws.length - 1].main || [])[pos];
            if (last !== undefined) {
                const scores = {};
                for (let j = 0; j <= 9; j++) scores[j] = (trans[last][j] || 0) + Math.random() * 2;
                const best = Object.entries(scores).sort((a, b) => b[1] - a[1]);
                main.push(parseInt(best[0][0]));
            } else {
                main.push(Math.floor(Math.random() * 10));
            }
        }
        return { main, bonus: [] };
    },

    /**
     * Bayesian Probability Strategy
     * Prior = overall frequency, Likelihood = recent frequency, Posterior ∝ Prior × Likelihood
     */
    bayesianStrategy(draws, config) {
        if (config.isDigit) return this._digitBayesian(draws, config);

        const start = 1;
        const range = config.mainRange;
        const allFreq = Analysis.frequency(draws, range, 'main', config);
        const recentFreq = Analysis.frequency(draws.slice(-20), range, 'main', config);
        const totalAll = draws.length;
        const totalRecent = Math.min(20, draws.length);

        const posteriors = {};
        for (let n = start; n <= range; n++) {
            const prior = (allFreq[n] || 0) / totalAll;
            const likelihood = (recentFreq[n] || 0) / totalRecent;
            posteriors[n] = prior * likelihood + Math.random() * 0.001;
        }

        const sorted = Object.entries(posteriors).sort((a, b) => b[1] - a[1]);
        const selected = sorted.slice(0, config.mainCount).map(([n]) => parseInt(n));
        selected.sort((a, b) => a - b);

        return { main: selected, bonus: this._generateBonus(draws, config) };
    },

    _digitBayesian(draws, config) {
        const main = [];
        for (let pos = 0; pos < config.mainCount; pos++) {
            const allFreq = Analysis.digitPositionFrequency(draws, 'main', pos);
            const recentFreq = Analysis.digitPositionFrequency(draws, 'main', pos, 20);
            const total = draws.length;
            const recent = Math.min(20, draws.length);
            const posteriors = {};
            for (let n = 0; n <= 9; n++) {
                posteriors[n] = ((allFreq[n] || 0) / total) * ((recentFreq[n] || 0) / recent) + Math.random() * 0.001;
            }
            const best = Object.entries(posteriors).sort((a, b) => b[1] - a[1]);
            main.push(parseInt(best[0][0]));
        }
        return { main, bonus: [] };
    },

    /**
     * Moving Average Strategy
     * Picks numbers with rising appearance trend in recent windows
     */
    movingAvgStrategy(draws, config) {
        if (config.isDigit) return this._digitMovingAvg(draws, config);

        const start = 1;
        const range = config.mainRange;
        const windowA = 30; // long window
        const windowB = 10; // short window

        const freqA = Analysis.frequency(draws.slice(-windowA), range, 'main', config);
        const freqB = Analysis.frequency(draws.slice(-windowB), range, 'main', config);

        const trends = {};
        for (let n = start; n <= range; n++) {
            const avgA = (freqA[n] || 0) / windowA;
            const avgB = (freqB[n] || 0) / windowB;
            trends[n] = (avgB - avgA) + Math.random() * 0.05; // positive = rising trend
        }

        const sorted = Object.entries(trends).sort((a, b) => b[1] - a[1]);
        const selected = sorted.slice(0, config.mainCount).map(([n]) => parseInt(n));
        selected.sort((a, b) => a - b);

        return { main: selected, bonus: this._generateBonus(draws, config) };
    },

    _digitMovingAvg(draws, config) {
        const main = [];
        for (let pos = 0; pos < config.mainCount; pos++) {
            const freqA = Analysis.digitPositionFrequency(draws, 'main', pos, 30);
            const freqB = Analysis.digitPositionFrequency(draws, 'main', pos, 10);
            const trends = {};
            for (let n = 0; n <= 9; n++) {
                trends[n] = ((freqB[n] || 0) / 10) - ((freqA[n] || 0) / 30) + Math.random() * 0.05;
            }
            const best = Object.entries(trends).sort((a, b) => b[1] - a[1]);
            main.push(parseInt(best[0][0]));
        }
        return { main, bonus: [] };
    }
};

/**
 * 回测引擎 - Backtester
 * Tests prediction strategies against historical data
 */
const Backtester = {
    /**
     * Run backtest: use first (total-testN) draws as training, predict next testN
     * Returns hit statistics for each strategy
     */
    run(draws, config, testN = 20) {
        if (draws.length < testN + 30) {
            return { error: '数据量不足，至少需要50期以上数据' };
        }

        const strategies = ['hotcold', 'trend', 'balance', 'markov', 'bayesian', 'movingAvg'];
        const strategyNames = {
            hotcold: '冷热互补', trend: '趋势追踪', balance: '均衡优化',
            markov: '马尔可夫链', bayesian: '贝叶斯', movingAvg: '移动平均'
        };

        const results = {};
        strategies.forEach(s => {
            results[s] = { name: strategyNames[s], hits: [], totalHit: 0, avgHit: 0 };
        });

        for (let i = draws.length - testN; i < draws.length; i++) {
            const trainDraws = draws.slice(0, i);
            const actual = draws[i];

            strategies.forEach(s => {
                let predicted;
                const method = s === 'hotcold' ? 'hotColdStrategy' :
                    s === 'trend' ? 'trendStrategy' :
                    s === 'balance' ? 'balanceStrategy' :
                    s === 'markov' ? 'markovStrategy' :
                    s === 'bayesian' ? 'bayesianStrategy' :
                    'movingAvgStrategy';

                try {
                    predicted = Predictor[method](trainDraws, config);
                } catch (e) {
                    predicted = { main: [], bonus: [] };
                }

                const hitCount = predicted.main.filter(n => (actual.main || []).includes(n)).length;
                results[s].hits.push(hitCount);
                results[s].totalHit += hitCount;
            });
        }

        // Calculate averages
        strategies.forEach(s => {
            const r = results[s];
            r.avgHit = (r.totalHit / testN).toFixed(2);
            r.hit3plus = r.hits.filter(h => h >= 3).length;
            r.hit3plusPct = ((r.hit3plus / testN) * 100).toFixed(1);
            r.maxHit = Math.max(...r.hits);
        });

        return { results, testN, totalDraws: draws.length };
    }
};

