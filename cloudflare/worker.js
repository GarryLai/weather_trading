const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.5005.115 Safari/537.36'
};

async function getToken() {
  const r = await fetch('https://obs.pblap.tw/10Marchive.php', { headers });
  const text = await r.text();
  const idMatch = text.match(/id:\s*'([^']+)'/);
  const tokenMatch = text.match(/token:\s*'([^']+)'/);
  
  if (!idMatch || !tokenMatch) throw new Error("Failed to extract tokens");
  return { id: idMatch[1], token: tokenMatch[1] };
}

async function getGroundData(id, token, dateStr, days, stno) {
  if (days > 45) throw new Error('Days cannot be more than 45');
  
  const postData = new URLSearchParams({
    from_date: dateStr,
    days: days.toString(),
    stno: stno.toString(),
    id: id,
    token: token
  });

  const r = await fetch('https://obs.pblap.tw/script/archive.php', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: postData.toString()
  });

  if (!r.ok) throw new Error(`HTTP Error ${r.status}`);
  return r.text();
}

function parseGroundData(data) {
  if (data === 'null' || !data) throw new Error("No data");
  
  const blocks = data.split('<br>');
  const info = blocks[0].split(',');
  
  const dateStr = blocks[1]?.split(',') || [];
  const temp = blocks[2]?.split(',') || [];
  const rh = blocks[3]?.split(',') || [];
  const wd = blocks[4]?.split(',') || [];
  const ws = blocks[5]?.split(',') || [];
  const pres = blocks[6]?.split(',') || [];
  const precp = blocks[7]?.split(',') || [];
  const rad = blocks[8]?.split(',') || [];

  const count = Math.min(dateStr.length, temp.length, rh.length, ws.length, wd.length, pres.length, precp.length, rad.length);
  const result = [];
  
  // 以台灣時區 (UTC+8) 為基準解析時間
  // info[0] 為開始日期，如 '2024-01-01'
  let startTime = new Date(`${info[0]}T00:00:00+08:00`).getTime();

  for (let i = 0; i < count; i++) {
    // 每一筆資料間隔一分鐘 (60,000 毫秒)
    const currentMs = startTime + (i * 60000);
    const dt = new Date(currentMs);
    
    const parseNum = (val) => (val === 'null' || val === '' || val === undefined) ? null : Number(val);
    
    result.push({
      datetime: dt.toISOString(),
      temp: parseNum(temp[i]),
      rh: parseNum(rh[i]),
      ws: parseNum(ws[i]),
      wd: parseNum(wd[i]),
      p: parseNum(pres[i]),
      pr: parseNum(precp[i]),
      sr: parseNum(rad[i])
    });
  }
  
  return result;
}

async function getChartId(id, token, tag, date) {
  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const hh = date.getHours().toString().padStart(2, '0');

  const postData = new URLSearchParams({
    tag, yyyy, mm, dd, hh, id, token
  });

  const r = await fetch('https://obs.pblap.tw/script/queryFigByDate.php', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: postData.toString()
  });

  const text = await r.text();
  const lines = text.split('\n');
  return lines[0].trim();
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(request.url);
    const mode = url.searchParams.get('mode') || 'sfc';
    const timeValue = url.searchParams.get('time');

    if (!timeValue) {
      return new Response("Missing 'time' parameter. Example: ?time=2024-01-01 or ?time=2024-01-01_12", { status: 400 });
    }

    try {
      const { id, token } = await getToken();

      if (mode === 'sfc') {
        const days = parseInt(url.searchParams.get('days') || '1', 10);
        const stno = parseInt(url.searchParams.get('stno') || '10', 10);
        const dateRaw = timeValue.split('_')[0]; 

        const rawData = await getGroundData(id, token, dateRaw, days, stno);
        const jsonData = parseGroundData(rawData);

        // 回傳 JSON
        return new Response(JSON.stringify(jsonData), {
          headers: {
            "Content-Type": "application/json;charset=UTF-8",
            "Access-Control-Allow-Origin": "*"
          }
        });

      } else if (mode === 'chart') {
        const code = url.searchParams.get('code') || 'radar2HD';
        let dateObj;
        
        // 處理 YYYY-MM-DD_HH 或 YYYY-MM-DD
        if (timeValue.includes('_')) {
          const [datePart, hourPart] = timeValue.split('_');
          dateObj = new Date(`${datePart}T${hourPart}:00:00+08:00`);
        } else {
          dateObj = new Date(`${timeValue}T00:00:00+08:00`);
        }

        const chartId = await getChartId(id, token, code, dateObj);
        
        if (!chartId || chartId.includes('No Image')) {
          return new Response("Chart not found", { status: 404 });
        }

        const imgReq = await fetch(`https://obs.pblap.tw/script/theImg.php?f=${chartId}`, { headers });
        
        // 直接回傳圖片的 Binary Stream
        return new Response(imgReq.body, {
          headers: {
            "Content-Type": imgReq.headers.get("Content-Type") || "image/png",
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*"
          }
        });

      } else {
        return new Response("Invalid mode. Use 'sfc' or 'chart'", { status: 400 });
      }

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { 
        status: 500, 
        headers: { "Content-Type": "application/json" } 
      });
    }
  }
};