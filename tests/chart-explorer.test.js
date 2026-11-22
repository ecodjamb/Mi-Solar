import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chartEntry=readFileSync(new URL('../src/components/EChart.tsx',import.meta.url),'utf8');
const chart=readFileSync(new URL('../src/components/EChartRenderer.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');
const query=readFileSync(new URL('../supabase/migrations/20260907033000_optimize_archive_series_query.sql',import.meta.url),'utf8');
const index=readFileSync(new URL('../supabase/migrations/20260907034500_energy_samples_archive_covering_index.sql',import.meta.url),'utf8');

for(const label of ['Anterior','Siguiente','Último dato','Restablecer','Explorar','Guardar'])assert.match(chart,new RegExp(label));
assert.match(chartEntry,/lazySection/,'ECharts debe cargarse únicamente cuando un gráfico se monta');
assert.match(chart,/updateAxisPointer/,'la selección táctil debe seguir el eje');
assert.match(chart,/getDataURL/,'el gráfico debe poder descargarse');
assert.match(chart,/aria-live="polite"/,'los valores seleccionados deben ser accesibles');
assert.match(chart,/showContent:false/,'ECharts no debe dibujar el globo sobre el lienzo');
assert.match(chart,/triggerOn:'mousemove\|click'/,'el recorrido táctil debe seguir actualizando la lectura');
assert.doesNotMatch(chart,/type:'showTip'/,'la navegación no debe reabrir el tooltip nativo');
assert.match(css,/chart-explorer\.is-expanded/,'debe existir vista de pantalla completa');
assert.match(chart,/chart-tooltip-dock/,'la lectura debe vivir en una ficha externa al lienzo');
assert.match(css,/chart-tooltip-dock\{position:relative/,'el cuadro blanco no debe superponerse al gráfico');
assert.doesNotMatch(chart,/chart-reader/,'se elimina el cuadro inferior anterior');
assert.doesNotMatch(query,/percentile_disc/,'la consulta no debe recalcular percentiles por cada gráfico');
assert.match(query,/interval '15 minutes'/,'los huecos largos no deben integrarse como energía');
assert.match(index,/include\(solar_w,pv1_w,pv2_w,load_w,grid_w,grid_active/,'el archivo debe leerse desde un índice cubriente');

console.log('chart explorer tests passed');
