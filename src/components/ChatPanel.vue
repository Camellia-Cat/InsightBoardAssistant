<script setup>
import { ref, onMounted } from 'vue'
import { initWebLLM, chat as chatLLM, buildAnalysisPrompt } from '../services/webllm'
import { normalizeAIResponse } from '../utils/echartsOption'
import { parseCSV, parseExcel } from '../utils/data'

const emit = defineEmits(['apply', 'loaded'])

const messages = ref([
  { role: 'assistant', content: '你好，我是数据看板助手小庆。请在下方直接上传 CSV/Excel，或输入问题与我聊天。' }
])
const input = ref('')
const loading = ref(false)
const initMsg = ref('')
const thinkingMs = ref(0)
const dataset = ref(null)
const filename = ref('')
let timer = null
let currentController = null

onMounted(async () => {
  initMsg.value = '正在连接云端 AI 模型...'
  try {
    await initWebLLM((r) => { initMsg.value = (r.text || r.progress) ? `${r.text || ''} ${(r.progress*100||0).toFixed(0)}%` : '初始化中...' })
    initMsg.value = '云端模型就绪，可对话。'
  } catch (e) {
    initMsg.value = '模型初始化失败：' + (e.message || '请检查网络与 API Key 配置。')
    console.error(e)
  }
})

function extractJSON(text) {
  // Try code fence first
  const fence = text.match(/```json([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/)
  if (fence && fence[1]) {
    try { return JSON.parse(fence[1]) } catch {}
  }
  // Fallback: find first {...}
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    const maybe = text.slice(first, last + 1)
    try { return JSON.parse(maybe) } catch {}
  }
  return null
}

// --- Minimal Markdown Renderer (safe-ish) ---
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function mdToHtml(md) {
  if (!md) return ''

  // Extract fenced code blocks first
  const codeBlocks = []
  md = md.replace(/```(\w+)?\r?\n([\s\S]*?)```/g, (m, lang, code) => {
    const html = `<pre><code class="language-${lang || ''}">${escapeHtml(code)}</code></pre>`
    codeBlocks.push(html)
    return `\u0000CODEBLOCK${codeBlocks.length - 1}\u0000`
  })

  // Escape remaining text
  let html = escapeHtml(md)

  // Headings
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
             .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
             .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
             .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
             .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
             .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')

  // Ordered lists (simple)
  html = html.replace(/(^|\n)(\d+)\.\s+(.+)(?=(\n\d+\.\s+)|$)/g, (m, p1, idx, item) => `${p1}<ol><li>${item}</li></ol>`)
  // Unordered lists (simple)
  // Group consecutive - or * lines
  html = html.replace(/(?:^|\n)((?:[-*]\s+.+(?:\n|$))+)/g, (m, block) => {
    const items = block.trim().split(/\n/).map(l => l.replace(/^[-*]\s+/, '').trim()).filter(Boolean)
    return `\n<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`
  })

  // Links
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1<\/a>')

  // Inline code (after escaping)
  html = html.replace(/`([^`]+)`/g, (m, code) => `<code>${code}</code>`)

  // Bold and italic (order matters)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
             .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')

  // Paragraphs: split by double newlines
  const parts = html.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  html = parts.map(p => {
    // Keep block elements unwrapped
    if (/^<(h\d|ul|ol|pre)/i.test(p)) return p
    return `<p>${p.replace(/\n/g, '<br/>')}</p>`
  }).join('')

  // Restore code blocks
  html = html.replace(/\u0000CODEBLOCK(\d+)\u0000/g, (m, i) => codeBlocks[Number(i)] || '')

  return html
}

function cancel() {
  if (currentController) {
    try { currentController.abort() } catch {}
    currentController = null
  }
  if (timer) { clearInterval(timer); timer = null }
  loading.value = false
}

async function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file || loading.value) return
  const name = file.name.toLowerCase()
  try {
    loading.value = true
    let ds = null
    if (name.endsWith('.csv')) {
      ds = await parseCSV(file)
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      ds = await parseExcel(file)
    } else {
      throw new Error('仅支持 CSV、XLS、XLSX 文件')
    }
    dataset.value = ds
    filename.value = file.name
    emit('loaded', { ...ds, filename: file.name })
    // Show a friendly message in chat
    const cols = ds.columns.map(c => `${c.key}(${c.type})`).join(', ')
    const sample = (ds.rows[0] ? JSON.stringify(ds.rows[0]) : '{}')
    messages.value.push({ role: 'user', content: `已上传文件：${file.name}` })
    // 共 ${ds.rows.length} 行，列：${cols}。
    messages.value.push({ role: 'assistant', content: `收到数据文件🫡：${file.name}。请点击AI分析按钮开始生成图表` })
    // Reset input placeholder hint
  } catch (err) {
    console.error(err)
    messages.value.push({ role: 'assistant', content: '文件解析失败：' + (err.message || String(err)) })
  } finally {
    loading.value = false
    // reset file input so that same file can be re-selected
    try { e.target.value = '' } catch {}
  }
}

async function analyze() {
  if (!dataset.value || loading.value) return
  const q = (input.value || '请基于当前数据给出一个最合适的可视化建议，并仅输出 JSON').trim()

  // Do not push user question message to chat; only show assistant status
  const assistantMsg = { role: 'assistant', content: '正在分析并生成图表…' }
  messages.value.push(assistantMsg)

  loading.value = true
  thinkingMs.value = 0
  const startedAt = Date.now()
  if (timer) { clearInterval(timer) }
  timer = setInterval(() => { thinkingMs.value = Date.now() - startedAt }, 50)

  currentController = new AbortController()
  try {
    const analysisMessages = buildAnalysisPrompt({ columns: dataset.value.columns, sampleRows: dataset.value.rows.slice(0, 20), question: q })
    const full = await chatLLM(analysisMessages, {
      stream: true,
      signal: currentController.signal,
      // Intentionally do not pipe streamed content into chat to avoid exposing JSON
      onToken: () => {},
      onFinish: ({ text, durationMs }) => {
        if (timer) { clearInterval(timer); timer = null }
        thinkingMs.value = durationMs
      },
      onError: (e) => { console.error(e) }
    })

    const obj = extractJSON(full)
    if (obj && (obj.option || obj.config)) {
      const normalized = normalizeAIResponse(obj)
      emit('apply', {
        option: normalized.option,
        chartType: normalized.chartType || '',
        insight: normalized.insight || '',
        reason: normalized.reason || 'AI 建议(聊天)'
      })
      // Replace chat content with a short confirmation instead of JSON
      assistantMsg.content = '已生成并应用图表 ✅'
    } else {
      // If parsing failed, keep a minimal notice
      assistantMsg.content = 'AI 返回结果无法解析为图表配置。'
    }
  } catch (e) {
    console.error(e)
    assistantMsg.content = '分析出错：' + (e.message || String(e))
  } finally {
    if (timer) { clearInterval(timer); timer = null }
    loading.value = false
    currentController = null
  }
}

async function send() {
  const content = (input.value || '').trim()
  if (!content || loading.value) return

  // push user message
  messages.value.push({ role: 'user', content })
  input.value = ''

  // prepare assistant streaming message
  const assistantMsg = { role: 'assistant', content: '' }
  messages.value.push(assistantMsg)

  // state
  loading.value = true
  thinkingMs.value = 0
  const startedAt = Date.now()
  if (timer) { clearInterval(timer) }
  timer = setInterval(() => { thinkingMs.value = Date.now() - startedAt }, 50)

  currentController = new AbortController()
  try {
    const full = await chatLLM(messages.value, {
      stream: true,
      signal: currentController.signal,
      onStart: () => {},
      onToken: (delta, all) => {
        assistantMsg.content = all
      },
      onFinish: ({ text, durationMs }) => {
        if (timer) { clearInterval(timer); timer = null }
        thinkingMs.value = durationMs
      },
      onError: (e) => {
        console.error(e)
      }
    })

    // Try parse JSON from the final message
    const obj = extractJSON(full)
    if (obj && (obj.option || obj.config)) {
      const normalized = normalizeAIResponse(obj)
      emit('apply', {
        option: normalized.option,
        chartType: normalized.chartType || '',
        insight: normalized.insight || '',
        reason: normalized.reason || 'AI 建议(聊天)'
      })
    }
  } catch (e) {
    console.error(e)
    assistantMsg.content = '对话出错：' + (e.message || String(e))
  } finally {
    if (timer) { clearInterval(timer); timer = null }
    loading.value = false
    currentController = null
  }
}
</script>

<template>
  <div class="chat">
    <div class="init">{{ initMsg }}</div>
    <div class="msgs">
      <div v-for="(m,i) in messages" :key="i" class="msg" :class="m.role">
        <div class="bubble">
          <template v-if="m.role==='assistant' && i===messages.length-1 && loading">
            <span class="dot dot1"></span><span class="dot dot2"></span><span class="dot dot3"></span>
            <span class="thinking"> 思考中 {{ (thinkingMs/1000).toFixed(1) }}s</span>
            <div v-if="m.content" class="stream md" v-html="mdToHtml(m.content)"></div>
          </template>
          <template v-else>
            <div class="md" v-html="mdToHtml(m.content)"></div>
          </template>
        </div>
      </div>
    </div>
    <div class="input-row">
      <label class="upload-btn">
        <input type="file" accept=".csv,.xls,.xlsx" @change="onFileChange" />
        上传CSV/Excel
      </label>
      <input v-model="input" @keyup.enter="send" :placeholder="dataset ? '基于已上传数据提问...' : '输入你的问题...'" />
      <button :disabled="loading" @click="send">发送</button>
      <button :disabled="loading || !dataset" @click="analyze">AI 分析</button>
      <button v-if="loading" class="cancel" @click="cancel">取消</button>
    </div>
  </div>
</template>

<style scoped>
.chat { border: 1px solid #eee; border-radius: 8px; display:flex; flex-direction: column; height: 661px; }
.init { font-size: 12px; color: #666; padding: 6px 10px; border-bottom: 1px dashed #eee; }
.msgs { flex: 1; padding: 10px; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
.msg { display: flex; }
.msg.user { justify-content: flex-end; }
.bubble { max-width: 80%; padding: 8px 10px; border-radius: 12px; background: #375dff; font-weight: bold; color: #fff; white-space: normal; }
.msg.user .bubble { background: #009a0f; font-weight: bold; }
.input-row { display: flex; gap: 8px; padding: 8px; border-top: 1px solid #eee;}
.upload-btn { border: 1px solid #ddd; padding: 6px 10px; border-radius: 8px; background: #fafafa; color: #333; cursor: pointer; }
.upload-btn input { display: none; }
.input-row input { flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 8px; }
.input-row button { padding: 8px 12px; border-radius: 8px; background: #1677ff; color: #fff; border: none; cursor: pointer; }
.input-row button:disabled { background: #999; cursor: not-allowed; }
.cancel { background: #ef4444; }
.dot { display:inline-block; width:6px; height:6px; background:#fff; border-radius:50%; margin-right:3px; opacity:.6; animation: blink 1.2s infinite ease-in-out; }
.dot2 { animation-delay: .2s }
.dot3 { animation-delay: .4s }
.thinking { font-size: 12px; opacity: .9; margin-left: 6px; }
.stream { margin-top: 6px; font-weight: normal; }

/* Markdown styles inside bubbles */
.md :where(p, h1, h2, h3, h4, h5, h6, ul, ol) { margin: 6px 0; }
.md h1, .md h2, .md h3 { font-size: 16px; line-height: 1.3; font-weight: 800; }
.md h4, .md h5, .md h6 { font-size: 14px; line-height: 1.3; font-weight: 700; }
.md p { font-weight: normal; line-height: 1.6; }
.md ul, .md ol { padding-left: 20px; }
.md code { background: rgba(0,0,0,.25); padding: 2px 4px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.md pre { background: rgba(0,0,0,.3); padding: 8px; border-radius: 8px; overflow: auto; }
.md pre code { background: transparent; padding: 0; }
.md a { color: #ffe082; text-decoration: underline; }
@keyframes blink { 0%,80%,100%{ opacity:.2 } 40% { opacity:1 } }
</style>
