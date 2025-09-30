<script setup>
import { ref, onMounted } from 'vue'
import { initWebLLM, chat as chatLLM } from '../services/webllm'

const emit = defineEmits(['apply'])

const messages = ref([
  { role: 'assistant', content: '你好，我是数据看板助手。请上传数据或直接提问。' }
])
const input = ref('')
const loading = ref(false)
const initMsg = ref('')

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

async function send() {
  const content = input.value.trim()
  if (!content) return
  messages.value.push({ role: 'user', content })
  input.value = ''
  loading.value = true
  try {
    const reply = await chatLLM(messages.value)
    messages.value.push({ role: 'assistant', content: reply })
    const obj = extractJSON(reply)
    if (obj && (obj.option || obj.config)) {
      emit('apply', {
        option: obj.option || obj.config || {},
        chartType: obj.chartType || '',
        insight: obj.insight || '',
        reason: obj.reason || 'AI 建议(聊天)'
      })
    }
  } catch (e) {
    console.error(e)
    messages.value.push({ role: 'assistant', content: '对话出错：' + (e.message || String(e)) })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="chat">
    <div class="init">{{ initMsg }}</div>
    <div class="msgs">
      <div v-for="(m,i) in messages" :key="i" class="msg" :class="m.role">
        <div class="bubble">{{ m.content }}</div>
      </div>
    </div>
    <div class="input-row">
      <input v-model="input" @keyup.enter="send" placeholder="输入你的问题..." />
      <button :disabled="loading" @click="send">发送</button>
    </div>
  </div>
</template>

<style scoped>
.chat { border: 1px solid #eee; border-radius: 8px; display:flex; flex-direction: column; height: 661px; }
.init { font-size: 12px; color: #666; padding: 6px 10px; border-bottom: 1px dashed #eee; }
.msgs { flex: 1; padding: 10px; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
.msg { display: flex; }
.msg.user { justify-content: flex-end; }
.bubble { max-width: 80%; padding: 8px 10px; border-radius: 12px; background: #375dff; font-weight: bold; color: #fff; }
.msg.user .bubble { background: #009a0f; font-weight: bold; }
.input-row { display: flex; gap: 8px; padding: 8px; border-top: 1px solid #eee;}
.input-row input { flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 8px; }
.input-row button { padding: 8px 12px; border-radius: 8px; background: #1677ff; color: #fff; border: none; cursor: pointer; }
.input-row button:disabled { background: #999; cursor: not-allowed; }
</style>
