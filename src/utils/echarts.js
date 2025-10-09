// ECharts v6 modular setup: register commonly used components and charts in one place
import { use, init as echartsInit, getInstanceByDom, registerMap, getMap } from 'echarts/core'

// Components
import { TitleComponent } from 'echarts/components'
import { TooltipComponent } from 'echarts/components'
import { LegendComponent } from 'echarts/components'
import { GridComponent } from 'echarts/components'
import { DatasetComponent } from 'echarts/components'
import { VisualMapComponent } from 'echarts/components'
import { DataZoomComponent } from 'echarts/components'
import { GeoComponent } from 'echarts/components'
import { ToolboxComponent } from 'echarts/components'

// Charts
import { BarChart } from 'echarts/charts'
import { LineChart } from 'echarts/charts'
import { PieChart } from 'echarts/charts'
import { ScatterChart, EffectScatterChart } from 'echarts/charts'
import { HeatmapChart } from 'echarts/charts'
import { RadarChart } from 'echarts/charts'
import { BoxplotChart } from 'echarts/charts'
import { CandlestickChart } from 'echarts/charts'
import { MapChart } from 'echarts/charts'
import { LinesChart } from 'echarts/charts'
import { TreeChart } from 'echarts/charts'
import { TreemapChart } from 'echarts/charts'
import { SunburstChart } from 'echarts/charts'
import { ParallelChart } from 'echarts/charts'
import { SankeyChart } from 'echarts/charts'
import { FunnelChart } from 'echarts/charts'
import { GaugeChart } from 'echarts/charts'
import { PictorialBarChart } from 'echarts/charts'
import { GraphChart } from 'echarts/charts'

// Renderer
import { CanvasRenderer } from 'echarts/renderers'

use([
  // components
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DatasetComponent,
  VisualMapComponent,
  DataZoomComponent,
  GeoComponent,
  ToolboxComponent,
  // charts
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  EffectScatterChart,
  HeatmapChart,
  RadarChart,
  BoxplotChart,
  CandlestickChart,
  MapChart,
  LinesChart,
  TreeChart,
  TreemapChart,
  SunburstChart,
  ParallelChart,
  SankeyChart,
  FunnelChart,
  GaugeChart,
  PictorialBarChart,
  GraphChart,
  // renderer
  CanvasRenderer
])

export const echarts = {
  init: echartsInit,
  getInstanceByDom,
  registerMap,
  getMap
}
