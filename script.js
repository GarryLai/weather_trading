// 初始化圖表
const chartOptions = { 
    layout: { 
        textColor: '#d1d4dc', 
        background: { type: 'solid', color: '#131722' } 
    },
    grid: {
        vertLines: { color: '#2a2e39' },
        horzLines: { color: '#2a2e39' },
    },
    crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
    },
    timeScale: {
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        borderColor: '#2a2e39',
    },
    rightPriceScale: {
        visible: true,
        borderColor: '#2a2e39',
    },
    leftPriceScale: {
        visible: false,
        borderColor: '#2a2e39',
    }
};
const chart = LightweightCharts.createChart(document.getElementById('chart'), chartOptions);

let currentSeriesList = [];

// 設定日期輸入框的預設值為今天
const today = new Date().toISOString().split('T')[0];
document.getElementById('startDate').value = today;
document.getElementById('endDate').value = today;

let globalCache = {
    params: {},
    data: null
};

// 從 API 獲取資料
async function fetchData() {
    const dataType = document.getElementById('dataType').value;
    const city = document.getElementById('city').value;
    const forecastInterval = document.getElementById('forecastInterval').value;
    const startDateStr = document.getElementById('startDate').value;
    const endDateStr = document.getElementById('endDate').value;
    const intervalText = document.getElementById('interval').value;

    const currentParams = JSON.stringify({ dataType, city, forecastInterval, startDateStr, endDateStr, intervalText });

    if (globalCache.data && globalCache.params === currentParams) {
        return globalCache.data;
    }

    const searchBtn = document.getElementById('searchBtn');
    
    if (dataType === 'forecast') {
        const city = document.getElementById('city').value;
        const forecastInterval = document.getElementById('forecastInterval').value;
        
        searchBtn.innerText = '載入中...';
        searchBtn.disabled = true;

        try {
            const response = await fetch('https://cwaopendata.s3.ap-northeast-1.amazonaws.com/Forecast/F-C0032-005.json');
            if (!response.ok) throw new Error("API 發生錯誤");
            const data = await response.json();
            
            const location = data.cwaopendata.dataset.location.find(loc => loc.locationName === city);
            if (!location) throw new Error("找不到該縣市的預報資料");

            const maxTElement = location.weatherElement.find(el => el.elementName === 'MaxT');
            const minTElement = location.weatherElement.find(el => el.elementName === 'MinT');
            
            let result = [];
            
            if (maxTElement && minTElement) {
                if (forecastInterval === '6h') {
                    // 將每個時段組成資料
                    let prevMean = null;
                    for (let i = 0; i < maxTElement.time.length; i++) {
                        const maxTTime = maxTElement.time[i];
                        const minTTime = minTElement.time[i];
                        
                        const dt = new Date(maxTTime.startTime);
                        // 轉為 UNIX timestamp (s) 並加上 8 小時偏移以校正 Lightweight Charts 預設 UTC 顯示
                        const timeSec = (dt.getTime() / 1000) + 8 * 3600;
                        
                        const maxTemp = parseFloat(maxTTime.parameter.parameterName);
                        const minTemp = parseFloat(minTTime.parameter.parameterName);
                        const currentMean = (maxTemp + minTemp) / 2;
                        
                        let isRising = true;
                        if (prevMean !== null && currentMean < prevMean) {
                            isRising = false;
                        }
                        
                        result.push({
                            time: timeSec,
                            open: isRising ? minTemp : maxTemp,
                            high: maxTemp,
                            low: minTemp,
                            close: isRising ? maxTemp : minTemp,
                            value: currentMean
                        });
                        
                        prevMean = currentMean;
                    }
                } else if (forecastInterval === '1d') {
                    // 以日為單位匯總
                    const dailyData = {};
                    for (let i = 0; i < maxTElement.time.length; i++) {
                        const maxTTime = maxTElement.time[i];
                        const minTTime = minTElement.time[i];
                        
                        const dt = new Date(maxTTime.startTime);
                        // 取當地時間的日期 (YYYY-MM-DD)
                        const dateString = new Date(dt.getTime() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
                        
                        const maxTemp = parseFloat(maxTTime.parameter.parameterName);
                        const minTemp = parseFloat(minTTime.parameter.parameterName);
                        
                        if (!dailyData[dateString]) {
                            // 設定為該日 00:00 的時間戳
                            const dayStartDt = new Date(dt.getTime() + 8 * 60 * 60 * 1000);
                            dayStartDt.setUTCHours(0, 0, 0, 0);
                            const dayTimeSec = ((dayStartDt.getTime() - 8 * 60 * 60 * 1000) / 1000) + 8 * 3600;
                            
                            dailyData[dateString] = {
                                time: dayTimeSec,
                                open: minTemp,
                                high: maxTemp,
                                low: minTemp,
                                close: maxTemp
                            };
                        } else {
                            dailyData[dateString].high = Math.max(dailyData[dateString].high, maxTemp);
                            dailyData[dateString].low = Math.min(dailyData[dateString].low, minTemp);
                        }
                    }
                    
                    let prevMean = null;
                    const sortedKeys = Object.keys(dailyData).sort();
                    for (let key of sortedKeys) {
                        const d = dailyData[key];
                        const currentMean = (d.high + d.low) / 2;
                        
                        let isRising = true;
                        if (prevMean !== null && currentMean < prevMean) {
                            isRising = false;
                        }
                        
                        d.open = isRising ? d.low : d.high;
                        d.close = isRising ? d.high : d.low;
                        d.value = currentMean;
                        
                        result.push(d);
                        prevMean = currentMean;
                    }
                }
            }

            searchBtn.innerText = '查詢資料';
            searchBtn.disabled = false;
            
            globalCache.params = currentParams;
            globalCache.data = result.sort((a, b) => a.time - b.time);
            return globalCache.data;
            
        } catch (err) {
            alert(err.message);
            searchBtn.innerText = '查詢資料';
            searchBtn.disabled = false;
            return [];
        }
    } else if (dataType === 'openweathermap') {
        const cityStr = document.getElementById('city').value;
        const forecastInterval = document.getElementById('forecastInterval').value;
        const apiKey = 'bd5e378503939ddaee76f12ad7a97608';
        
        searchBtn.innerText = '載入中...';
        searchBtn.disabled = true;

        try {
            let result = [];
            
            if (forecastInterval === '1d') {
                const resp = await fetch(`https://api.openweathermap.org/data/2.5/forecast/daily?q=${encodeURIComponent(cityStr)},TW&units=metric&cnt=16&appid=${apiKey}&lang=zh_tw`);
                if (!resp.ok) throw new Error("OpenWeatherMap Daily API 錯誤");
                const data = await resp.json();
                
                let prevMean = null;
                for (let i = 0; i < data.list.length; i++) {
                    const item = data.list[i];
                    // dt 為 UTC timestamp
                    const timeSec = item.dt + 8 * 3600; 
                    
                    const maxTemp = item.temp.max;
                    const minTemp = item.temp.min;
                    const currentMean = item.temp.day;
                    
                    let isRising = true;
                    if (prevMean !== null && currentMean < prevMean) isRising = false;
                    
                    result.push({
                        time: timeSec,
                        open: isRising ? minTemp : maxTemp,
                        high: maxTemp,
                        low: minTemp,
                        close: isRising ? maxTemp : minTemp,
                        value: currentMean
                    });
                    prevMean = currentMean;
                }
            }

            searchBtn.innerText = '查詢資料';
            searchBtn.disabled = false;
            
            globalCache.params = currentParams;
            globalCache.data = result.sort((a, b) => a.time - b.time);
            return globalCache.data;
            
        } catch (err) {
            alert(err.message);
            searchBtn.innerText = '查詢資料';
            searchBtn.disabled = false;
            return [];
        }
    }

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    
    if (start > end) {
        alert("開始日期不能晚於結束日期！");
        return [];
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    let totalDays = Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
    let currentStart = new Date(start);
    let combinedRawData = [];

    // 處理超過 45 天需拆包 (平行查詢)
    let loader = document.getElementById('loadingOverlay');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'loadingOverlay';
        loader.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:rgba(19, 23, 34, 0.9);padding:20px;border-radius:8px;border:1px solid #2a2e39;color:#d1d4dc;font-weight:bold;text-align:center;min-width:250px;box-shadow: 0 4px 12px rgba(0,0,0,0.5);';
        document.getElementById('chartWorkspace').appendChild(loader);
    }
    loader.style.display = 'block';
    loader.innerHTML = '載入中... (0%) <div style="width:100%;height:6px;background:#2a2e39;margin-top:10px;border-radius:3px;overflow:hidden"><div style="width:0%;height:100%;background:#2962FF;transition:width 0.2s"></div></div>';

    try {
        const fetchPromises = [];
        let tempTotalDays = totalDays;
        let tempCurrentStart = new Date(currentStart);
        
        const totalChunks = Math.ceil(tempTotalDays / 45);
        let completedChunks = 0;

        while (tempTotalDays > 0) {
            const requestDays = Math.min(tempTotalDays, 45);
            const timeStr = tempCurrentStart.toISOString().split('T')[0];
            
            const requestPromise = fetch(`https://pblap.ppp503.workers.dev/?mode=sfc&time=${timeStr}&days=${requestDays}&stno=10`)
                .then(res => {
                    if (!res.ok) throw new Error("API 發生錯誤");
                    return res.json();
                })
                .then(data => {
                    completedChunks++;
                    const percent = Math.round((completedChunks / totalChunks) * 100);
                    loader.innerHTML = `載入中... (${percent}%) <div style="width:100%;height:6px;background:#2a2e39;margin-top:10px;border-radius:3px;overflow:hidden"><div style="width:${percent}%;height:100%;background:#2962FF;transition:width 0.2s"></div></div>`;
                    return data;
                });
            fetchPromises.push(requestPromise);

            tempTotalDays -= requestDays;
            if (tempTotalDays > 0) {
                tempCurrentStart = new Date(tempCurrentStart.getTime() + requestDays * msPerDay);
            }
        }

        const results = await Promise.all(fetchPromises);
        results.forEach(rawData => {
            if (Array.isArray(rawData)) {
                combinedRawData = combinedRawData.concat(rawData);
            }
        });
    } catch (err) {
        alert(err.message);
    } finally {
        if (loader) loader.style.display = 'none';
    }

    searchBtn.innerText = '查詢資料';
    searchBtn.disabled = false;
    
    const groupedData = {};
    
    combinedRawData.forEach(d => {
        // Some records might have null temp but valid precipitation, so we process it unconditionally.
        const dt = new Date(d.datetime);
        // 基礎時間轉為本地 timezone +8 的絕對毫秒偏移量，方便進行日/時分組
        const utcMs = dt.getTime();
        const offsetMs = 8 * 60 * 60 * 1000;
        const localMs = utcMs + offsetMs; 
        
        let bucketMs;
        if (intervalText === '1m') {
            bucketMs = localMs - (localMs % (60 * 1000));
        } else if (intervalText === '1h') {
            bucketMs = localMs - (localMs % (60 * 60 * 1000));
        } else if (intervalText === '4h') {
            bucketMs = localMs - (localMs % (4 * 60 * 60 * 1000));
        } else if (intervalText === '1d') {
            // 每日早上 8 點開盤 (收盤為隔日 07:59)
            // 把時間減去 8 小時，讓 08:00 對齊到當日 00:00 來取模
            const shiftedMs = localMs - (8 * 60 * 60 * 1000);
            const dayMs = shiftedMs - (shiftedMs % (24 * 60 * 60 * 1000));
            // 取回實際的 Bucket 開始時間 (+8hr)
            bucketMs = dayMs + (8 * 60 * 60 * 1000);
        } else if (intervalText === '1mo') {
            // 每月1日 8 點開盤
            const shiftedDt = new Date(localMs - (8 * 60 * 60 * 1000));
            shiftedDt.setUTCDate(1);
            shiftedDt.setUTCHours(0, 0, 0, 0);
            bucketMs = shiftedDt.getTime() + (8 * 60 * 60 * 1000);
        }

        // 轉回 UTC timestamp 取出真實 unix 豪秒數
        const trueUtcMs = bucketMs - offsetMs;

        if (!groupedData[trueUtcMs]) {
            groupedData[trueUtcMs] = {
                time: (trueUtcMs / 1000) + 8 * 3600,
                open: d.temp,
                high: d.temp,
                low: d.temp,
                close: d.temp,
                value: d.temp,  // 折線圖用
                
                // RH K線
                rh_open: d.rh, rh_high: d.rh, rh_low: d.rh, rh_close: d.rh,
                rh_val: d.rh,
                
                wd_val: d.wd,
                
                // WS K線
                ws_open: d.ws, ws_high: d.ws, ws_low: d.ws, ws_close: d.ws,
                ws_val: d.ws,
                
                // P K線
                p_open: d.p, p_high: d.p, p_low: d.p, p_close: d.p,
                p_val: d.p,
                
                pr_sum: (typeof d.pr === 'number' && !isNaN(d.pr)) ? d.pr : 0,
                sr_val: d.sr
            };
        } else {
            let g = groupedData[trueUtcMs];
            if (d.temp !== null) {
                if (g.open === null || g.open === undefined) g.open = d.temp;
                g.high = Math.max(g.high ?? -Infinity, d.temp);
                g.low = Math.min(g.low ?? Infinity, d.temp);
                g.close = d.temp;
                g.value = d.temp;
            }
            if (d.rh !== null) {
                if (g.rh_open === null || g.rh_open === undefined) g.rh_open = d.rh;
                g.rh_high = Math.max(g.rh_high ?? -Infinity, d.rh);
                g.rh_low = Math.min(g.rh_low ?? Infinity, d.rh);
                g.rh_close = d.rh;
                g.rh_val = d.rh;
            }
            if (d.wd !== null) g.wd_val = d.wd;
            if (d.ws !== null) {
                if (g.ws_open === null || g.ws_open === undefined) g.ws_open = d.ws;
                g.ws_high = Math.max(g.ws_high ?? -Infinity, d.ws);
                g.ws_low = Math.min(g.ws_low ?? Infinity, d.ws);
                g.ws_close = d.ws;
                g.ws_val = d.ws;
            }
            if (d.p !== null) {
                if (g.p_open === null || g.p_open === undefined) g.p_open = d.p;
                g.p_high = Math.max(g.p_high ?? -Infinity, d.p);
                g.p_low = Math.min(g.p_low ?? Infinity, d.p);
                g.p_close = d.p;
                g.p_val = d.p;
            }
            if (typeof d.pr === 'number' && !isNaN(d.pr)) {
                g.pr_sum = (g.pr_sum || 0) + d.pr;
            }
            if (d.sr !== null) g.sr_val = d.sr;
        }
    });
    
    // 排序並提取出轉換後的 K 線 Array
    const data = Object.values(groupedData).sort((a, b) => a.time - b.time);
    
    globalCache.params = currentParams;
    globalCache.data = data;
    return data;
}

async function updateChart() {
    const chartType = document.getElementById('chartStyle').value;
    const interval = document.getElementById('interval').value;

    if (currentSeriesList && currentSeriesList.length > 0) {
        currentSeriesList.forEach(series => chart.removeSeries(series));
    }
    currentSeriesList = [];

    const data = await fetchData(interval);

    // Some non-temperature arrays just need specific values. We map them and filter out nulls/undefineds to prevent lightweight-charts from crashing.
    if (chartType === 'candlestick') {
        const series = chart.addCandlestickSeries({
            upColor: '#ef5350',
            downColor: '#26a69a',
            borderVisible: false,
            wickUpColor: '#ef5350',
            wickDownColor: '#26a69a',
            priceScaleId: 'right'
        });
        series.setData(data.filter(d => d.open !== undefined && d.open !== null));
        currentSeriesList.push(series);
    } else if (chartType === 'line') {
        const series = chart.addLineSeries({ color: '#2962FF', lineWidth: 2, priceScaleId: 'right' });
        series.setData(data.filter(d => d.value !== undefined && d.value !== null).map(d => ({ time: d.time, value: d.value })));
        currentSeriesList.push(series);
    } else if (chartType === 'candlestick_rh') {
        const series = chart.addCandlestickSeries({
            upColor: '#ef5350',
            downColor: '#26a69a',
            borderVisible: false,
            wickUpColor: '#ef5350',
            wickDownColor: '#26a69a',
            priceScaleId: 'right',
            title: '相對濕度 (%)'
        });
        series.setData(data.filter(d => d.rh_open !== undefined && d.rh_open !== null).map(d => ({
            time: d.time,
            open: d.rh_open,
            high: d.rh_high,
            low: d.rh_low,
            close: d.rh_close
        })));
        currentSeriesList.push(series);
    } else if (chartType === 'candlestick_ws') {
        const series = chart.addCandlestickSeries({
            upColor: '#ef5350',
            downColor: '#26a69a',
            borderVisible: false,
            wickUpColor: '#ef5350',
            wickDownColor: '#26a69a',
            priceScaleId: 'right',
            title: '風速 (m/s)'
        });
        series.setData(data.filter(d => d.ws_open !== undefined && d.ws_open !== null).map(d => ({
            time: d.time,
            open: d.ws_open,
            high: d.ws_high,
            low: d.ws_low,
            close: d.ws_close
        })));
        currentSeriesList.push(series);
    } else if (chartType === 'candlestick_p') {
        const series = chart.addCandlestickSeries({
            upColor: '#ef5350',
            downColor: '#26a69a',
            borderVisible: false,
            wickUpColor: '#ef5350',
            wickDownColor: '#26a69a',
            priceScaleId: 'right',
            title: '氣壓 (hPa)'
        });
        series.setData(data.filter(d => d.p_open !== undefined && d.p_open !== null).map(d => ({
            time: d.time,
            open: d.p_open,
            high: d.p_high,
            low: d.p_low,
            close: d.p_close
        })));
        currentSeriesList.push(series);
    } else if (chartType === 'rh') {
        const series = chart.addLineSeries({ color: '#00BCD4', lineWidth: 2, title: '相對濕度 (%)', priceScaleId: 'right' });
        series.setData(data.filter(d => d.rh_val !== undefined && d.rh_val !== null).map(d => ({ time: d.time, value: d.rh_val })));
        currentSeriesList.push(series);
    } else if (chartType === 'ws_wd') {
        chart.priceScale('left').applyOptions({ visible: true, borderColor: '#71649C' });
        
        const wsSeries = chart.addLineSeries({ color: '#FF5252', lineWidth: 2, title: '風速 (m/s)', priceScaleId: 'right' });
        wsSeries.setData(data.filter(d => d.ws_val !== undefined && d.ws_val !== null).map(d => ({ time: d.time, value: d.ws_val })));
        currentSeriesList.push(wsSeries);

        const wdSeries = chart.addLineSeries({ color: '#888888', lineWidth: 1, title: '風向 (°)', priceScaleId: 'left' });
        wdSeries.setData(data.filter(d => d.wd_val !== undefined && d.wd_val !== null).map(d => ({ time: d.time, value: d.wd_val })));
        currentSeriesList.push(wdSeries);
    } else if (chartType === 'p') {
        const series = chart.addLineSeries({ color: '#FF9800', lineWidth: 2, title: '氣壓 (hPa)', priceScaleId: 'right' });
        series.setData(data.filter(d => d.p_val !== undefined && d.p_val !== null).map(d => ({ time: d.time, value: d.p_val })));
        currentSeriesList.push(series);
    } else if (chartType === 'pr') {
        const series = chart.addHistogramSeries({ color: '#2196F3', title: '累積降雨 (mm)', priceScaleId: 'right' });
        series.setData(data.filter(d => d.pr_sum !== undefined && d.pr_sum !== null).map(d => ({ time: d.time, value: parseFloat(d.pr_sum.toFixed(2)) })));
        currentSeriesList.push(series);
    } else if (chartType === 'sr') {
        const series = chart.addAreaSeries({ lineColor: '#FFC107', topColor: 'rgba(255, 193, 7, 0.4)', bottomColor: 'rgba(255, 193, 7, 0.0)', title: '太陽輻射 (W/m²)', priceScaleId: 'right' });
        series.setData(data.filter(d => d.sr_val !== undefined && d.sr_val !== null).map(d => ({ time: d.time, value: d.sr_val })));
        currentSeriesList.push(series);
    }
    
    // Hide left axis if not drawing ws_wd
    if (chartType !== 'ws_wd') {
        chart.priceScale('left').applyOptions({ visible: false });
    }
    
    chart.timeScale().fitContent();
}

// 監聽變更與點擊事件
document.getElementById('dataType').addEventListener('change', () => {
    const dataType = document.getElementById('dataType').value;
    const isForecast = dataType === 'forecast' || dataType === 'openweathermap';
    
    // 依據資料來源動態調整預報區間選單
    const forecastIntervalSelect = document.getElementById('forecastInterval');
    Array.from(forecastIntervalSelect.options).forEach(opt => {
        if (dataType === 'openweathermap') {
            opt.style.display = opt.value === '6h' ? 'none' : 'block';
        } else {
            opt.style.display = 'block';
        }
    });
    
    if (dataType === 'openweathermap' && forecastIntervalSelect.value === '6h') forecastIntervalSelect.value = '1d';

    // 切換顯示狀態，使用 Bootstrap 的 d-none 取代寫死的 style.display
    const cityWrapper = document.getElementById('cityWrapper');
    const forecastIntervalWrapper = document.getElementById('forecastIntervalWrapper');
    const obsElements = document.querySelectorAll('.obs-only');
    
    if (isForecast) {
        cityWrapper.classList.remove('d-none');
        forecastIntervalWrapper.classList.remove('d-none');
        obsElements.forEach(el => el.classList.add('d-none'));
        
        // Reset unsupported chart types for forecast
        if (document.getElementById('weatherVariable').value !== 'temp') {
            document.getElementById('weatherVariable').value = 'temp';
            updateChartStyleOptions();
        }
        
        const cType = document.getElementById('chartStyle').value;
        if (cType !== 'candlestick' && cType !== 'line') {
            document.getElementById('chartStyle').value = 'line';
        }
    } else {
        cityWrapper.classList.add('d-none');
        forecastIntervalWrapper.classList.add('d-none');
        obsElements.forEach(el => el.classList.remove('d-none'));
    }
    
    updateChart();
});

const chartStyleOptions = {
    temp: [
        { value: 'candlestick', text: 'K線 (高/低/開/收)' },
        { value: 'line', text: '折線 (平均溫度)' }
    ],
    rh: [
        { value: 'candlestick_rh', text: 'K線 (高/低/開/收)' },
        { value: 'rh', text: '折線 (相對濕度)' }
    ],
    ws: [
        { value: 'candlestick_ws', text: 'K線 (風速)' },
        { value: 'ws_wd', text: '雙軸 (風向與風速)' }
    ],
    p: [
        { value: 'candlestick_p', text: 'K線 (高/低/開/收)' },
        { value: 'p', text: '折線 (平均氣壓)' }
    ],
    pr: [
        { value: 'pr', text: '直方圖' }
    ],
    sr: [
        { value: 'sr', text: '面積圖' }
    ]
};

function updateChartStyleOptions() {
    const weatherVariable = document.getElementById('weatherVariable').value;
    const chartStyleSelect = document.getElementById('chartStyle');
    const previousStyle = chartStyleSelect.value;
    
    chartStyleSelect.innerHTML = '';
    const options = chartStyleOptions[weatherVariable] || chartStyleOptions['temp'];
    
    let optionsHasPreviousValue = false;

    options.forEach(opt => {
        const optionEl = document.createElement('option');
        optionEl.value = opt.value;
        optionEl.innerText = opt.text;
        chartStyleSelect.appendChild(optionEl);
        
        if (opt.value === previousStyle) optionsHasPreviousValue = true;
    });

    if (optionsHasPreviousValue) {
        chartStyleSelect.value = previousStyle;
    } else {
        // Fallback: try to select a K-line if we were on one, else select first option
        const isCandlestickPref = previousStyle && previousStyle.startsWith('candlestick');
        if (isCandlestickPref) {
            const fallbackCandlestick = options.find(o => o.value.startsWith('candlestick'));
            if (fallbackCandlestick) {
                chartStyleSelect.value = fallbackCandlestick.value;
            } else {
                chartStyleSelect.value = options[0].value;
            }
        } else {
            chartStyleSelect.value = options[0].value;
        }
    }
}

document.getElementById('weatherVariable').addEventListener('change', () => {
    updateChartStyleOptions();
    updateChart();
});

document.getElementById('city').addEventListener('change', updateChart);
document.getElementById('forecastInterval').addEventListener('change', updateChart);
document.getElementById('chartStyle').addEventListener('change', updateChart);
document.getElementById('interval').addEventListener('change', updateChart);
document.getElementById('searchBtn').addEventListener('click', updateChart);

// 監聽日期輸入框的 Enter 鍵事件
['startDate', 'endDate'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            updateChart();
        }
    });
});

// 處理視窗大小與容器改變
const chartContainer = document.getElementById('chart');
const resizeObserver = new ResizeObserver(entries => {
    if (entries.length === 0 || entries[0].target !== chartContainer) return;
    const newRect = entries[0].contentRect;
    chart.applyOptions({ width: newRect.width, height: newRect.height });
});
resizeObserver.observe(chartContainer);

// 日期按鈕功能
function updateDateButtonsState() {
    const endDateInput = document.getElementById('endDate');
    if (!endDateInput.value) return;

    const endDate = new Date(endDateInput.value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    const nextDayBtn = document.getElementById('nextDayBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');

    // 若結束日期大於或等於今天，停用「後日」按鈕
    nextDayBtn.disabled = endDate.getTime() >= today.getTime();

    // 若結束日期加上一個月後會超過今天，停用「下月」按鈕
    const nextMonthExpected = new Date(endDate);
    nextMonthExpected.setMonth(nextMonthExpected.getMonth() + 1);
    nextMonthBtn.disabled = nextMonthExpected.getTime() > today.getTime();
}

function adjustDate(dayDiff, monthDiff) {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    if (!startDateInput.value || !endDateInput.value) return;

    let start = new Date(startDateInput.value);
    let end = new Date(endDateInput.value);
    
    start.setMonth(start.getMonth() + monthDiff);
    start.setDate(start.getDate() + dayDiff);
    
    end.setMonth(end.getMonth() + monthDiff);
    end.setDate(end.getDate() + dayDiff);
    
    // 轉回 YYYY-MM-DD
    startDateInput.value = start.toISOString().split('T')[0];
    endDateInput.value = end.toISOString().split('T')[0];
    
    updateDateButtonsState();
    updateChart();
}

document.getElementById('prevMonthBtn').addEventListener('click', () => adjustDate(0, -1));
document.getElementById('prevDayBtn').addEventListener('click', () => adjustDate(-1, 0));
document.getElementById('todayBtn').addEventListener('click', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('startDate').value = todayStr;
    document.getElementById('endDate').value = todayStr;
    updateDateButtonsState();
    updateChart();
});
document.getElementById('nextDayBtn').addEventListener('click', () => adjustDate(1, 0));
document.getElementById('nextMonthBtn').addEventListener('click', () => adjustDate(0, 1));

['startDate', 'endDate'].forEach(id => {
    document.getElementById(id).addEventListener('change', updateDateButtonsState);
});

// 初始渲染
updateDateButtonsState();
updateChartStyleOptions();
updateChart();

// 根據選項更新左上角的標題
function updateChartTitle() {
    const titleEl = document.getElementById('chartSymbolTitle');
    if (!titleEl) return;
    
    const dataType = document.getElementById('dataType').value;
    const city = document.getElementById('city').value;
    
    if (dataType === 'observation') {
        titleEl.innerText = 'PBLAP 觀測';
    } else if (dataType === 'forecast') {
        titleEl.innerText = `${city} (CWA)`;
    } else if (dataType === 'openweathermap') {
        titleEl.innerText = `${city} (OWM)`;
    }
}

document.getElementById('dataType').addEventListener('change', updateChartTitle);
document.getElementById('city').addEventListener('change', updateChartTitle);
updateChartTitle();

// --- 新增功能按鈕實作 ---

// 全螢幕切換
document.getElementById('fullscreenBtn')?.addEventListener('click', () => {
    const workspace = document.documentElement; // 放大整個畫面
    if (!document.fullscreenElement) {
        workspace.requestFullscreen().catch(err => {
            console.error("無法進入全螢幕:", err);
        });
        document.getElementById('fullscreenBtn').innerHTML = '<i class="bi bi-fullscreen-exit"></i>';
    } else {
        document.exitFullscreen();
        document.getElementById('fullscreenBtn').innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';
    }
});

// 圖表截圖分享
document.getElementById('screenshotBtn')?.addEventListener('click', () => {
    if (!chart) return;
    const canvas = chart.takeScreenshot();
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    const symbol = document.getElementById('chartSymbolTitle').innerText.replace(/\s+/g, '_');
    const ts = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    a.download = `WeatherChart_${symbol}_${ts}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

// 自動縮放 (auto 按鈕)
document.getElementById('autoScaleBtn')?.addEventListener('click', () => {
    if (chart) {
        chart.timeScale().fitContent();
    }
});

// 底部時間範圍切換 (1D, 5D, 1M...)
document.querySelectorAll('.time-range-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const dataType = document.getElementById('dataType').value;
        if (dataType !== 'observation') {
            alert("「時間跨度按鈕」目前僅適用於『觀測 (PBLAP)』模式！如需更改預報日期，請使用上方選單。");
            return;
        }

        // 切換按鈕的 Active Styling
        document.querySelectorAll('.time-range-btn').forEach(b => {
            b.classList.remove('text-primary');
            b.style.opacity = '0.75';
        });
        e.target.classList.add('text-primary');
        e.target.style.opacity = '1';

        const range = e.target.getAttribute('data-range');
        const endDateInput = document.getElementById('endDate');
        const startDateInput = document.getElementById('startDate');
        
        let end = new Date();
        endDateInput.value = end.toISOString().split('T')[0];
        
        let start = new Date(end);
        
        switch(range) {
            case '1D': break;                 // 今天
            case '5D': start.setDate(start.getDate() - 4); break;
            case '1M': start.setMonth(start.getMonth() - 1); break;
            case '3M': start.setMonth(start.getMonth() - 3); break;
            case '6M': start.setMonth(start.getMonth() - 6); break;
            case 'YTD': start = new Date(start.getFullYear(), 0, 1); break;
            case '1Y': start.setFullYear(start.getFullYear() - 1); break;
            case '5Y': start.setFullYear(start.getFullYear() - 5); break;
            case 'All': start = new Date('2015-01-01'); break; // 假設的最早資料點
        }
        
        startDateInput.value = start.toISOString().split('T')[0];
        
        // 根據時間長度自動調整統計區間(Interval)，避免資料點過多卡頓
        const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
        const intervalInput = document.getElementById('interval');
        if (daysDiff > 365) {
            intervalInput.value = '1mo'; // 1年甚至更久用月
        } else if (daysDiff > 180) {
            intervalInput.value = '1d';  // 半年用每日
        } else if (daysDiff > 31) {
            intervalInput.value = '4h';  // 幾個月內用4小時
        } else if (daysDiff > 5) {
            intervalInput.value = '1h';  // 幾週內用1小時
        } else {
            intervalInput.value = '1m';  // 5天以內用分鐘
        }
        
        updateChart();
    });
});

// 當 interval 改變時，動態更新左上角的文字 (例： 1h, 1D...)
function updateSymbolIntervalText() {
    const intervalEl = document.getElementById('chartSymbolInterval');
    const dataType = document.getElementById('dataType').value;
    if (intervalEl) {
        if (dataType === 'observation') {
            const select = document.getElementById('interval');
            intervalEl.innerText = select.options[select.selectedIndex].innerText;
        } else {
            const select = document.getElementById('forecastInterval');
            intervalEl.innerText = select.options[select.selectedIndex].innerText;
        }
    }
}

document.getElementById('dataType').addEventListener('change', updateSymbolIntervalText);
document.getElementById('interval').addEventListener('change', updateSymbolIntervalText);
document.getElementById('forecastInterval').addEventListener('change', updateSymbolIntervalText);

// 延遲執行一次初始化文字
setTimeout(updateSymbolIntervalText, 100);


// --- 繪圖功能實作 (Overlay Canvas) ---
let drawingMode = 'cursor';
let drawings = [];
let ongoingDrawing = null;
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');

function syncCanvasSize() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    redrawCanvas();
}
window.addEventListener('resize', syncCanvasSize);
setTimeout(syncCanvasSize, 500);

document.querySelectorAll('.drawing-tool').forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Reset all buttons
        document.querySelectorAll('.drawing-tool').forEach(b => {
            b.classList.remove('text-primary');
            b.classList.add('text-secondary');
        });
        // Set active button
        e.currentTarget.classList.remove('text-secondary');
        e.currentTarget.classList.add('text-primary');

        drawingMode = e.currentTarget.getAttribute('data-tool');
        
        // Enable/Disable canvas interaction
        if (drawingMode === 'cursor') {
            canvas.style.pointerEvents = 'none';
        } else {
            canvas.style.pointerEvents = 'auto'; // 啟用畫布操作，將攔截圖表滾動
        }
    });
});

document.getElementById('clearDrawingsBtn').addEventListener('click', () => {
    drawings = [];
    ongoingDrawing = null;
    redrawCanvas();
});

chart.timeScale().subscribeVisibleLogicalRangeChange(() => redrawCanvas());
chart.subscribeCrosshairMove(() => redrawCanvas());

// 繪圖事件
let isDrawing = false;

canvas.addEventListener('mousedown', (e) => {
    if (drawingMode === 'cursor') return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const activeSeries = currentSeriesList[0];
    if (!activeSeries) return;

    const time = chart.timeScale().coordinateToLogical(x);
    const price = activeSeries.coordinateToPrice(y);
    if (time === null || price === null) return;
    
    isDrawing = true;

    if (drawingMode === 'line') {
        ongoingDrawing = { type: 'line', points: [{time, price}, {time, price}] };
    } else if (drawingMode === 'pencil') {
        ongoingDrawing = { type: 'pencil', points: [{time, price}] };
    } else if (drawingMode === 'ruler') {
        ongoingDrawing = { type: 'ruler', start: {time, price}, end: {time, price}, startPt:{x, y}, endPt:{x, y} };
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing || !ongoingDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const activeSeries = currentSeriesList[0];
    if (!activeSeries) return;

    const time = chart.timeScale().coordinateToLogical(x);
    const price = activeSeries.coordinateToPrice(y);
    if (time === null || price === null) return;

    if (drawingMode === 'line') {
        ongoingDrawing.points[1] = {time, price};
    } else if (drawingMode === 'pencil') {
        ongoingDrawing.points.push({time, price});
    } else if (drawingMode === 'ruler') {
        ongoingDrawing.end = {time, price};
        ongoingDrawing.endPt = {x, y};
    }
    redrawCanvas();
});

canvas.addEventListener('mouseup', () => {
    if (isDrawing && ongoingDrawing) {
        drawings.push(ongoingDrawing);
        ongoingDrawing = null;
    }
    isDrawing = false;
    redrawCanvas();
});

canvas.addEventListener('mouseleave', () => {
    if (isDrawing && ongoingDrawing) {
        drawings.push(ongoingDrawing);
        ongoingDrawing = null;
    }
    isDrawing = false;
    redrawCanvas();
});

function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const activeSeries = currentSeriesList[0];
    if (!activeSeries) return;

    drawings.forEach(d => renderShape(d, activeSeries, ctx));
    if (ongoingDrawing) renderShape(ongoingDrawing, activeSeries, ctx);
}


function formatLogicalToDateStr(logical) {
    if (!globalCache.data || globalCache.data.length === 0) return '';
    const idx = Math.max(0, Math.min(globalCache.data.length - 1, Math.round(logical)));
    const d = globalCache.data[idx];
    if (!d) return '';
    // 將調整過的 unix time 轉回當地字串
    const date = new Date((d.time - 8 * 3600) * 1000);
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const HH = date.getHours().toString().padStart(2, '0');
    const mm_time = date.getMinutes().toString().padStart(2, '0');
    // 如果是 00:00 可省略，但簡單起見全顯示
    return `${mm}/${dd} ${HH}:${mm_time}`;
}

function drawAxisHighlight(ctx, p1, p2, cx1, cy1, cx2, cy2, baseColor) {
    // 基礎參數
    const xMin = Math.min(cx1, cx2);
    const xMax = Math.max(cx1, cx2);
    const yMin = Math.min(cy1, cy2);
    const yMax = Math.max(cy1, cy2);
    const rightAxisW = 56;  // 預設坐標軸的寬度預估值
    const bottomAxisH = 26; // 預設時間軸的高度預估值

    // 1. 畫出對應到座標軸的虛線
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 1;

    // Y 軸對齊線 (往右畫到底)
    ctx.moveTo(cx1, cy1); ctx.lineTo(canvas.width, cy1);
    ctx.moveTo(cx2, cy2); ctx.lineTo(canvas.width, cy2);

    // X 軸對齊線 (往下畫到底)
    ctx.moveTo(cx1, cy1); ctx.lineTo(cx1, canvas.height);
    ctx.moveTo(cx2, cy2); ctx.lineTo(cx2, canvas.height);
    ctx.stroke();
    ctx.restore();

    // 2. 在座標軸上繪製標籤區塊
    ctx.save();
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const drawLabel = (x, y, w, h, text, isYAxis) => {
        ctx.fillStyle = baseColor;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#ffffff';
        if (isYAxis) {
            ctx.fillText(text, x + w / 2 - 2, y + h / 2);
        } else {
            ctx.fillText(text, x + w / 2, y + h / 2);
        }
    };

    // 繪製 X 軸區間的高亮背景
    ctx.fillStyle = baseColor;
    ctx.globalAlpha = 0.2;
    ctx.fillRect(xMin, canvas.height - bottomAxisH, xMax - xMin, bottomAxisH);
    
    // 繪製 Y 軸區間的高亮背景
    ctx.fillRect(canvas.width - rightAxisW, yMin, rightAxisW, yMax - yMin);
    ctx.globalAlpha = 1.0;

    // Y 軸的具體價格標籤
    drawLabel(canvas.width - rightAxisW, cy1 - 10, rightAxisW, 20, p1.price.toFixed(2), true);
    drawLabel(canvas.width - rightAxisW, cy2 - 10, rightAxisW, 20, p2.price.toFixed(2), true);

    // X 軸的具體時間標籤
    const t1Text = formatLogicalToDateStr(p1.time);
    const t2Text = formatLogicalToDateStr(p2.time);
    drawLabel(cx1 - 35, canvas.height - bottomAxisH, 70, bottomAxisH, t1Text, false);
    drawLabel(cx2 - 35, canvas.height - bottomAxisH, 70, bottomAxisH, t2Text, false);
    
    ctx.restore();
}

function renderShape(shape, series, ctx) {
    if (shape.type === 'line' || shape.type === 'pencil') {
        ctx.beginPath();
        let started = false;
        shape.points.forEach((pt, index) => {
            const cx = chart.timeScale().logicalToCoordinate(pt.time);
            const cy = series.priceToCoordinate(pt.price);
            if (cx !== null && cy !== null) {
                if (!started) {
                    ctx.moveTo(cx, cy);
                    started = true;
                } else {
                    ctx.lineTo(cx, cy);
                }
            }
        });
        ctx.strokeStyle = '#2962FF';
        ctx.lineWidth = shape.type === 'pencil' ? 2 : 2;
        ctx.stroke();

        // 幫趨勢線加上 TradingView-style 的起點與終點小圓圈及座標軸投影
        if (shape.type === 'line' && shape.points.length === 2) {
            const p1 = shape.points[0];
            const p2 = shape.points[1];
            const cx1 = chart.timeScale().logicalToCoordinate(p1.time);
            const cy1 = series.priceToCoordinate(p1.price);
            const cx2 = chart.timeScale().logicalToCoordinate(p2.time);
            const cy2 = series.priceToCoordinate(p2.price);
            
            if (cx1 !== null && cy1 !== null && cx2 !== null && cy2 !== null) {
                // 繪製座標軸範圍及反白
                drawAxisHighlight(ctx, p1, p2, cx1, cy1, cx2, cy2, '#2962FF');
                
                ctx.beginPath();
                ctx.arc(cx1, cy1, 4, 0, 2 * Math.PI);
                ctx.arc(cx2, cy2, 4, 0, 2 * Math.PI);
                ctx.fillStyle = '#131722';
                ctx.fill();
                ctx.strokeStyle = '#2962FF';
                ctx.stroke();
            }
        }

    } else if (shape.type === 'ruler') {
        const cx1 = chart.timeScale().logicalToCoordinate(shape.start.time);
        const cy1 = series.priceToCoordinate(shape.start.price);
        const cx2 = chart.timeScale().logicalToCoordinate(shape.end.time);
        const cy2 = series.priceToCoordinate(shape.end.price);
        
        if (cx1 !== null && cy1 !== null && cx2 !== null && cy2 !== null) {
            const priceDiff = shape.end.price - shape.start.price;
            const isUp = priceDiff >= 0;
            const color = isUp ? 'rgba(239, 83, 80, 1)' : 'rgba(38, 166, 154, 1)';
            const bgColor = isUp ? 'rgba(239, 83, 80, 0.15)' : 'rgba(38, 166, 154, 0.15)';
            
            // 繪製座標軸投影與高亮反白 (沿用 TradingView 習慣色)
            drawAxisHighlight(ctx, shape.start, shape.end, cx1, cy1, cx2, cy2, isUp ? '#26a69a' : '#ef5350');
            
            // 繪製半透明測量區域
            ctx.fillStyle = bgColor;
            ctx.fillRect(Math.min(cx1, cx2), Math.min(cy1, cy2), Math.abs(cx2 - cx1), Math.abs(cy2 - cy1));
            
            // 繪製連接線
            ctx.beginPath();
            ctx.moveTo(cx1, cy1);
            ctx.lineTo(cx2, cy2);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 繪製端點圓圈
            ctx.beginPath();
            ctx.arc(cx1, cy1, 4, 0, 2 * Math.PI);
            ctx.arc(cx2, cy2, 4, 0, 2 * Math.PI);
            ctx.fillStyle = '#131722';
            ctx.fill();
            ctx.stroke();
            
            // 計算數值以顯示在標籤上
            const bars = Math.round(Math.abs(shape.end.time - shape.start.time));
            const sign = isUp ? '+' : '';
            const startPriceNum = shape.start.price === 0 ? 1 : shape.start.price;
            const pct = ((priceDiff / Math.abs(startPriceNum)) * 100).toFixed(2);
            
            let timeDiffStr = "";
            if (globalCache.data && globalCache.data.length > 0) {
                const sIdx = Math.max(0, Math.min(globalCache.data.length - 1, Math.round(shape.start.time)));
                const eIdx = Math.max(0, Math.min(globalCache.data.length - 1, Math.round(shape.end.time)));
                if (globalCache.data[sIdx] && globalCache.data[eIdx]) {
                    const secDiff = Math.abs(globalCache.data[eIdx].time - globalCache.data[sIdx].time);
                    const minDiff = secDiff / 60;
                    if (minDiff > 0) {
                        if (minDiff < 60) {
                            timeDiffStr = `, ${Math.round(minDiff)}分鐘`;
                        } else if (minDiff < 1440) {
                            timeDiffStr = `, ${Math.round(minDiff / 60)}小時`;
                        } else if (minDiff < 43200) {
                            timeDiffStr = `, ${Math.round(minDiff / 1440)}天`;
                        } else {
                            timeDiffStr = `, ${Math.round(minDiff / 43200)}個月`;
                        }
                    }
                }
            }
            
            const line1 = `${sign}${priceDiff.toFixed(2)} (${sign}${pct}%)`;
            const line2 = `${bars} 根K線${timeDiffStr}`;
            
            ctx.font = '12px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
            const m1 = ctx.measureText(line1);
            const m2 = ctx.measureText(line2);
            const boxWidth = Math.max(m1.width, m2.width) + 16;
            const boxHeight = 44;
            
            // 將標籤放置在終點旁邊
            const boxX = cx2 + (cx2 >= cx1 ? 15 : -boxWidth - 15);
            const boxY = cy2 + (cy2 >= cy1 ? 15 : -boxHeight - 15);
            
            // 標籤背景
            ctx.fillStyle = color;
            ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
            
            // 標籤文字
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(line1, boxX + 8, boxY + 8);
            ctx.fillText(line2, boxX + 8, boxY + 24);
        }
    }
}
