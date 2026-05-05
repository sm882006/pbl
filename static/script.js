// ----- Header: Logo click → refresh and go to home -----
document.getElementById('header-logo').addEventListener('click', function(e) {
    e.preventDefault();
    window.location.href = '/';
});

// ----- Top 10 table (live) -----
// You will tell me the final target site later; change this template then.
// Default: CoinGecko coin page.
const EXTERNAL_COIN_URL_TEMPLATE = 'https://www.coingecko.com/en/coins/{id}';

function buildExternalCoinUrl(coinId) {
    return EXTERNAL_COIN_URL_TEMPLATE.replace('{id}', encodeURIComponent(coinId || ''));
}

//to show the money of crypto currency on website;
//in usd form;
function formatUsd(value, compact) {
    if (value == null || value === '') return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const fmt = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
        notation: compact ? 'compact' : 'standard',
        maximumFractionDigits: 2
    });
    return fmt.format(n);
}

function renderTop10(items) {
    const body = document.getElementById('top10-body');
    if (!body) return;
    body.innerHTML = '';

    if (!Array.isArray(items) || items.length === 0) {
        body.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No data available.</td></tr>';
        return;
    }

    items.forEach((it, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'crypto-row';
        tr.setAttribute('data-coin-id', it.id || '');

        const pct = (it.price_change_percentage_24h == null) ? null : Number(it.price_change_percentage_24h);
        const pctClass = (pct == null || !Number.isFinite(pct)) ? '' : (pct >= 0 ? 'pct-up' : 'pct-down');
        const pctText = (pct == null || !Number.isFinite(pct)) ? '—' : `${pct.toFixed(2)}%`;

        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>
                <span class="coin-cell">
                    ${it.image ? `<img class="coin-icon" src="${it.image}" alt="" />` : `<span class="coin-icon" aria-hidden="true"></span>`}
                    <span>${it.name || '—'}</span>
                </span>
            </td>
            <td>${it.symbol || '—'}</td>
            <td>${formatUsd(it.current_price, false)}</td>
            <td>${formatUsd(it.market_cap, true)}</td>
            <td>${formatUsd(it.total_volume, true)}</td>
            <td class="${pctClass}">${pctText}</td>
        `;

        tr.addEventListener('click', () => {
            const coinId = tr.getAttribute('data-coin-id');
            if (!coinId) return;
            const url = buildExternalCoinUrl(coinId);
            window.open(url, '_blank', 'noopener');
        });

        body.appendChild(tr);
    });
}

function loadTop10() {
    const err = document.getElementById('top10-error');
    if (err) err.classList.add('d-none');

    fetch('/top10')
        .then(async (r) => {
            const text = await r.text();
            let data;
            try { data = JSON.parse(text); } catch { data = {}; }
            if (!r.ok) throw new Error(data && data.error ? data.error : 'Failed to load top 10.');
            return data;
        })
        .then((data) => {
            renderTop10(data.items || []);
        })
        .catch((e) => {
            const body = document.getElementById('top10-body');
            if (body) body.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Could not load live market data.</td></tr>';
            if (err) {
                err.textContent = (e && e.message) ? e.message : 'Could not load live market data.';
                err.classList.remove('d-none');
            }
        });
}

let lastPrediction = null;

// Load top 10 on page load and wire buttons
document.addEventListener('DOMContentLoaded', function() {
    loadTop10();

    const buyBtn = document.getElementById('btn-buy-coin');
    if (buyBtn) {
        buyBtn.addEventListener('click', function() {
            const snapName = document.getElementById('snapshot-name');
            const coinId = snapName ? snapName.textContent.trim() : '';
            if (!coinId || coinId === '—') {
                const err = document.getElementById('error');
                if (err) {
                    err.textContent = 'Please search a coin first, then click Buy Coin.';
                    err.classList.remove('d-none');
                }
                return;
            }
            const url = buildExternalCoinUrl(coinId);
            window.open(url, '_blank', 'noopener');
        });
    }

    const pdfBtn = document.getElementById('btn-download-pdf');
    if (pdfBtn) {
        pdfBtn.addEventListener('click', function() {
            if (!lastPrediction) {
                const err = document.getElementById('error');
                if (err) {
                    err.textContent = 'Please predict a coin first, then download PDF.';
                    err.classList.remove('d-none');
                }
                return;
            }
            generateSnapshotPdf(lastPrediction);
        });
    }
});

// ----- Crypto form submit -----
document.getElementById('crypto-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const cryptoName = document.getElementById('crypto-name').value.trim();
    if (!cryptoName) return;

    const submitBtn = document.querySelector('#crypto-form button[type="submit"]');
    const originalBtnText = submitBtn.textContent;

    // Hide previous results/errors
    document.getElementById('results').classList.add('d-none');
    document.getElementById('error').classList.add('d-none');

    // Show loading state so user knows prediction has started
    submitBtn.disabled = true;
    submitBtn.textContent = 'Predicting... (this may take 1–2 minutes)';

    // Send POST request to /predict
    fetch('/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ crypto_name: cryptoName })
    })
    .then(async response => {
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error(response.ok ? 'Invalid response' : `Server error (${response.status}). Check the terminal running Flask.`);
        }
        return { ok: response.ok, data };
    })
    .then(({ ok, data }) => {
        if (!ok && data.error) {
            document.getElementById('error').textContent = data.error;
            document.getElementById('error').classList.remove('d-none');
            return;
        }
        if (data.error) {
            document.getElementById('error').textContent = data.error;
            document.getElementById('error').classList.remove('d-none');
            return;
        }
        // Update UI with results
        document.getElementById('current-price').textContent = data.current_price;
        document.getElementById('trend').textContent = data.trend;
        document.getElementById('trend').className = data.trend === 'Upward' ? 'badge bg-success' : 'badge bg-danger';

        // Draw "original" historical price graph (and optionally forecast)
        updatePriceChart(data, cryptoName);

        // Update "Market Snapshot" section
        const usd = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
        const usdCompact = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 });
        const snapName = document.getElementById('snapshot-name');
        const snapPrice = document.getElementById('snapshot-price');
        const snapMcap = document.getElementById('snapshot-market-cap');
        const snapVol = document.getElementById('snapshot-volume');
        const snapUpdated = document.getElementById('snapshot-updated');
        const snapTrend = document.getElementById('snapshot-trend');

        if (snapName) snapName.textContent = (data.crypto_id || cryptoName).toString();
        if (snapPrice) snapPrice.textContent = (data.current_price != null) ? usd.format(Number(data.current_price)) : '—';
        if (snapMcap) snapMcap.textContent = (data.market_cap != null) ? usdCompact.format(Number(data.market_cap)) : '—';
        if (snapVol) snapVol.textContent = (data.volume_24h != null) ? usdCompact.format(Number(data.volume_24h)) : '—';
        if (snapUpdated) {
            const ms = data.last_updated_ms != null ? Number(data.last_updated_ms) : null;
            snapUpdated.textContent = ms ? new Date(ms).toLocaleString() : '—';
        }
        if (snapTrend) {
            snapTrend.textContent = data.trend || '—';
            snapTrend.className = (data.trend === 'Upward') ? 'badge bg-success' : (data.trend === 'Downward') ? 'badge bg-danger' : 'badge bg-secondary';
        }

        const futureList = document.getElementById('future-list');
        futureList.innerHTML = '';
        const fc = Array.isArray(data.forecast_7d)
            ? data.forecast_7d
            : (() => {
                const out = [];
                if (data.predicted_today != null) out.push(data.predicted_today);
                if (Array.isArray(data.future_predictions)) out.push(...data.future_predictions);
                return out;
            })();
        fc.forEach((price, index) => {
            const li = document.createElement('li');
            li.textContent = `Day ${index + 1}: $${price}`;
            futureList.appendChild(li);
        });

        document.getElementById('results').classList.remove('d-none');

        // cache last prediction data for PDF generation
        lastPrediction = {
            cryptoId: data.crypto_id || cryptoName,
            historyDates: Array.isArray(data.history_dates) ? data.history_dates : [],
            historyPrices: Array.isArray(data.history_prices) ? data.history_prices : [],
            futurePredictions: Array.isArray(data.forecast_7d)
                ? data.forecast_7d
                : (Array.isArray(data.future_predictions) ? data.future_predictions : []),
            currentPrice: data.current_price,
            marketCap: data.market_cap,
            volume24h: data.volume_24h,
            lastUpdatedMs: data.last_updated_ms
        };
    })
    .catch(error => {
        const msg = error && error.message ? error.message : 'An error occurred. Please try again.';
        document.getElementById('error').textContent = msg;
        document.getElementById('error').classList.remove('d-none');
    })
    .finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
    });
});

// ----- Chart.js: historical ("original") price graph -----
let priceChart;

function buildFutureLabels(lastDateIso, days) {
    const labels = [];
    if (!lastDateIso) return labels;
    const base = new Date(lastDateIso + 'T00:00:00');
    if (Number.isNaN(base.getTime())) return labels;
    for (let i = 1; i <= days; i++) {
        const d = new Date(base);
        d.setDate(base.getDate() + i);
        labels.push(d.toISOString().slice(0, 10));
    }
    return labels;
}

function updatePriceChart(data, fallbackName) {
    const canvas = document.getElementById('priceChart');
    if (!canvas || typeof Chart === 'undefined') return;

    let dates = Array.isArray(data.history_dates) ? data.history_dates : [];
    let prices = Array.isArray(data.history_prices) ? data.history_prices : [];
    const coin = (data.crypto_id || fallbackName || '').toString();

    // Limit to last 30 days for display
    if (dates.length > 30) {
        const start = dates.length - 30;
        dates = dates.slice(start);
        prices = prices.slice(start);
    }

    const subtitle = document.getElementById('chart-subtitle');
    if (subtitle) subtitle.textContent = coin ? `${coin} • last 30 daily closes` : 'Last 30 daily closes';

    // Forecast (next 7 days) plotted as a dashed continuation
    const future = Array.isArray(data.forecast_7d)
        ? data.forecast_7d
        : ([]).concat(
            data.predicted_today != null ? [data.predicted_today] : [],
            Array.isArray(data.future_predictions) ? data.future_predictions : []
        );
    const lastDate = dates.length ? dates[dates.length - 1] : null;
    const futureLabels = buildFutureLabels(lastDate, Math.min(7, future.length));

    const allLabels = dates.concat(futureLabels);
    const histSeries = prices.concat(new Array(futureLabels.length).fill(null));
    const forecastSeries = new Array(Math.max(0, prices.length - 1)).fill(null)
        .concat(prices.length ? [prices[prices.length - 1]] : [null])
        .concat(future.slice(0, futureLabels.length));

    const gridColor = 'rgba(241, 245, 255, 0.12)';
    const tickColor = 'rgba(241, 245, 255, 0.75)';

    if (priceChart) {
        priceChart.data.labels = allLabels;
        priceChart.data.datasets[0].data = histSeries;
        priceChart.data.datasets[1].data = forecastSeries;
        priceChart.update();
        return;
    }

    priceChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: allLabels,
            datasets: [
                {
                    label: 'Historical',
                    data: histSeries,
                    borderColor: 'rgba(110, 231, 183, 0.95)',
                    backgroundColor: 'rgba(110, 231, 183, 0.12)',
                    tension: 0.25,
                    pointRadius: 0,
                    borderWidth: 2,
                    fill: true
                },
                {
                    label: 'Forecast (next 7 days)',
                    data: forecastSeries,
                    borderColor: 'rgba(96, 165, 250, 0.95)',
                    backgroundColor: 'rgba(96, 165, 250, 0.0)',
                    tension: 0.25,
                    pointRadius: 0,
                    borderWidth: 2,
                    borderDash: [6, 6],
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: tickColor }
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const v = ctx.parsed && ctx.parsed.y != null ? ctx.parsed.y : null;
                            if (v == null) return `${ctx.dataset.label}: —`;
                            const usd = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 6 });
                            return `${ctx.dataset.label}: ${usd.format(v)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: tickColor, maxTicksLimit: 8 },
                    grid: { color: gridColor }
                },
                y: {
                    ticks: { color: tickColor },
                    grid: { color: gridColor }
                }
            }
        }
    });
}

// ----- PDF generation for Market Snapshot -----
function generateSnapshotPdf(state) {
    const err = document.getElementById('error');
    const jsPdfLib = window.jspdf;
    if (!jsPdfLib || !jsPdfLib.jsPDF) {
        if (err) {
            err.textContent = 'PDF library not loaded. Please check your internet connection.';
            err.classList.remove('d-none');
        }
        return;
    }
    const { jsPDF } = jsPdfLib;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const coin = state.cryptoId || '';
    const title = `Crypto Report – ${coin || 'Unknown'}`;

    doc.setFontSize(16);
    doc.text(title, 10, 15);

    doc.setFontSize(11);
    doc.text('Market snapshot', 10, 25);

    const snapPrice = document.getElementById('snapshot-price')?.textContent || '';
    const snapMcap = document.getElementById('snapshot-market-cap')?.textContent || '';
    const snapVol = document.getElementById('snapshot-volume')?.textContent || '';
    const snapTrend = document.getElementById('snapshot-trend')?.textContent || '';
    const snapUpdated = document.getElementById('snapshot-updated')?.textContent || '';

    const lines = [
        `Currency: ${coin}`,
        `Current price: ${snapPrice}`,
        `Market cap: ${snapMcap}`,
        `24h volume: ${snapVol}`,
        `Trend (7d): ${snapTrend}`,
        `Last updated: ${snapUpdated}`
    ];

    let y = 32;
    lines.forEach((line) => {
        doc.text(line, 10, y);
        y += 6;
    });

    // Graph: reuse the on-screen Chart.js canvas so the user
    // gets exactly the same graph in the PDF.
    const chartCanvas = document.getElementById('priceChart');
    if (chartCanvas) {
        try {
            const imgData = chartCanvas.toDataURL('image/png');
            doc.setFontSize(11);
            doc.text('Price graph (current chart view)', 10, y + 2);
            doc.addImage(imgData, 'PNG', 10, y + 5, 190, 60);
            y += 70;
        } catch (e) {
            if (err) {
                err.textContent = 'Could not capture chart for PDF, but other data was exported.';
                err.classList.remove('d-none');
            }
        }
    }

    // Future predictable price of next 5 days
    const future = (state.futurePredictions || []).slice(0, 5);
    if (future.length) {
        doc.setFontSize(11);
        doc.text('Future predicted price (next 5 days)', 10, y + 5);
        y += 12;
        doc.setFontSize(10);
        future.forEach((price, idx) => {
            doc.text(`Day ${idx + 1}: $${price}`, 12, y);
            y += 6;
        });
    }

    doc.save(`${coin || 'crypto'}-report.pdf`);
}