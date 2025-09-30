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
  try {
    console.info('[LLM] chat 调用开始，消息条数:', Array.isArray(messages) ? messages.length : 'N/A');
    if (!isInited) {
      // 尝试静默初始化
      await initWebLLM(options.onProgress);
    }
    const url = `${BASE_URL.replace(/\/$/, '')}/chat/completions`;
    const body = {
      model: MODEL,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.max_tokens ?? 512,
      stream: false,
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
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
    return text;
  } catch (err) {
    console.error('[LLM] 调用 chat 失败:', err);
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
        '你是专业的数据可视化分析助手。根据用户问题与表格数据，选择最合适的图表类型（不限于柱状图/折线图/饼图；也可以是散点图、面积图、堆叠图、箱线图、雷达图、热力图、树图、桑基图、漏斗图、K线图等，需结合数据结构与分析目标合理选择）。输出一个严格的 JSON 对象，字段必须包含: option, chartType, insight, reason。\n' +
        '- option: 标准 ECharts 配置对象（可直接用于 echartsInstance.setOption(option)），需包含 dataset/series/legend/tooltip/axis 等必要配置；尽量使用 dataset+encode 自动映射。\n' +
        '- chartType: 简短英文或中文，如 bar/line/pie/scatter/heatmap/boxplot/radar/treemap/sankey/funnel/candlestick/area/stacked-bar 等，用于描述类型。\n' +
        '- insight: 从数据中得到的简短洞察。\n' +
        '- reason: 说明选择该图表类型的原因。\n' +
        '务必仅输出一个 JSON 对象，不要包含任何多余文本、解释或 Markdown 代码块。'
    },
    { role: 'user', content: `问题: ${question}\n列(schema): ${schema}\n样例:\n${samples}` },
  ];
}
