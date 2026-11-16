import { Chart, getHighcharts, Legend, PlotOptions, Tooltip, XAxis, YAxis, type ChartOptions } from '@highcharts/react'
import { Accessibility } from '@highcharts/react/modules/Accessibility'
import { AreaSeries } from '@highcharts/react/series/Area'
import { BarSeries } from '@highcharts/react/series/Bar'
import { ColumnSeries } from '@highcharts/react/series/Column'
import { LineSeries } from '@highcharts/react/series/Line'
import type { ReactNode } from 'react'
import { t } from '../i18n'
import { useChartColors, type ChartColors } from '../lib/chartColors'
import { Panel, Segmented } from './ui'

// Vietnamese number format in every chart (DATA-2: 1.234.567)
getHighcharts().setOptions({ lang: { decimalPoint: ',', thousandsSep: '.', locale: 'vi-VN' } })

/**
 * Day labels: about 12 across a wide panel and 5 on a phone, so dd/mm never overlaps. Highcharts
 * picks the rule by the chart's own width.
 */
function withDayLabels(options: ChartOptions, count: number): ChartOptions {
  const step = (labels: number) => Math.max(1, Math.ceil(count / labels))
  return {
    ...options,
    responsive: { rules: [{ condition: { maxWidth: 520 }, chartOptions: { xAxis: { labels: { step: step(5) } } } }] },
  }
}

/** The look every chart shares: no title or credits (the panel has the title), theme ink, flat marks. */
function baseOptions(colors: ChartColors): ChartOptions {
  return {
    chart: { backgroundColor: 'transparent', style: { fontFamily: colors.font }, spacing: [8, 4, 4, 0] },
    title: { text: undefined },
    credits: { enabled: false },
    colors: colors.series,
  }
}

/**
 * Axis, legend and tooltip colours. They go on the components themselves: a component replaces its
 * block of options, and Highcharts' own defaults follow the OS colour scheme, not the app theme.
 */
function themed(colors: ChartColors) {
  const label = { color: colors.meta, fontSize: '13px' }
  return {
    x: { labels: { style: label }, lineColor: colors.grid, tickColor: colors.grid },
    y: { labels: { style: label }, gridLineColor: colors.grid, title: { text: '' } },
    legend: { itemStyle: { color: colors.body, fontWeight: '400', fontSize: '13px' }, itemHoverStyle: { color: colors.ink } },
    tooltip: { backgroundColor: colors.canvas, borderColor: colors.grid, borderRadius: 8, shadow: false, style: { color: colors.body, fontSize: '13px' } },
  }
}

/**
 * A chart panel on the home page: title, an optional note, an optional sort control whose value
 * lives in the URL, then the chart. Sort options are labelled in words, never internal codes.
 */
export function ChartPanel<T extends string>({
  id,
  title,
  note,
  sort,
  className,
  children,
}: {
  id: string
  title: string
  note?: string
  sort?: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }
  className?: string
  children: ReactNode
}) {
  return (
    <Panel aria-labelledby={id} className={`min-w-0 ${className ?? ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={id} className="text-subhead text-ink">
            {title}
          </h2>
          {/* Reserved even when empty, so panels side by side line up */}
          <p className="mt-1 min-h-5 text-caption text-ink-meta">{note}</p>
        </div>
        {sort && <Segmented label={t('dashboard.sortBy', { chart: title })} value={sort.value} options={sort.options} onValueChange={sort.onChange} />}
      </div>
      {/* Positioned, so Highcharts' hidden accessibility elements stay inside the scrolling pane */}
      <div className="relative mt-3">{children}</div>
    </Panel>
  )
}

export interface BarRow {
  label: string
  values: number[]
}

/**
 * Horizontal bars, one row per category: easy to read with long Vietnamese labels and on phones.
 * One series has no legend (the panel title names it); two series get one.
 */
export function HorizontalBars({
  rows,
  series,
  description,
  note,
}: {
  rows: BarRow[]
  series: string[]
  description: string
  /** An extra tooltip line for a row, such as the value of a pipeline stage. */
  note?: (rowIndex: number) => string | undefined
}) {
  const colors = useChartColors()
  const style = themed(colors)
  const height = Math.max(160, rows.length * (series.length > 1 ? 44 : 32) + 60)
  return (
    <Chart options={baseOptions(colors)} height={height} containerProps={{ className: 'w-full' }}>
      <Accessibility description={description} />
      <XAxis {...style.x} categories={rows.map((row) => row.label)} />
      <YAxis {...style.y} allowDecimals={false} min={0} />
      <Legend {...style.legend} enabled={series.length > 1} />
      <Tooltip
        {...style.tooltip}
        shared
        formatter={function () {
          const points = this.points ?? [this]
          const lines = points.map((point) => `${point.series.name}: <b>${point.y ?? 0}</b>`)
          const extra = note?.(this.index)
          return [`<span style="font-size: 12px">${String(this.key ?? '')}</span>`, ...lines, ...(extra ? [extra] : [])].join('<br/>')
        }}
      />
      <PlotOptions bar={{ borderRadius: { radius: 4, where: 'end' }, borderWidth: 0, groupPadding: 0.12, pointPadding: 0.08, maxPointWidth: 20 }} />
      {series.map((name, index) => (
        <BarSeries key={name} name={name} data={rows.map((row) => row.values[index])} />
      ))}
    </Chart>
  )
}

/** Values over days: lines for counts that move together, the newest day on the right. */
export function DayLines({ days, series, description }: { days: string[]; series: { name: string; data: number[] }[]; description: string }) {
  const colors = useChartColors()
  const style = themed(colors)
  return (
    <Chart options={withDayLabels(baseOptions(colors), days.length)} height={260} containerProps={{ className: 'w-full' }}>
      <Accessibility description={description} />
      <XAxis {...style.x} categories={days} labels={{ ...style.x.labels, step: Math.max(1, Math.ceil(days.length / 12)) }} />
      <YAxis {...style.y} allowDecimals={false} min={0} />
      <Legend {...style.legend} enabled={series.length > 1} />
      <Tooltip {...style.tooltip} shared />
      <PlotOptions line={{ lineWidth: 2, marker: { radius: 4, enabled: days.length <= 31 } }} />
      {series.map((item) => (
        <LineSeries key={item.name} name={item.name} data={item.data} />
      ))}
    </Chart>
  )
}

/** One value per day as columns (daily active users). */
export function DayColumns({ days, name, data, description }: { days: string[]; name: string; data: number[]; description: string }) {
  const colors = useChartColors()
  const style = themed(colors)
  return (
    <Chart options={withDayLabels(baseOptions(colors), days.length)} height={220} containerProps={{ className: 'w-full' }}>
      <Accessibility description={description} />
      <XAxis {...style.x} categories={days} labels={{ ...style.x.labels, step: Math.max(1, Math.ceil(days.length / 12)) }} />
      <YAxis {...style.y} allowDecimals={false} min={0} />
      <Legend {...style.legend} enabled={false} />
      <Tooltip {...style.tooltip} />
      <PlotOptions column={{ borderRadius: { radius: 4, where: 'end' }, borderWidth: 0, pointPadding: 0.1, groupPadding: 0.05 }} />
      <ColumnSeries name={name} data={data} />
    </Chart>
  )
}

/**
 * A sparkline for a metric card: the shape of the period, no axes or legend (the card names it),
 * with the day and value on hover. `format` writes a value for the tooltip.
 */
export function Sparkline({ days, data, label, format }: { days: string[]; data: number[]; label: string; format: (value: number) => string }) {
  const colors = useChartColors()
  const style = themed(colors)
  return (
    <Chart options={baseOptions(colors)} height={48} margin={[4, 2, 4, 2]} containerProps={{ className: 'w-full' }}>
      <Accessibility description={label} />
      <XAxis categories={days} visible={false} />
      <YAxis visible={false} min={Math.min(0, ...data)} startOnTick={false} endOnTick={false} />
      <Legend enabled={false} />
      <Tooltip
        {...style.tooltip}
        outside
        formatter={function () {
          return `${String(this.key ?? '')}: <b>${format(Number(this.y ?? 0))}</b>`
        }}
      />
      <PlotOptions
        area={{
          // The first and last day sit on the card's edges
          pointPlacement: 'on',
          lineWidth: 2,
          fillOpacity: 0.12,
          marker: { enabled: false, states: { hover: { enabled: true, radius: 3 } } },
          states: { hover: { lineWidth: 2 } },
        }}
      />
      <AreaSeries name={label} data={data} />
    </Chart>
  )
}
