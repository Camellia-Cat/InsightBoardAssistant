<script setup>
import { ref, reactive } from 'vue'
import ChartView from './components/ChartView.vue'
import ChatPanel from './components/ChatPanel.vue'
import { buildAnalysisPrompt, chat as chatLLM } from './services/webllm'

const dataset = ref(null)
const question = ref('')
const preset = ref('')
const result = reactive({ config: {}, insight: '', reason: '', chartType: '' })
const aiBusy = ref(false)
const aiThinkingMs = ref(0)
let aiTimer = null
let aiController = null
const lastAnalysisMs = ref(0)

const presets = [
  { label: '同比', value: '同比' },
  { label: '环比', value: '环比' },
  { label: 'Top 5', value: 'Top 5' },
  { label: 'Top 10', value: 'Top 10' },
]

function onLoaded(ds) {
  dataset.value = ds
}

function fullQuestion() {
  return [preset.value, question.value].filter(Boolean).join(' ')
}

async function runAI() {
  if (!dataset.value || aiBusy.value) return
  aiBusy.value = true
  aiThinkingMs.value = 0
  if (aiTimer) { clearInterval(aiTimer); aiTimer = null }
  const startedAt = Date.now()
  aiTimer = setInterval(() => { aiThinkingMs.value = Date.now() - startedAt }, 50)
  aiController = new AbortController()
  try {
    const messages = buildAnalysisPrompt({ columns: dataset.value.columns, sampleRows: dataset.value.rows.slice(0, 20), question: fullQuestion() })
    const text = await chatLLM(messages, { signal: aiController.signal })
    lastAnalysisMs.value = Date.now() - startedAt

    const parseAIJSON = (t) => {
      if (!t || typeof t !== 'string') return null
      const tryParse = (s) => { try { return JSON.parse(s) } catch { return null } }
      const tryEvalObject = (s) => {
        try {
          // Only attempt when it looks like a plain object literal
          if (!/^\s*\{[\s\S]*\}\s*$/.test(s)) return null
          // Wrap in parentheses so object literal parses
          // eslint-disable-next-line no-new-func
          const obj = new Function('"use strict"; return (' + s + ')')()
          if (obj && typeof obj === 'object') return obj
        } catch (e) {
          // ignore
        }
        return null
      }
      const reviveFunctions = (val) => {
        const revive = (v) => {
          if (typeof v === 'string' && /(=>)|(^\s*function\s*\()/i.test(v)) {
            try {
              // eslint-disable-next-line no-new-func
              const fn = new Function('return (' + v + ')')()
              if (typeof fn === 'function') return fn
            } catch {}
          }
          return v
        }
        const walk = (x) => {
          if (Array.isArray(x)) return x.map(walk)
          if (x && typeof x === 'object') {
            const out = {}
            for (const k in x) out[k] = walk(revive(x[k]))
            return out
          }
          return revive(x)
        }
        return walk(val)
      }
      // Try direct parse first
      let obj = tryParse(t)
      if (obj) return reviveFunctions(obj)
      // Try fenced code block ```json ... ``` or generic ```...```
      const fence = t.match(/```json[\s\S]*?```/i) || t.match(/```[\s\S]*?```/)
      if (fence) {
        const inner = fence[0].replace(/```json/i, '').replace(/```/g, '').trim()
        obj = tryParse(inner) || tryEvalObject(inner)
        if (obj) return reviveFunctions(obj)
      }
      // Try slice between first { and last }
      const first = t.indexOf('{'); const last = t.lastIndexOf('}')
      if (first !== -1 && last !== -1 && last > first) {
        const sliced = t.slice(first, last + 1)
        obj = tryParse(sliced) || tryEvalObject(sliced)
        if (obj) return reviveFunctions(obj)
      }
      // Light cleanup attempts for common LLM formatting issues
      let cleaned = t
        .replace(/\r/g, '')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\n/g, ' ')
        .trim()
      const fence2 = cleaned.match(/```json[\s\S]*?```/i) || cleaned.match(/```[\s\S]*?```/)
      if (fence2) {
        const inner2 = fence2[0].replace(/```json/i, '').replace(/```/g, '').trim()
    	obj = tryParse(inner2) || tryEvalObject(inner2)
        if (obj) return reviveFunctions(obj)
      }
      const f2 = cleaned.indexOf('{'); const l2 = cleaned.lastIndexOf('}')
      if (f2 !== -1 && l2 !== -1 && l2 > f2) {
        const s2 = cleaned.slice(f2, l2 + 1)
        obj = tryParse(s2) || tryEvalObject(s2)
        if (obj) return reviveFunctions(obj)
      }
      return null
    }

    const obj = parseAIJSON(text)

    if (!obj) {
      // Graceful fallback: show raw AI text as insight to avoid crashing
      Object.assign(result, {
        chartType: '',
        config: {},
        insight: typeof text === 'string' ? text : 'AI 返回了非结构化结果',
        reason: 'AI 返回不是有效的 JSON，已显示原始文本'
      })
      return
    }

    const config = obj.config || obj.option || {}
    // Ensure ECharts uses the full dataset: inject/override dataset.source with all rows
    if (dataset.value?.rows?.length) {
      const fullRows = dataset.value.rows
      if (Array.isArray(config.dataset)) {
        // If multiple datasets, replace the first one's source; leave others as-is
        config.dataset = config.dataset.map((ds, idx) => {
          const dso = { ...(ds || {}) }
          if (idx === 0) dso.source = fullRows
          return dso
        })
      } else {
        config.dataset = { ...(config.dataset || {}), source: fullRows }
      }
    }
    Object.assign(result, {
      chartType: obj.chartType || '',
      config,
      insight: obj.insight || '',
      reason: obj.reason || 'AI 建议'
    })
  } catch (e) {
    console.error(e)
  } finally {
    aiBusy.value = false
    if (aiTimer) { clearInterval(aiTimer); aiTimer = null }
    aiController = null
  }
}

function cancelAI() {
  if (aiController) {
    try { aiController.abort() } catch {}
  }
  aiBusy.value = false
  if (aiTimer) { clearInterval(aiTimer); aiTimer = null }
}

function applyFromChat(obj) {
  const revive = (v) => {
    if (typeof v === 'string' && /(=>)|(^\s*function\s*\()/i.test(v)) {
      try { const fn = new Function('return (' + v + ')')(); if (typeof fn === 'function') return fn } catch {}
    }
    return v
  }
  const walk = (x) => {
    if (Array.isArray(x)) return x.map(walk)
    if (x && typeof x === 'object') { const out = {}; for (const k in x) out[k] = walk(revive(x[k])); return out }
    return revive(x)
  }
  const config0 = obj.config || obj.option || {}
  const config = walk(config0)
  // Ensure ECharts uses full dataset
  if (dataset.value?.rows?.length) {
    const fullRows = dataset.value.rows
    if (Array.isArray(config.dataset)) {
      config.dataset = config.dataset.map((ds, idx) => {
        const dso = { ...(ds || {}) }
        if (idx === 0) dso.source = fullRows
        return dso
      })
    } else {
      config.dataset = { ...(config.dataset || {}), source: fullRows }
    }
  }
  Object.assign(result, {
    chartType: obj.chartType || '',
    config,
    insight: obj.insight || '',
    reason: obj.reason || 'AI 建议(聊天)'
  })
}

function exportJSON() {
  const dash = {
    timestamp: new Date().toISOString(),
    filename: dataset.value?.filename || '',
    question: fullQuestion(),
    dataset: { columns: dataset.value?.columns, rows: dataset.value?.rows?.slice(0, 100) },
    chart: { type: result.chartType, config: result.config },
    insight: result.insight,
    reason: result.reason,
    privacy: '仅保留云端 AI 分析，图表使用 G2Plot 在前端渲染',
  }
  const blob = new Blob([JSON.stringify(dash, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'dashboard.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="page">
    <header class="top">
      <h1>智能数据看板(AI)</h1>
      <div class="desc">云端 AI 分析 · CSV/Excel 上传 · 自动生成 G2Plot 可视化 · 一键下载图片</div>
    </header>

    <section class="controls">
      <!-- 已将上传与 AI 分析集成到右侧聊天框中，这里保留预设与导出功能 -->
      <select v-model="preset" class="select">
        <option value="" disabled>选择预设问题</option>
        <option v-for="p in presets" :key="p.value" :value="p.value">{{ p.label }}</option>
      </select>
      <input v-model="question" class="q" placeholder="输入你的问题，如：按月份查看销售额趋势" />
      <button @click="runAI" :disabled="!dataset || aiBusy">AI 分析</button>
      <button @click="exportJSON" :disabled="!dataset">导出仪表盘 JSON</button>
      <span v-if="lastAnalysisMs" class="dur">上次思考用时 {{ (lastAnalysisMs/1000).toFixed(1) }}s</span>
    </section>

    <section class="main">
      <div class="left">
        <div class="insight">
          <div class="t">洞察</div>
          <div class="c">{{ result.insight || (dataset ? '点击分析生成洞察' : '请先在右侧聊天框上传数据并进行分析') }}</div>
          <div class="t" style="margin-top:8px">图表建议理由</div>
          <div class="c">{{ result.reason || '—' }}</div>
        </div>
        <ChartView :result="result" />
      </div>
      <div class="right">
        <ChatPanel @apply="applyFromChat" @loaded="onLoaded" />
      </div>
    </section>

    <div v-if="aiBusy" class="overlay" @click="cancelAI">
      <div class="loader">
        <div class="spinner"></div>
        <div class="txt">AI 分析中... 点击取消</div>
        <div class="time">已用时 {{ (aiThinkingMs/1000).toFixed(1) }}s</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.dur { margin-left: 8px; font-size: 12px; opacity: .9; }

/* Loading overlay */
.overlay { position: fixed; left:0; top:0; right:0; bottom:0; background: rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; z-index: 9999; }
.loader { background: rgba(17,24,39,0.9); padding: 16px 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.15); color: #e5e7eb; display:flex; flex-direction: column; align-items:center; gap:6px; }
.spinner { width: 28px; height: 28px; border: 3px solid rgba(255,255,255,0.25); border-top-color: #60a5fa; border-radius: 50%; animation: spin 1s linear infinite; }
.txt { font-size: 14px; }
.time { font-size: 12px; opacity: .85; }
@keyframes spin { to { transform: rotate(360deg) } }

/* Hero header with gradient glow */
.top {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  padding: 20px 24px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(99,102,241,0.18), rgba(16,185,129,0.18));
  border: 1px solid rgba(255,255,255,0.15);
  box-shadow: 0 8px 30px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  overflow: hidden;
}
.top::after {
  content: '';
  position: absolute;
  right: -120px; top: -120px;
  width: 280px; height: 280px;
  background: radial-gradient(circle, rgba(99,102,241,0.45), transparent 60%);
  filter: blur(14px);
}
.top h1 {
  margin: 0;
  font-size: 28px;
  letter-spacing: 0.5px;
}
.desc {
  color: rgba(255,255,255,0.8);
  font-size: 13px;
}

/* Controls toolbar - glassmorphism */
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 14px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 14px;
  backdrop-filter: blur(10px);
  box-shadow: 0 6px 20px rgba(0,0,0,0.18);
}
.select, .q {
  padding: 10px 12px;
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 10px;
  background: rgba(255,255,255,0.08);
  color: inherit;
  outline: none;
  transition: all .2s ease;
}
.select:focus, .q:focus {
  border-color: #8b5cf6;
  box-shadow: 0 0 0 3px rgba(139,92,246,0.25);
}
.q { min-width: 360px; }

.controls button {
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.14);
  background: linear-gradient(135deg, #111827, #0b1220);
  color: #e5e7eb;
  transition: transform .12s ease, box-shadow .2s ease, border-color .2s ease;
}
.controls button:hover {
  transform: translateY(-1px);
  border-color: #60a5fa;
  box-shadow: 0 8px 18px rgba(59,130,246,0.25);
}
.controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Layout */
.main {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 20px;
}
.left {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Glass cards */
.insight, .right, .chart-card {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 14px;
  padding: 14px;
  backdrop-filter: blur(10px);
  box-shadow: 0 6px 20px rgba(0,0,0,0.18);
}
.insight .t {
  font-weight: 700;
  font-size: 13px;
  letter-spacing: .3px;
  color: #e5e7eb;
}
.insight .c {
  color: #cbd5e1;
  font-size: 13px;
}

/* Right chat panel style improvement */
.right {
  padding: 0;
  overflow: hidden;
}

/* Responsive */
@media (max-width: 1024px) {
  .main { grid-template-columns: 1fr; }
}
</style>
