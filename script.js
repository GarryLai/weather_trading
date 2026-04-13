// 初始化圖表
const chartOptions = { 
    layout: { 
        textColor: 'white', 
        background: { type: 'solid', color: '#1E1E1E' } 
    },
    timeScale: {
        timeVisible: true,
        secondsVisible: false,
    }
};
const chart = LightweightCharts.createChart(document.getElementById('chart'), chartOptions);

let currentSeries = null;

// 設定日期輸入框的預設值為今天
const today = new Date().toISOString().split('T')[0];
document.getElementById('startDate').value = today;
document.getElementById('endDate').value = today;

// 從 API 獲取資料
async function fetchData() {
    const dataType = document.getElementById('dataType').value;
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
            
            return result.sort((a, b) => a.time - b.time);
            
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
            
            return result.sort((a, b) => a.time - b.time);
            
        } catch (err) {
            alert(err.message);
            searchBtn.innerText = '查詢資料';
            searchBtn.disabled = false;
            return [];
        }
    }

    const startDateStr = document.getElementById('startDate').value;
    const endDateStr = document.getElementById('endDate').value;
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

    // 處理超過 45 天需拆包 (遞迴 / 迴圈分批查詢)
    searchBtn.innerText = '載入中...';
    searchBtn.disabled = true;

    try {
        while (totalDays > 0) {
            const requestDays = Math.min(totalDays, 45);
            const timeStr = currentStart.toISOString().split('T')[0];
            
            const response = await fetch(`https://pblap.ppp503.workers.dev/?mode=sfc&time=${timeStr}&days=${requestDays}&stno=10`);
            if (!response.ok) throw new Error("API 發生錯誤");
            const rawData = await response.json();
            
            if (Array.isArray(rawData)) {
                combinedRawData = combinedRawData.concat(rawData);
            }

            totalDays -= requestDays;
            if (totalDays > 0) {
                currentStart = new Date(currentStart.getTime() + requestDays * msPerDay);
            }
        }
    } catch (err) {
        alert(err.message);
    }

    searchBtn.innerText = '查詢資料';
    searchBtn.disabled = false;
    
    const intervalText = document.getElementById('interval').value;
    const groupedData = {};
    
    combinedRawData.forEach(d => {
        if(d.temp !== null) {
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
                    value: d.temp  // 折線圖用
                };
            } else {
                groupedData[trueUtcMs].high = Math.max(groupedData[trueUtcMs].high, d.temp);
                groupedData[trueUtcMs].low = Math.min(groupedData[trueUtcMs].low, d.temp);
                groupedData[trueUtcMs].close = d.temp;
                groupedData[trueUtcMs].value = d.temp;
            }
        }
    });
    
    // 排序並提取出轉換後的 K 線 Array
    const data = Object.values(groupedData).sort((a, b) => a.time - b.time);
    return data;
}

async function updateChart() {
    const chartType = document.getElementById('chartType').value;
    const interval = document.getElementById('interval').value;

    if (currentSeries) {
        chart.removeSeries(currentSeries);
        currentSeries = null;
    }

    const data = await fetchData(interval);

    if (chartType === 'candlestick') {
        currentSeries = chart.addCandlestickSeries({
            upColor: '#ef5350',
            downColor: '#26a69a',
            borderVisible: false,
            wickUpColor: '#ef5350',
            wickDownColor: '#26a69a'
        });
        currentSeries.setData(data);
    } else if (chartType === 'line') {
        currentSeries = chart.addLineSeries({
            color: '#2962FF',
            lineWidth: 2,
        });
        // Line chart only needs time and value
        const lineData = data.map(d => ({ time: d.time, value: d.value }));
        currentSeries.setData(lineData);
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
    } else {
        cityWrapper.classList.add('d-none');
        forecastIntervalWrapper.classList.add('d-none');
        obsElements.forEach(el => el.classList.remove('d-none'));
    }
    
    updateChart();
});
document.getElementById('city').addEventListener('change', updateChart);
document.getElementById('forecastInterval').addEventListener('change', updateChart);
document.getElementById('chartType').addEventListener('change', updateChart);
document.getElementById('interval').addEventListener('change', updateChart);
document.getElementById('searchBtn').addEventListener('click', updateChart);

// 處理視窗大小改變
window.addEventListener('resize', () => {
    chart.applyOptions({ width: document.getElementById('chart').offsetWidth });
});

// 日期按鈕功能
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
    
    updateChart();
}

document.getElementById('prevDayBtn').addEventListener('click', () => adjustDate(-1, 0));
document.getElementById('nextDayBtn').addEventListener('click', () => adjustDate(1, 0));
document.getElementById('prevMonthBtn').addEventListener('click', () => adjustDate(0, -1));
document.getElementById('nextMonthBtn').addEventListener('click', () => adjustDate(0, 1));

// 初始渲染
updateChart();
