/**
 * 图表渲染模块 - v2
 * Supports all 6 lottery types with Chart.js
 */

// Chart instances cache (for destroy/recreate)
const chartInstances = {};

function getOrCreateChart(canvasId, config) {
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    chartInstances[canvasId] = new Chart(ctx, config);
    return chartInstances[canvasId];
}

// Common chart theme
const CHART_THEME = {
    gridColor: 'rgba(255, 255, 255, 0.06)',
    tickColor: 'rgba(240, 240, 248, 0.4)',
    fontFamily: "'Noto Sans SC', 'Inter', sans-serif",
    redGradient: ['rgba(230, 57, 70, 0.8)', 'rgba(230, 57, 70, 0.2)'],
    blueGradient: ['rgba(69, 123, 157, 0.8)', 'rgba(69, 123, 157, 0.2)'],
    goldGradient: ['rgba(244, 162, 97, 0.8)', 'rgba(244, 162, 97, 0.2)'],
    purpleGradient: ['rgba(168, 85, 247, 0.8)', 'rgba(168, 85, 247, 0.2)']
};

function getColorForLottery(config, isBonus = false) {
    if (isBonus) {
        return config.bonusColor === 'gold' ? CHART_THEME.goldGradient : CHART_THEME.blueGradient;
    }
    return config.mainColor === 'gold' ? CHART_THEME.goldGradient : CHART_THEME.redGradient;
}

// ============= FREQUENCY CHARTS =============
function renderMainFreqChart(draws, config) {
    const freq = Analysis.frequency(draws, config.mainRange, 'main', config);
    const start = config.isDigit ? 0 : 1;
    const labels = [];
    const data = [];

    for (let i = start; i <= config.mainRange; i++) {
        labels.push(i);
        data.push(freq[i] || 0);
    }

    const colors = getColorForLottery(config);

    getOrCreateChart('chartMainFreq', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: `${config.mainName}出现次数`,
                data,
                backgroundColor: colors[0],
                borderColor: colors[0].replace('0.8', '1'),
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 26, 0.9)',
                    titleFont: { family: CHART_THEME.fontFamily },
                    bodyFont: { family: CHART_THEME.fontFamily }
                }
            },
            scales: {
                x: {
                    grid: { color: CHART_THEME.gridColor },
                    ticks: { color: CHART_THEME.tickColor, font: { size: 10 } }
                },
                y: {
                    grid: { color: CHART_THEME.gridColor },
                    ticks: { color: CHART_THEME.tickColor }
                }
            }
        }
    });
}

function renderBonusFreqChart(draws, config) {
    if (config.bonusCount === 0) return;

    const freq = Analysis.frequency(draws, config.bonusRange, 'bonus', config);
    const labels = [];
    const data = [];

    for (let i = 1; i <= config.bonusRange; i++) {
        labels.push(i);
        data.push(freq[i] || 0);
    }

    const colors = getColorForLottery(config, true);

    getOrCreateChart('chartSecondFreq', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: `${config.bonusName}出现次数`,
                data,
                backgroundColor: colors[0],
                borderColor: colors[0].replace('0.8', '1'),
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 26, 0.9)',
                    titleFont: { family: CHART_THEME.fontFamily },
                    bodyFont: { family: CHART_THEME.fontFamily }
                }
            },
            scales: {
                x: {
                    grid: { color: CHART_THEME.gridColor },
                    ticks: { color: CHART_THEME.tickColor, font: { size: 10 } }
                },
                y: {
                    grid: { color: CHART_THEME.gridColor },
                    ticks: { color: CHART_THEME.tickColor }
                }
            }
        }
    });
}

// ============= TREND CHART =============
function renderTrendChart(draws, config) {
    const recentN = 30;
    const recent = draws.slice(-recentN);
    const labels = recent.map(d => d.period.slice(-3));
    const showLines = document.getElementById('showTrendLines')?.checked ?? true;

    // For digit lotteries, show each position as a separate line
    if (config.isDigit) {
        const positionColors = [
            'rgba(230, 57, 70, 0.9)',
            'rgba(42, 157, 143, 0.9)',
            'rgba(168, 85, 247, 0.9)',
            'rgba(244, 162, 97, 0.9)',
            'rgba(59, 130, 246, 0.9)'
        ];

        const datasets = [];
        for (let pos = 0; pos < config.mainCount; pos++) {
            datasets.push({
                label: `第${pos + 1}位`,
                data: recent.map(d => (d.main || [])[pos] ?? null),
                borderColor: positionColors[pos % positionColors.length],
                backgroundColor: positionColors[pos % positionColors.length].replace('0.9', '0.1'),
                borderWidth: 2,
                pointRadius: showLines ? 4 : 6,
                pointBackgroundColor: positionColors[pos % positionColors.length],
                showLine: showLines,
                tension: 0.3
            });
        }

        getOrCreateChart('chartTrend', {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: CHART_THEME.tickColor, font: { family: CHART_THEME.fontFamily } }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(10, 10, 26, 0.9)',
                        titleFont: { family: CHART_THEME.fontFamily },
                        bodyFont: { family: CHART_THEME.fontFamily }
                    }
                },
                scales: {
                    x: {
                        grid: { color: CHART_THEME.gridColor },
                        ticks: { color: CHART_THEME.tickColor, font: { size: 10 } }
                    },
                    y: {
                        grid: { color: CHART_THEME.gridColor },
                        ticks: { color: CHART_THEME.tickColor, stepSize: 1 },
                        min: 0,
                        max: 9
                    }
                }
            }
        });
        return;
    }

    // Pick-type lotteries - show each number as a dot, or connected lines
    // Simplified: show up to 6 selected numbers' trend lines
    const freq = Analysis.frequency(recent, config.mainRange, 'main', config);
    const topNums = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([n]) => parseInt(n));

    const lineColors = [
        'rgba(230, 57, 70, 0.9)',
        'rgba(42, 157, 143, 0.9)',
        'rgba(168, 85, 247, 0.9)',
        'rgba(244, 162, 97, 0.9)',
        'rgba(59, 130, 246, 0.9)'
    ];

    const datasets = topNums.map((num, i) => ({
        label: `号码 ${num}`,
        data: recent.map(d => (d.main || []).includes(num) ? num : null),
        borderColor: lineColors[i % lineColors.length],
        backgroundColor: lineColors[i % lineColors.length].replace('0.9', '0.3'),
        borderWidth: 2,
        pointRadius: recent.map(d => (d.main || []).includes(num) ? 6 : 0),
        pointBackgroundColor: lineColors[i % lineColors.length],
        showLine: showLines,
        spanGaps: false,
        tension: 0.1
    }));

    getOrCreateChart('chartTrend', {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: CHART_THEME.tickColor, font: { family: CHART_THEME.fontFamily } }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 26, 0.9)',
                    titleFont: { family: CHART_THEME.fontFamily },
                    bodyFont: { family: CHART_THEME.fontFamily }
                }
            },
            scales: {
                x: {
                    grid: { color: CHART_THEME.gridColor },
                    ticks: { color: CHART_THEME.tickColor, font: { size: 10 } }
                },
                y: {
                    grid: { color: CHART_THEME.gridColor },
                    ticks: { color: CHART_THEME.tickColor }
                }
            }
        }
    });
}

// ============= SUM TREND CHART =============
function renderSumTrendChart(draws, config) {
    const sums = Analysis.sumValues(draws, 'main', 30);

    getOrCreateChart('chartSumTrend', {
        type: 'line',
        data: {
            labels: sums.map(d => d.period.slice(-3)),
            datasets: [{
                label: '和值',
                data: sums.map(d => d.sum),
                borderColor: 'rgba(168, 85, 247, 0.8)',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                fill: true,
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: 'rgba(168, 85, 247, 1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 26, 0.9)',
                    titleFont: { family: CHART_THEME.fontFamily },
                    bodyFont: { family: CHART_THEME.fontFamily }
                }
            },
            scales: {
                x: {
                    grid: { color: CHART_THEME.gridColor },
                    ticks: { color: CHART_THEME.tickColor, font: { size: 10 } }
                },
                y: {
                    grid: { color: CHART_THEME.gridColor },
                    ticks: { color: CHART_THEME.tickColor }
                }
            }
        }
    });
}

// ============= ODD/EVEN CHART =============
function renderOddEvenChart(draws, config) {
    const ratios = Analysis.oddEvenRatio(draws, 'main', 50);
    const top5 = ratios.slice(0, 5);

    getOrCreateChart('chartOddEven', {
        type: 'doughnut',
        data: {
            labels: top5.map(r => `奇偶 ${r.ratio}`),
            datasets: [{
                data: top5.map(r => r.count),
                backgroundColor: [
                    'rgba(230, 57, 70, 0.7)',
                    'rgba(168, 85, 247, 0.7)',
                    'rgba(42, 157, 143, 0.7)',
                    'rgba(244, 162, 97, 0.7)',
                    'rgba(59, 130, 246, 0.7)'
                ],
                borderColor: 'rgba(10, 10, 26, 0.5)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: CHART_THEME.tickColor,
                        font: { family: CHART_THEME.fontFamily, size: 12 },
                        padding: 16
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 26, 0.9)',
                    titleFont: { family: CHART_THEME.fontFamily },
                    bodyFont: { family: CHART_THEME.fontFamily }
                }
            }
        }
    });
}

// ============= BIG/SMALL CHART =============
function renderBigSmallChart(draws, config) {
    const ratios = Analysis.bigSmallRatio(draws, config.mainRange, 'main', 50);
    const top5 = ratios.slice(0, 5);

    getOrCreateChart('chartBigSmall', {
        type: 'doughnut',
        data: {
            labels: top5.map(r => `大小 ${r.ratio}`),
            datasets: [{
                data: top5.map(r => r.count),
                backgroundColor: [
                    'rgba(244, 162, 97, 0.7)',
                    'rgba(42, 157, 143, 0.7)',
                    'rgba(236, 72, 153, 0.7)',
                    'rgba(59, 130, 246, 0.7)',
                    'rgba(168, 85, 247, 0.7)'
                ],
                borderColor: 'rgba(10, 10, 26, 0.5)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: CHART_THEME.tickColor,
                        font: { family: CHART_THEME.fontFamily, size: 12 },
                        padding: 16
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 26, 0.9)',
                    titleFont: { family: CHART_THEME.fontFamily },
                    bodyFont: { family: CHART_THEME.fontFamily }
                }
            }
        }
    });
}

// ============= SUM DISTRIBUTION CHART =============
function renderSumDistChart(draws, config) {
    const dist = Analysis.sumDistribution(draws, 'main', 100);

    getOrCreateChart('chartSumDist', {
        type: 'bar',
        data: {
            labels: dist.map(d => d.range),
            datasets: [{
                label: '出现次数',
                data: dist.map(d => d.count),
                backgroundColor: 'rgba(42, 157, 143, 0.7)',
                borderColor: 'rgba(42, 157, 143, 0.9)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 26, 0.9)',
                    titleFont: { family: CHART_THEME.fontFamily },
                    bodyFont: { family: CHART_THEME.fontFamily }
                }
            },
            scales: {
                x: {
                    grid: { color: CHART_THEME.gridColor },
                    ticks: { color: CHART_THEME.tickColor, font: { size: 10 }, maxRotation: 45 }
                },
                y: {
                    grid: { color: CHART_THEME.gridColor },
                    ticks: { color: CHART_THEME.tickColor }
                }
            }
        }
    });
}

// ============= SPAN DISTRIBUTION CHART =============
function renderSpanDistChart(draws, config) {
    const dist = Analysis.spanDistribution(draws, 'main', 100);

    getOrCreateChart('chartSpanDist', {
        type: 'bar',
        data: {
            labels: dist.map(d => d.span),
            datasets: [{
                label: '出现次数',
                data: dist.map(d => d.count),
                backgroundColor: 'rgba(236, 72, 153, 0.7)',
                borderColor: 'rgba(236, 72, 153, 0.9)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 26, 0.9)',
                    titleFont: { family: CHART_THEME.fontFamily },
                    bodyFont: { family: CHART_THEME.fontFamily }
                }
            },
            scales: {
                x: {
                    grid: { color: CHART_THEME.gridColor },
                    ticks: { color: CHART_THEME.tickColor }
                },
                y: {
                    grid: { color: CHART_THEME.gridColor },
                    ticks: { color: CHART_THEME.tickColor }
                }
            }
        }
    });
}
