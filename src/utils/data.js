import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export function detectType(values) {
  let numCount = 0;
  let dateCount = 0;
  let total = 0;
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    total++;
    const n = Number(v);
    if (!Number.isNaN(n) && String(v).trim() !== '') numCount++;
    const d = new Date(v);
    if (!isNaN(d)) dateCount++;
  }
  if (numCount / Math.max(1, total) > 0.7) return 'number';
  if (dateCount / Math.max(1, total) > 0.5) return 'date';
  return 'string';
}

export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data;
        const columns = Object.keys(rows[0] ?? {}).map((k) => ({
          key: k,
          type: detectType(rows.map((r) => r[k]))
        }));
        resolve({ rows, columns });
      },
      error: reject,
      encoding: 'utf-8'
    });
  });
}

export function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const columns = Object.keys(rows[0] ?? {}).map((k) => ({
          key: k,
          type: detectType(rows.map((r) => r[k]))
        }));
        resolve({ rows, columns });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function autoChart(dataset, questionText) {
  const { rows, columns } = dataset;
  // Heuristic: choose one dimension (string/date) and one measure (number)
  const dim = columns.find((c) => c.type === 'string') || columns.find((c) => c.type === 'date') || columns[0];
  const measure = columns.find((c) => c.type === 'number') || columns[1] || columns[0];

  // Determine chart type
  let chartType = 'column';
  if (dim?.type === 'date') chartType = 'line';
  // If dimension cardinality small and measure share-like -> pie
  const categories = Array.from(new Set(rows.map((r) => r[dim.key]))).filter((v) => v !== '' && v != null);
  if (categories.length > 0 && categories.length <= 8 && rows.length <= 200) {
    chartType = 'pie';
  }

  // Build data for charts
  const data = rows.map((r) => ({
    category: r[dim.key],
    value: Number(r[measure.key])
  })).filter((d) => d.category !== undefined && !Number.isNaN(d.value));

  let config = {};
  if (chartType === 'column') {
    config = {
      data,
      xField: 'category',
      yField: 'value',
      label: false,
      xAxis: { label: { autoRotate: true } },
      tooltip: { formatter: (d) => ({ name: measure.key, value: d.value }) }
    };
  } else if (chartType === 'line') {
    config = {
      data,
      xField: 'category',
      yField: 'value',
      smooth: true,
      tooltip: { formatter: (d) => ({ name: measure.key, value: d.value }) }
    };
  } else if (chartType === 'pie') {
    config = {
      data,
      angleField: 'value',
      colorField: 'category',
      radius: 0.9,
      label: { type: 'inner', offset: '-30%', content: ({ percent }) => `${(percent * 100).toFixed(0)}%` },
    };
  }

  // Insight & reason
  const values = data.map((d) => d.value).filter((v) => !Number.isNaN(v));
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = values.length ? sum / values.length : 0;
  const max = values.length ? Math.max(...values) : 0;
  const min = values.length ? Math.min(...values) : 0;
  const maxItem = data.find((d) => d.value === max);
  const minItem = data.find((d) => d.value === min);
  const insight = `均值约为 ${avg.toFixed(2)}；最高为 ${maxItem ? `${maxItem.category}=${maxItem.value}` : '-'}；最低为 ${minItem ? `${minItem.category}=${minItem.value}` : '-'}`;
  const reason = chartType === 'line'
    ? '时间维度连续性强，适合用折线展示趋势'
    : chartType === 'pie'
    ? '类别较少，且关注占比关系，适合用饼图'
    : '类别较多，数值对比明确，适合用柱状图';

  return {
    chartType,
    dimension: dim?.key,
    measure: measure?.key,
    config,
    data,
    insight,
    reason,
    question: questionText || ''
  };
}
