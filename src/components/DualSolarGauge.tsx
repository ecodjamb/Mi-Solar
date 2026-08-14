import EChart from './EChart';

export default function DualSolarGauge({ pv1, pv2, max }: { pv1: number; pv2: number; max: number }) {
  const safeMax = Math.max(1000, max);
  const first = Math.max(0, Math.min(safeMax, pv1));
  const second = Math.max(0, Math.min(safeMax, pv2));
  const axis = {
    min: 0, max: safeMax, startAngle: 210, endAngle: -30, splitNumber: 6,
    radius: '91%', center: ['50%', '50%'],
    axisLine: { lineStyle: { width: 16, color: [[1, '#19323b']] } },
    axisTick: { distance: -22, length: 5, lineStyle: { color: '#708991', width: 1 } },
    splitLine: { distance: -25, length: 10, lineStyle: { color: '#aebfc4', width: 1 } },
    axisLabel: { distance: -40, color: '#829aa2', fontSize: 9, formatter: (value: number) => `${Math.round(value / 1000)}k` }
  };
  return <EChart className="gauge-chart dual-solar-gauge" option={{
    animation: false,
    series: [
      {
        ...axis, type: 'gauge', progress: { show: true, width: 10, roundCap: true, itemStyle: { color: '#efbd34' } },
        pointer: { show: true, length: '66%', width: 6, itemStyle: { color: '#efbd34' } }, anchor: { show: true, size: 12, itemStyle: { color: '#efbd34' } },
        title: { offsetCenter: ['-30%', '62%'], color: '#a9bdc3', fontSize: 10 },
        detail: { offsetCenter: ['-30%', '43%'], valueAnimation: false, color: '#f4d56f', fontSize: 17, fontWeight: 750, formatter: (value: number) => `${Math.round(value).toLocaleString('es-CL')} W` },
        data: [{ value: first, name: 'PV1' }]
      },
      {
        ...axis, type: 'gauge', axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        progress: { show: false }, pointer: { show: true, length: '50%', width: 6, itemStyle: { color: '#f29b38' } }, anchor: { show: true, size: 7, itemStyle: { color: '#f29b38' } },
        title: { offsetCenter: ['30%', '62%'], color: '#a9bdc3', fontSize: 10 },
        detail: { offsetCenter: ['30%', '43%'], valueAnimation: false, color: '#f7ad62', fontSize: 17, fontWeight: 750, formatter: (value: number) => `${Math.round(value).toLocaleString('es-CL')} W` },
        data: [{ value: second, name: 'PV2' }]
      }
    ]
  }}/>;
}
