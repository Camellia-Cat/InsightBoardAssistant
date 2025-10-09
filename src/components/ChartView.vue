<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { echarts } from '../utils/echarts'
import { collectMapNames } from '../utils/echartsOption'

const props = defineProps({
  result: { type: Object, required: true } // expects { option|config, insight, reason, chartType? }
})

const chartEl = ref(null)
let chart = null

function ensureChart() {
  if (chart || !chartEl.value) return
  chart = echarts.init(chartEl.value, undefined, { renderer: 'canvas' })
}

async function ensureMaps(option) {
  const names = collectMapNames(option)
  for (const name of names) {
    if (!name) continue
    try {
      if (echarts.getMap && echarts.getMap(name)) continue
      let url = ''
      // Common shortcuts
      if (name.toLowerCase() === 'china' || name === '中国') {
        url = 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json'
      } else if (name.toLowerCase() === 'world' || name === '世界') {
        url = 'https://geo.datav.aliyun.com/geojson/world.json'
      }
      if (!url) continue
      const resp = await fetch(url)
      if (!resp.ok) continue
      const json = await resp.json()
      if (json) echarts.registerMap(name, json)
    } catch (e) {
      console.warn('[Map] 注册地图失败:', name, e)
    }
  }
}

async function render() {
  if (!chartEl.value) return
  if (!chart) ensureChart()
  const option = props.result?.option || props.result?.config || {}
  await ensureMaps(option)
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

watch(() => [props.result?.option, props.result?.config], () => {
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
