// Lightweight normalization/sanitization for AI-produced ECharts options
// Goal: accept various aliases, enforce basic ECharts-compatible structure, and avoid destructive changes.

function toArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function normalizeSeriesType(t) {
  if (!t) return t;
  const s = String(t).toLowerCase();
  const map = {
    column: 'bar',
    bar: 'bar',
    line: 'line',
    area: 'line',
    pie: 'pie',
    donut: 'pie',
    ring: 'pie',
    scatter: 'scatter',
    bubble: 'scatter',
    heat: 'heatmap',
    heatmap: 'heatmap',
    radar: 'radar',
    box: 'boxplot',
    boxplot: 'boxplot',
    k: 'candlestick',
    kline: 'candlestick',
    candlestick: 'candlestick',
    map: 'map',
    geo: 'map',
    graph: 'graph',
    network: 'graph',
    relation: 'graph',
    lines: 'lines',
    tree: 'tree',
    treemap: 'treemap',
    sunburst: 'sunburst',
    parallel: 'parallel',
    sankey: 'sankey',
    funnel: 'funnel',
    gauge: 'gauge',
    pictorial: 'pictorialBar',
    pictorialbar: 'pictorialBar',
  };
  return map[s] || s;
}

function applyBasicDefaults(option) {
  option.tooltip = option.tooltip || { trigger: 'item' };
  // Add legend for multi-series cases where absent
  const seriesArr = toArray(option.series);
  if (seriesArr.length > 1 && !option.legend) {
    option.legend = {};
  }
  // For line/bar ensure grid/axes exist if using cartesian
  const types = new Set(seriesArr.map(s => normalizeSeriesType(s.type)));
  const usesCartesian = ['bar', 'line', 'scatter', 'pictorialBar'].some(t => types.has(t));
  if (usesCartesian) {
    if (!option.grid) option.grid = { containLabel: true };
    if (!option.xAxis) option.xAxis = {};
    if (!option.yAxis) option.yAxis = {};
  }
  // For radar ensure radar coord exists
  if (types.has('radar') && !option.radar) {
    option.radar = option.radar || { indicator: [] };
  }
}

export function normalizeAIResponse(obj) {
  // Accept different field names and output a consistent structure
  const out = {
    option: {},
    chartType: obj?.chartType || obj?.type || '',
    insight: obj?.insight || '',
    reason: obj?.reason || obj?.explanation || '',
  };

  const rawOption = obj?.option || obj?.config || obj?.optionConfig || {};
  const option = typeof rawOption === 'object' && rawOption ? { ...rawOption } : {};

  // Normalize series to array and series.type aliases
  if (option.series) {
    const seriesArr = toArray(option.series).map(s => {
      const ss = { ...(s || {}) };
      ss.type = normalizeSeriesType(ss.type);
      // If area-style requested via chartType 'area'
      if (ss.type === 'line' && (obj?.chartType?.toLowerCase?.() === 'area' || s?.areaStyle)) {
        ss.areaStyle = ss.areaStyle || {};
      }
      return ss;
    });
    option.series = seriesArr;
  }

  // If no series but has dataset/encode, leave as-is (ECharts will error clearly if insufficient)

  // Basic defaults
  applyBasicDefaults(option);

  // Map/geo compatibility: if geo specified without series map, leave geo as-is; if series map without geo, ECharts handles it

  out.option = option;
  // Normalize chartType to primary series type if absent
  if (!out.chartType && option.series && option.series.length) {
    out.chartType = option.series[0].type || '';
  }
  return out;
}

// Helper to scan map names in an option for preloading geoJSON
export function collectMapNames(option) {
  const names = new Set();
  if (!option || typeof option !== 'object') return [];
  if (option.geo && option.geo.map) names.add(option.geo.map);
  const seriesArr = toArray(option.series);
  for (const s of seriesArr) {
    if (!s) continue;
    const type = normalizeSeriesType(s.type);
    if (type === 'map' && s.map) names.add(s.map);
    if ((type === 'lines' || type === 'scatter') && s.coordinateSystem === 'geo' && option.geo?.map) {
      names.add(option.geo.map);
    }
  }
  return Array.from(names);
}
