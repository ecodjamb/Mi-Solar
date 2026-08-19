# Mi Solar v8.24.5

- Agua: el icono de fotografía y el icono de ingreso manual comparten una primera columna fija y quedan exactamente alineados en celular y web.
- Agua: se corrige una regla móvil anterior que desplazaba el botón de fotografía hacia la segunda columna.

# Mi Solar v8.24.4

- Agua: las lecturas manuales aceptan coma o punto decimal y se formatean como `7893,125 m³`.
- Agua: las lecturas manuales y fotográficas se guardan y muestran siempre con tres decimales; las milésimas representan litros.
- Agua: el servidor normaliza y redondea las lecturas a 0,001 m³ antes de guardarlas.
- Agua: ayuda visible en el formulario: `0,125 m³ = 125 litros`.

# Mi Solar v8.24.3

- Agua: cabecera compacta y modo entretenido activo por defecto, sin mostrar el selector de modo en esta sección.
- Agua: eliminado el formulario manual duplicado dentro del detalle del mes en curso.
- Agua: las fotografías se abren tocando el icono luminoso; “foto IA” y notas opcionales ocupan menos espacio.
- Agua: la captura fotográfica permite escribir una nota antes de elegir cámara o rollo.
- Agua: campos de 16 px y sin enfoque automático para evitar el zoom de Safari al abrir el ingreso manual.

# Mi Solar v8.24.2

- Agua: el promedio del mes en curso se calcula por días calendario transcurridos entre la lectura inicial y la última lectura, sin añadir horas ficticias a una fecha que no tiene hora.
- Agua: la proyección y el total estimado del período usan el mismo intervalo diario corregido.
- Agua: prueba automática con el caso real 7.876 → 7.892,713 m³ entre el 11 y el 18 de agosto.

# Mi Solar v8.24.1

- Agua: “Subir boleta” y “Subir lectura de hoy” permiten elegir entre cámara y rollo fotográfico antes de abrir el selector del teléfono.
- Agua: nuevo ingreso manual compacto bajo los accesos rápidos, con número, nota opcional y fecha/hora automáticas.
- Agua: al guardar una lectura manual se actualizan de inmediato el mes en curso, su proyección y el historial de lecturas.

# Mi Solar v8.24.0

- Agua: accesos directos para subir una boleta o una lectura del medidor desde la cámara.
- Agua: la lectura fotográfica se guarda de inmediato con fecha, hora, imagen y análisis.
- Agua: resumen plegable del mes en curso con consumo, promedio y proyección a $1.500 por m³.
- Agua: clasificación estricta; una boleta solo es real cuando ambas lecturas y fechas están visibles.
- Agua: junio y julio de 2026 y septiembre de 2025 fueron corregidos a estimados sin borrar boletas ni fotos.
- Agua: notificaciones quedaron al final en un apartado plegable.
- Agua: m³ enteros en toda la vista, salvo el promedio diario con un decimal.

# Mi Solar v8.23.0

- Agua muestra primero un gráfico mensual más legible, diferenciando lecturas reales de consumos estimados.
- Las boletas se analizan, clasifican y guardan automáticamente al seleccionar sus fotografías.
- La clasificación real/estimada se decide en el servidor según fechas y pares de lecturas verificables.
- Cerrar un mes consolida las lecturas en el historial y abre automáticamente el siguiente período.

# Mi Solar v8.22.1

- Costos de agua queda disponible exclusivamente para El Arrayán.
- Las boletas se identifican por mes comercial, una por mes, separando ese mes del intervalo real entre lecturas.
- Las regularizaciones conservan diferencia total, m³ previamente estimados/descontados y consumo finalmente facturado.
- Resincronización segura del acceso Vercel–Supabase sin modificar registros históricos.

# Mi Solar v8.22.0

- Nueva pestaña final **Costos de agua** para Aguas Andinas.
- Lectura por IA de hasta cuatro páginas por boleta, con respaldo privado de las fotografías.
- Historial mensual con consumo real/estimado, monto, promedios, lecturas, m³ descontados y desglose completo.
- Seguimiento del mes en curso mediante fotografías del medidor o lecturas manuales con fecha y hora.
- Proyección de consumo y costo al cierre basada en las lecturas del mes o el promedio histórico.
- Apertura y cierre de períodos, fotografía asociada a cada lectura y recordatorio push configurable.
- Base de datos permanente separada para boletas, documentos, períodos, lecturas y preferencias de aviso.

# Mi Solar v8.3.2

- Eliminado definitivamente el artefacto triangular amarillo del flujo de batería.
- Se retiraron todos los marcadores SVG de flecha, origen del renderizado defectuoso.
- Se añadieron partículas luminosas pequeñas para indicar dirección sin rellenos ni triángulos.
- Corregida la insignia lateral para mostrar v8.3.2 de forma consistente con login, técnico y API.

# Mi Solar V8.3.0

- Horas visibles en formato chileno de 24 horas.
- Cobertura diaria mejor explicada: muestras recibidas, esperadas hasta ahora y esperadas en un día completo.
- Nueva tarjeta independiente de Calidad de datos para tiempo real, día, semana, mes, clima y radiación.
- Última sincronización visible para facilitar diagnóstico.

# Changelog

## 8.3.0

- Arquitectura 100% Vercel consolidada.
- Caché local aislado por número de serie: Arrayán y Puerto Montt no comparten datos.
- Al cambiar de instalación se muestran únicamente los últimos datos válidos de ese equipo mientras llega la actualización.
- El caché vence a las 24 horas para no reutilizar acumulados de días anteriores.
- Política de actualización centralizada: tiempo real 30 s, día 5 min, semana 30 min, mes 2 h, clima 15 min y radiación 1 h.
- Sesión de 24 horas de inactividad conservada.
- Endpoint `/api/health` y versión visible actualizados a 8.3.0.

## 8.0.0

- Migración estable desde Netlify a Vercel.
# V8.9.0

- Modelo de radiación dividido en invierno, primavera, verano y otoño.
- Parámetros completos de la infografía de El Arrayán incorporados como referencias estacionales.
- Modelo estacional independiente para Puerto Montt, calibrado con su clima, potencia e historial real.
- Base permanente priorizada para semanas, meses, consultas históricas y calibración solar.
- Puerto Montt homologado como sistema off-grid: el parámetro grid se presenta como generador.
- Costos redactados en lenguaje más claro y gráfico de torta ampliado con kWh y valor monetario.
- Proyecciones de costos recalculadas con cada nueva hora consolidada del mes.

# V8.8.6

- Costos organizados por mes y año, con el mes actual seleccionado por defecto.
- Barra mensual por origen: solar directo, batería hacia la casa y red activa.
- Tarifa de inyección, crédito de exportación y valor bruto solar eliminados.
- Tarjetas de ahorro compactas y proyecciones separadas de cuenta, red, solar y batería.
- Distribución final del consumo convertida en gráfico de torta responsive.
- Meses cerrados recuperados desde el respaldo permanente de Mi Solar.

# V8.8.5

- Ahorro del sistema definido como solar directo hacia la casa más descarga real de batería hacia la casa.
- Balance auditado con la identidad: consumo = red activa + solar directo + batería.
- Gráficos horarios e históricos actualizados con el aporte total del sistema solar.
- Nueva proyección de cuenta eléctrica al cierre del mes basada en la red activa observada.
- Crédito por exportación separado del ahorro por autoconsumo.

# V8.8.4

- Regla global de red: potencia e históricos válidos únicamente con `statusGrid = 1`.
- Gráficos principales, históricos y acumulados migrados al cálculo efectivo centralizado.
- Costos y ahorro recalculados con red activa y solar directo estimado.
- Equipos y componentes de compatibilidad alineados con el mismo criterio.
- Archivo permanente normalizado y vistas horarias/diarias corregidas sin alterar el dato bruto de auditoría.

# V8.8.3

- Red diaria integrada únicamente cuando `statusGrid` está activo en 1.
- Cobertura local separada entre solar directo estimado y descarga de batería.
- Producción solar, carga total y carga solar estimada mostradas por separado.
- Avance del día calculado sobre las 24 horas y explicado junto a la cobertura de muestras.
- Pronóstico de lluvia y rango térmico para las próximas 24 horas.
- Estado, avance, clima y calidad de datos trasladados al final de la portada.

# V8.8.2

- Balance de consumo explicado como consumo total menos red igual a aporte solar/batería.
- Producción solar total y hora de la última muestra visibles en la misma sección.
- Semana, mes, clima y radiación pasan a actualizarse cada cinco minutos como máximo.

# V8.8.1

- Diagrama de flujo trasladado al primer lugar de la pantalla de inicio.
- Botón de información del inversor reducido para mantener visible la potencia.
- Nueva barra diaria y mensual con el consumo total y su cobertura por red o por solar/batería, en kWh y porcentajes.

# V8.8.0

- El diagrama de flujo conserva en celular el diseño radial, las líneas y partículas animadas de escritorio.
- Tarjetas de información compactadas proporcionalmente para pantallas pequeñas.
- Velocímetros instantáneos sin barrido desde cero ni animación numérica.
- Nuevos medidores separados para consumo, PV1 y PV2 cuando existe un segundo string.

# V8.7.0

- Gráfico histórico unificado y responsivo para escritorio y celular.
- Períodos seleccionables: 5 h, 12 h, 24 h, 7 d, 14 d, 1 mes, 6 meses y 1 año.
- Zoom, restauración y exportación incorporados a todos los gráficos.
- Carga histórica guiada: El Arrayán desde julio de 2026 y Puerto Montt por 12 meses.
- Series horarias y diarias agregadas en Supabase para consultas extensas eficientes.

# V8.6.0

- Colores de viñetas, puntos y líneas sincronizados en todos los gráficos energéticos.
- Gráficos organizados por día, semana, mes y año.
- Proyección solar ampliada a 14 días y calibración estacional según días históricos cercanos en el calendario.
- La versión visible se obtiene de una única fuente para evitar etiquetas antiguas.

# V8.5.0

- Base PostgreSQL permanente en Supabase para respaldar telemetría por instalación.
- Archivo automático al recibir tiempo real e históricos desde Tumcapp.
- Recuperación desde el archivo Mi Solar cuando el origen no responde.
- Buscador histórico por día, semana, mes y rango personalizado.
- Seguridad RLS, clave adicional del backend e índices temporales auditados.

# V8.4.0

- Línea de tiempo superior para revisar muestras históricas por hora y volver a tiempo real.
- Estado digital `statusGrid`/`gridStatus` aplicado al flujo instantáneo de red.
- El acumulado diario de red se conserva separado de la decisión instantánea de uso.
- Inversor corregido para no sumar red como potencia procesada.
- Perfil horario normalizado de sombra para El Arrayán, listo para recalibración documental.
- Tipos, dependencias reproducibles y estructura de archivos de compilación profesionalizados.
