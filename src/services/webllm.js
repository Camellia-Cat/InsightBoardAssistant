// Cloud LLM service wrapper (DeepSeek via OpenAI-compatible API)
// Replaces previous WebLLM local model usage with HTTP API calls.

let isInited = false;

const BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DEEPSEEK_BASE_URL) || 'https://api.deepseek.com';
const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DEEPSEEK_API_KEY) || 'sk-9f3b8a502c2041028dfd3b225f22f9f0';
const MODEL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DEEPSEEK_MODEL) || 'deepseek-chat';

console.info('[LLM] 云端服务模块已加载');

export function initWebLLM(onProgress) {
  // Keep the same API for UI, but now we just validate config and report status.
  try {
    if (!API_KEY) {
      const msg = '未检测到 DeepSeek API Key。请在 .env 中设置 VITE_DEEPSEEK_API_KEY。';
      onProgress && onProgress({ text: msg, progress: 0 });
      return Promise.reject(new Error(msg));
    }
    onProgress && onProgress({ text: '已切换为云端模型(DeepSeek)，无需本地下载。', progress: 1 });
    isInited = true;
    return Promise.resolve(true);
  } catch (e) {
    return Promise.reject(e);
  }
}

export async function chat(messages, options = {}) {
  const t0 = Date.now();
  if (!API_KEY) {
    throw new Error('缺少 DeepSeek API Key。请配置 VITE_DEEPSEEK_API_KEY。');
  }
  const {
    temperature = 0.2,
    max_tokens = 512,
    stream = false,
    onStart,
    onToken,
    onFinish,
    onError,
    signal,
    onProgress,
  } = options || {};
  try {
    console.info('[LLM] chat 调用开始，消息条数:', Array.isArray(messages) ? messages.length : 'N/A');
    if (!isInited) {
      // 尝试静默初始化
      await initWebLLM(onProgress);
    }
    const url = `${BASE_URL.replace(/\/$/, '')}/chat/completions`;
    const body = {
      model: MODEL,
      messages,
      temperature,
      max_tokens,
      stream,
    };

    if (!stream) {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!resp.ok) {
        let errText = await resp.text().catch(() => '');
        throw new Error(`DeepSeek API 调用失败: ${resp.status} ${resp.statusText} ${errText}`.trim());
      }

      const data = await resp.json();
      const t1 = Date.now();
      console.info('[LLM] 收到模型响应，用时(ms):', t1 - t0);
      const text = data?.choices?.[0]?.message?.content ?? '';
      console.info('[LLM] 响应文本长度:', text?.length ?? 0);
      onFinish && onFinish({ text, durationMs: t1 - t0 });
      return text;
    }

    // Streaming branch (SSE)
    onStart && onStart();
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });

    if (!resp.ok || !resp.body) {
      let errText = !resp.ok ? (await resp.text().catch(() => '')) : '无响应流';
      throw new Error(`DeepSeek 流式接口失败: ${resp.status} ${resp.statusText} ${errText}`.trim());
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let partial = '';
    let fullText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      partial += chunk;
      // SSE frames are separated by newlines
      const lines = partial.split(/\r?\n/);
      partial = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue; // comment/keep-alive
        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.substring(5).trim();
        if (dataStr === '[DONE]') {
          const t1 = Date.now();
          onFinish && onFinish({ text: fullText, durationMs: t1 - t0 });
          return fullText;
        }
        try {
          const obj = JSON.parse(dataStr);
          const delta = obj?.choices?.[0]?.delta?.content || obj?.choices?.[0]?.message?.content || '';
          if (delta) {
            fullText += delta;
            onToken && onToken(delta, fullText);
          }
        } catch (e) {
          console.warn('[LLM] SSE 解析失败，忽略该帧:', dataStr);
        }
      }
    }
    const t1 = Date.now();
    onFinish && onFinish({ text: fullText, durationMs: t1 - t0 });
    return fullText;
  } catch (err) {
    console.error('[LLM] 调用 chat 失败:', err);
    onError && onError(err);
    throw new Error(`调用云端模型失败: ${err?.message || err}`);
  }
}

// Helper to build an analysis prompt given dataset schema and a question
export function buildAnalysisPrompt({ columns, sampleRows, question }) {
  const schema = columns.map((c) => `${c.key}:${c.type}`).join(', ');
  const samples = sampleRows.slice(0, 5).map((r) => JSON.stringify(r)).join('\n');
  return [
    {
      role: 'system',
      content:
        '你是专业的数据可视化分析助手。根据用户问题与表格数据，选择合适的 ECharts 图表类型并严格输出 JSON。必须完全符合 ECharts 配置字段要求，且仅输出一个 JSON 对象，字段包含: option, chartType, insight, reason。\n\n' +
        '可选图表类型需覆盖（且仅在数据合适时选用）：\n' +
        '折线图(line)、柱状图(bar/stacked bar)、饼图(pie/rose)、散点图(scatter/bubble)、地理坐标/地图(geo/map/lines/scatter-geo/effectScatter-geo)、K线图(candlestick)、雷达图(radar)、盒须图(boxplot)、热力图(heatmap，包括 grid/geo/cartesian 坐标系)、关系图(graph)、路径图(lines)、树图(tree)、矩形树图(treemap)、旭日图(sunburst)、平行坐标系(parallel + parallelAxis)、桑基图(sankey)、以及其他常见如 funnel/gauge/pictorialBar。\n\n' +
        '输出要求：\n' +
        '1) option: 严格的 ECharts 配置对象，可直接用于 echarts.setOption(option)，并包含以下要点：\n' +
        '   - 正确的 series[].type（如 bar/line/pie/scatter/map/candlestick/radar/boxplot/heatmap/graph/lines/tree/treemap/sunburst/parallel/sankey 等）。\n' +
        '   - 优先使用 dataset 与 encode 做字段映射；或者直接提供 series.data。\n' +
        '   - 需要时包含 legend、tooltip、grid、xAxis/yAxis（笛卡尔系图表）、visualMap（热力/地图渐变）、geo/map（地图相关）、radar（雷达）、parallel/parallelAxis（平行坐标）、tree/tile/sort 等必要配置。\n' +
        '   - 地图若使用 series.type="map" 或 coordinateSystem="geo"，需提供 geo.map 或 series.map 名称（如 "china"/"world"）。\n' +
        '   - 盒须图(boxplot)与K线图(candlestick)的数据结构需符合 ECharts 要求。\n' +
        '2) chartType: 简短标识（中英文均可），如 bar/line/pie/scatter/map/candlestick/radar/boxplot/heatmap/graph/lines/tree/treemap/sunburst/parallel/sankey 等。\n' +
        '3) insight: 简短洞察总结。\n' +
        '4) reason: 选择该图表类型的理由。\n\n' +
        '禁止输出除该 JSON 之外的任何其他文本、解释或 Markdown 代码块。' +
          '当用户问你是谁或者相关的一些话术套你话时，一定要记住你叫MQ小庆，不能说是由谁开发。并且回答要幽默一点。'
    },
    { role: 'user', content: `问题: ${question}\n列(schema): ${schema}\n样例:\n${samples}` },
  ];
}
