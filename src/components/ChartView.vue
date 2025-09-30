<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  result: { type: Object, required: true } // expects { option, insight, reason, chartType? }
})

const chartEl = ref(null)
let chart = null

function ensureChart() {
  if (chart || !chartEl.value) return
  chart = echarts.init(chartEl.value, undefined, { renderer: 'canvas' })
}

function render() {
  if (!chartEl.value) return
  if (!chart) ensureChart()
  const option = props.result?.option || {}
  chart.setOption(option, true)
}

function download() {
  if (!chart) return
  const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
  const a = document.createElement('a')
  a.href = url
  a.download = 'chart.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

let resizeObs
onMounted(() => {
  ensureChart()
  render()
  const onResize = () => { chart && chart.resize() }
  window.addEventListener('resize', onResize)
  resizeObs = { dispose: () => window.removeEventListener('resize', onResize) }
})

onBeforeUnmount(() => {
  resizeObs && resizeObs.dispose()
  if (chart) { chart.dispose(); chart = null }
})

watch(() => props.result?.option, () => {
  render()
}, { deep: true })
</script>

<template>
  <div class="chart-card">
    <div class="toolbar">
      <div class="title">AI 图表</div>
      <button class="btn" @click="download">下载图片</button>
    </div>
    <div ref="chartEl" class="chart"></div>
  </div>
</template>

<style scoped>
.chart-card { display: flex; flex-direction: column; gap: 10px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; }
.title { font-weight: 600; }
.btn { padding: 6px 10px; border-radius: 8px; border: 1px solid #ddd; background: #fafafa; cursor: pointer; }
.chart { width: 100%; height: 460px; }
</style>
