<script setup>
import { ref } from 'vue'
import { parseCSV, parseExcel } from '../utils/data'

const emit = defineEmits(['loaded'])
const loading = ref(false)
const error = ref('')

async function onFile(e) {
  error.value = ''
  const file = e.target.files?.[0]
  if (!file) return
  const name = file.name.toLowerCase()
  try {
    loading.value = true
    let dataset
    if (name.endsWith('.csv')) {
      dataset = await parseCSV(file)
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      dataset = await parseExcel(file)
    } else {
      throw new Error('仅支持 CSV、XLS、XLSX 文件')
    }
    emit('loaded', { ...dataset, filename: file.name })
  } catch (err) {
    console.error(err)
    error.value = err.message || String(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="uploader">
    <label class="btn">
      <input type="file" accept=".csv,.xls,.xlsx" @change="onFile" />
      选择文件(CSV/XLS/XLSX)
    </label>
    <span v-if="loading" class="tip">正在解析...</span>
    <span v-if="error" class="err">{{ error }}</span>
  </div>
</template>

<style scoped>
.uploader { display: flex; align-items: center; gap: 12px; }
.btn { border: 1px solid #ddd; padding: 6px 10px; border-radius: 6px; cursor: pointer; background: #fafafa; }
.btn input { display: none; }
.tip { color: #666; }
.err { color: #c00; }
</style>
