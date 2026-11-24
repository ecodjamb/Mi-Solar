# Mi Solar v8.80.0

- Radiación muestra temperatura actual, mínima y máxima del día; cada día próximo incorpora sus temperaturas mínima y máxima de Open-Meteo.
- El modelo estacional explicita las fechas de cada estación, actualiza los rangos de producción de El Arrayán para la instalación vigente de 10,54 kWp y valoriza el ahorro mensual promedio con la tarifa configurada.
- Mis gastos contabiliza ingresos y gastos inmediatamente, con o sin fotografía; se retiran los controles de aprobación de movimientos de cuenta corriente y se conserva la auditoría, edición administrativa y anulación.

# Mi Solar v8.79.9

- Inicio y Enel valorizan ahora el ahorro desde una única fuente canónica: la producción fotovoltaica real respaldada de PV1 + PV2.
- Los acumulados de 30 y 365 días comparten exactamente el mismo rollup diario y el mismo filtro de calidad que el gráfico histórico, eliminando diferencias entre tarjetas y gráficos.
- El gráfico histórico reutiliza la consulta anual ya cargada por Inicio, evitando una segunda descarga idéntica y reduciendo trabajo del servidor.
- La cobertura del consumo por solar, batería y red se conserva como indicador independiente para no confundir producción fotovoltaica con energía entregada a la casa.
- Los registros históricos permanecen intactos; el cambio corrige únicamente la selección, presentación y valorización de los datos.

# Mi Solar v8.79.8

- El widget Alexa v1.0.15 corrige el desborde observado en el Echo Show 11: fija alturas para 328×552 dp, mantiene visibles las cuatro tarjetas y reduce las cifras solo lo necesario para evitar cortes.
- La composición recupera la identidad de Mi Solar con tarjetas verde, violeta, batería y red, resumen diario compacto y animación discreta de los flujos activos.
- El widget Alexa v1.0.14 agrega movimiento APL discreto a los flujos activos de solar, consumo, batería y red, sin reducir el tamaño de los indicadores.
- La potencia de red se fuerza a `0 W` cuando el inversor informa `statusGrid = 0`, evitando repetir erróneamente el consumo de la casa.
- La versión canónica, el manifiesto, la vista APL, la Lambda y el icono de galería quedan sincronizados en v1.0.14.
- `/monitor` amplía 2,5 veces la cabecera del Echo Show 11: hora, último dato, selector de instalación y controles quedan legibles y táctiles a distancia.
- El widget Alexa v1.0.13 usa cuatro tarjetas simétricas, iconos equivalentes, valores más grandes y hora visible de la última muestra.
- El manifiesto y el icono de galería quedan sincronizados en v1.0.13, sin reutilizar la insignia gráfica antigua.

# Mi Solar v8.79.7

- `/monitor` reconoce Silk por navegador, proporción y viewport real, sin depender de que el Echo Show 11 informe exactamente su resolución física.
- Las cuatro tarjetas y el inversor aumentan tamaño, jerarquía y cifras para lectura a distancia, conservando únicamente el flujo energético y la cabecera mínima.
- La permanencia combina Screen Wake Lock y una pista WAV HTML5 local de 30 Hz y amplitud PCM mínima; se reactiva al volver, recuperar foco o tocar la pantalla, sin consultas externas ni sonido perceptible.
- Media Session identifica la reproducción como “Mi Solar · Estado monitor”; si Silk bloquea la reproducción automática, el primer toque activa simultáneamente multimedia, Wake Lock y pantalla completa.

# Mi Solar v8.79.6

- Estado monitor detecta específicamente el Echo Show 11 de 1920×1200 y amplía tarjetas, cifras, SOC, potencia de batería, red e inversor sin depender de los píxeles CSS que Silk reporte.
- El botón “Mantener activa” combina Screen Wake Lock con un respaldo multimedia de consumo prácticamente nulo para sostener la sesión cuando Silk no implementa el bloqueo web.
- El monitor conserva únicamente el flujo energético y la cabecera mínima, sin reintroducir clima, línea del día ni balance inferior.
- Mi Solar queda como única aplicación canónica; Alexa v1.0.9 se integra bajo `alexa/` como complemento de solo lectura y sin autoridad para desplegar Vercel.
- Un contrato automático sincroniza versión, repositorio, proyecto Vercel y complementos antes de aceptar una publicación.
- GitHub Actions valida versiones, TypeScript, pruebas y compilación en cada rama de trabajo y en `main`.

# Mi Solar v8.79.5

- Estado monitor dedica toda la pantalla al flujo energético: amplía las cuatro tarjetas, prioriza el SOC de batería y muestra su potencia debajo para lectura a distancia en Echo Show 11.
- El monitor elimina la línea climática y el balance inferior; conserva únicamente la cabecera mínima, el selector de instalación y el diagrama animado.
- Agrega la ruta protegida y de solo lectura `/api/alexa/widget-data`, alimentada exclusivamente desde el archivo de Mi Solar para el widget privado Alexa, sin consultas adicionales a i.Solar ni WatchPower.

# Mi Solar v8.78.0

- Inicio y Radiación comparten la misma “Producción prevista para hoy · configuración actual”; se prioriza el pronóstico meteorológico oficial del backend, con sus variables de nubosidad, opacidad, lluvia, temperatura, viento, orientación y configuración por string.
- “Clima de hoy” agrega mínima, máxima, viento máximo, precipitación total, nubosidad media y humedad actual sin perder la línea horaria, amanecer, atardecer ni posición actual.
- El indicador de la otra instalación muestra en ambos sentidos su producción instantánea y SOC de batería.
- La pantalla abierta vuelve a leer la base propia dos minutos después de perder una fase de publicación, mientras el lease distribuido conserva una única consulta upstream a i.Solar cada cinco minutos.
- Estado monitor reemplaza los tres indicadores solares inferiores por período entre boletas, gasto de red a la fecha, ahorro del período y ahorro de los últimos 30 días; la ruta pública mantiene sólo lectura y no consulta proveedores.

# Mi Solar v8.77.1

- El Arrayán deja de mostrar el corte legado de 50,56 kWh generado antes del modelo meteorológico 8.77.0.
- El registro antiguo se conserva para trazabilidad, pero la API lo omite y entrega la estimación teórica vigente hasta que exista un nuevo corte oficial de las 22:00 creado con ECMWF/GFS/GEM.
- Los nuevos cortes meteorológicos siguen siendo inmutables; la excepción sólo aplica a resultados calculados con la metodología anterior.

# Mi Solar v8.77.0

- El Arrayán usa una proyección solar puramente meteorológica y física, sin correcciones basadas en producción histórica, i.Solar, WatchPower ni generación acumulada del día.
- Calcula por separado PV1 y PV2 con su potencia, orientación e inclinación reales, usando radiación global inclinada horaria de Open-Meteo.
- Combina ECMWF IFS nativo de 9 km, GFS y GEM; incorpora nubosidad baja, media y alta, opacidad estimada, precipitación, código meteorológico, temperatura y viento.
- Conserva el corte oficial inmutable de las 22:00 y el seguimiento meteorológico posterior cada dos horas, mostrando opacidad nubosa y dispersión entre modelos.
- Evita mostrar temporalmente el antiguo cálculo histórico de El Arrayán cuando la nueva respuesta meteorológica todavía no está disponible.

# Mi Solar v8.76.1

- Corrige la cabecera móvil: Estado monitor y Actualizar ahora dejan de compartir la misma celda y ambos botones permanecen visibles.
- Distribuye notificaciones, completar día, monitor y actualización en cuatro posiciones independientes; en teléfonos de hasta 360 px usa una fila exclusiva para evitar compresión o superposición.
- Conserva el acceso público directo `/monitor` y todos los controles existentes sin retirar funciones de la cabecera.

# Mi Solar v8.76.0

- Agrega `https://misolar.vercel.app/monitor` como acceso directo público al Estado monitor, sin usuario, contraseña ni permisos previos.
- La ruta pública queda limitada a una vista sanitizada y de solo lectura: no expone credenciales, finanzas, usuarios, domótica ni controles del inversor.
- El monitor lee exclusivamente la última telemetría y el historial ya respaldados por Mi Solar; abrirlo o actualizarlo no genera consultas adicionales a i.Solar o WatchPower.
- La información se refresca cada minuto mediante una respuesta compartida en caché, conserva el selector El Arrayán/Puerto Montt, pantalla completa y bloqueo de suspensión compatible.

# Mi Solar v8.75.0

- Inicio deja de mostrar como pronóstico el potencial máximo ideal (radiación × kWp): el flujo y el aporte acumulado usan exactamente la “Producción prevista para hoy · configuración actual”, incluido el corte oficial fijado a las 22:00.
- Agrega el botón “Estado monitor” con una vista dedicada de “Tu sistema ahora”, selector entre El Arrayán y Puerto Montt, actualización manual, pantalla completa y bloqueo de suspensión cuando el navegador lo admite.
- El modo monitor se adapta a Echo Show pequeño y grande, iPad, celular y computador, manteniendo visibles instalación, fuente, hora, estado, acumulado y pronóstico diario.
- La dirección `?monitor=1` conserva la vista al recargar, para dejar una pantalla doméstica u oficina funcionando de forma permanente.

# Mi Solar v8.74.0

- “Mis gastos” queda protegido contra dobles ingresos: el formulario bloquea reenvíos, el servidor consolida solicitudes simultáneas y Supabase aplica una llave de idempotencia única cuando la migración está disponible. La ruta compatible conserva la misma llave en instalaciones aún pendientes de migrar.
- “Rendimiento por potencia instalada” usa la tabla teórica mensual acordada para El Arrayán y Puerto Montt, de enero a diciembre, manteniendo la predicción meteorológica como cálculo independiente.
- El flujo de paneles y “Aporte fotovoltaico acumulado” muestran el potencial completo del día calculado con la radiación disponible para la instalación seleccionada.
- Enel abre con el resumen del período y las lecturas reales, continúa con el ingreso de la lectura de hoy y deja “Agregar cuenta” junto al archivo de cuentas mensuales.
- Aguas homologa el orden: consumo real del período, lectura de hoy, análisis y, al final, carga de boleta junto a las cuentas guardadas; el valor editable del m³ permanece disponible sin interferir con el resumen.
- Se conservan todos los parámetros, documentos, lecturas e históricos existentes; los cambios reorganizan la presentación y refuerzan la escritura, sin recalcular ni eliminar registros previos.

# Mi Solar v8.73.0

- Inicio simplifica “Día mostrado”: conserva solar acumulado y reúne ahorro del día, semana, últimos 30 días y últimos 365 días sin duplicar consumo, red o batería del flujo instantáneo.
- Los resúmenes históricos valorizan solar, consumo y red en pesos chilenos para hoy, semana, mes y 365 días; la producción diaria agrega valor solar y ahorro estimado.
- El informe climático identifica Lo Barnechea/Plaza San Enrique y Quillaipe, muestra mínima y máxima de hoy, lluvia acumulada desde medianoche, lluvia de las próximas 24 horas y pronóstico de mañana.
- Radiación, pronóstico, atardecer y clima comparten las coordenadas verificadas de cada casa, evitando cálculos con un punto geográfico genérico.
- El detalle del inversor amplía su ancho en computador y normaliza el firmware Wi‑Fi/logger para impedir texto vertical.
- Debajo de Casa Viva, el mejor día queda primero, el clima tercero y el estado del sistema al final; la carga histórica manual permanece disponible en código pero oculta en Inicio.

# Mi Solar v8.72.1

- Corrige el detalle del inversor de El Arrayán: el modelo instalado, potencia nominal de 12.000 W, dos MPPT y firmwares verificados quedan disponibles aunque la muestra automática no repita la ficha técnica.
- Los valores instantáneos conservan prioridad: temperaturas, modo, salida, potencia y alarmas continúan tomándose de la última telemetría y reemplazan cualquier referencia cuando i.Solar entrega el dato.
- Reordena modelo, capacidad, MPPT, temperaturas y firmware al comienzo del cuadro, amplía su altura y agrega una barra de desplazamiento visible para que ningún parámetro quede oculto.
- Incorpora en el mismo detalle la sobretensión de 24 kVA, entrada FV de 15 kW, ventana MPPT 90–450 V, Voc máximo 500 V, 27 A por MPPT, batería de 48 V, carga máxima de 180 A y eficiencia de 93%.

# Mi Solar v8.72.0

- Integra el perfil técnico comprobado en Proxyman: modelo, firmware principal, firmware secundario, firmware Wi‑Fi/logger, potencia nominal y cantidad de seguidores MPPT.
- El cuadro de información del inversor incorpora uso de capacidad AC, potencia aparente, temperatura interna, temperatura máxima informada y códigos de falla/advertencia, sin usar los totales `0` defectuosos de i.Solar.
- La lectura técnica adicional se hace únicamente al pulsar la actualización instantánea; los ciclos de fondo mantienen la misma cantidad de consultas y conservan los datos técnicos ya obtenidos.
- Valida explícitamente el cruce horario Chile–Shanghái: el día 4 de noviembre de Chile se solicita desde el 4 a las 11:00 hasta el 5 a las 10:59:59 en el servidor i.Solar.

# Mi Solar v8.71.0

- El botón “Actualizar ahora” reproduce la orden comprobada con Proxyman: envía `FORCE_TRAN`, espera una sola transmisión y guarda la nueva muestra instantánea sin sondeo reiterado.
- Agrega “Completar día” junto al botón de actualización para traer el día chileno hasta el momento actual, convertir el rango a Asia/Shanghai, respaldar por upsert y recalcular acumulados, gráficos, Enel, batería y calibración solar.
- Incorpora un respaldo automático diario del día anterior ya cerrado, ejecutado después de medianoche mediante el coordinador de Supabase y una sola sesión compartida por las instalaciones i.Solar.
- La descarga diaria informa cobertura, muestras y energía acumulada, conserva el regulador de 30 segundos y no duplica filas existentes.

# Mi Solar v8.70.0

- Corrige los acumulados diarios que quedaban por debajo de i.Solar: la primera carga de cada sesión vuelve a hidratar el día completo desde la base permanente, aunque el caché local ya tuviera una última fila reciente.
- Mantiene una sola sincronización i.Solar compartida para El Arrayán y Puerto Montt cada cinco minutos, incluso sin una pestaña visible; WatchPower conserva la política adaptativa de ahorro.
- Alinea el cron con el ciclo observado del proveedor: i.Solar publica actualmente cerca de `xx:02:45`, por lo que Mi Solar consulta desde `xx:03` y repite cada cinco minutos.
- En una sesión abierta, el siguiente ciclo se calcula desde la hora real de la última muestra y apunta a diez segundos después de la próxima publicación, sin reintentos rápidos ni consultas superpuestas.
- La reparación histórica invalida la hidratación parcial y vuelve a descargar el día completo para que producción solar, consumo, carga, descarga y destinos de la energía usen exactamente el mismo conjunto de muestras.

# Mi Solar v8.69.1

- Agrega en “Tu sistema ahora” la conciliación diaria del banco de 4 Pylontech UF5000: 20,48 kWh nominales y 19,456 kWh utilizables.
- Traduce el SOC informado por el BMS a energía almacenada estimada y lo contrasta con SOC inicial + carga del día − entrega del día.
- Muestra punto verde cuando la diferencia está dentro de ±5 puntos de SOC y amarillo cuando falta información o la diferencia requiere revisión.
- Incorpora el desglose completo en “Detalles” de la batería sin agregar consultas ni carga adicional a Vercel.

# Mi Solar v8.69.0

- Integra las optimizaciones de capacidad publicadas el 2 y 3 de noviembre con todas las mejoras funcionales de v8.68, evitando que una publicación basada en una versión antigua vuelva a retirar funciones de la interfaz.
- Unifica el flujo visible y el histórico del día en ciclos de cinco minutos, suspende ciclos cuando la pestaña está oculta y conserva una única concesión por sitio/proveedor.
- Incorpora rollups horarios y diarios precalculados, política adaptativa de 5/15 minutos, carga diferida de gráficos y secciones, y separación de pronósticos, recordatorios y monitor en vivo.
- Documenta las nuevas cadencias, tareas deshabilitadas, comprobaciones de salud y procedimiento de reversión en `docs/capacidad-vercel.md`.
- Corrige el ícono de batería de “Tu sistema ahora”: el relleno vuelve a usar el SOC real y ahora se dibuja con un gradiente continuo robusto entre 0% y 100%, usando exactamente el mismo dato del porcentaje textual.
- Agrega una prueba de regresión específica para impedir que una futura optimización vuelva a convertir la batería en un ícono estático.

# Mi Solar v8.68.0

- “Programación” pasa a ser el centro “Automatizaciones”, con inventario único de programación del inversor, piscina A1, piscina A1+A2, corte por atardecer, horarios Tuya y servicios automáticos del sistema.
- Las dos automatizaciones de piscina conservan sus modos Manual, Apagado y Automático y permiten editar todos sus parámetros desde el mismo menú central.
- El corte diario de respaldo deja de estar implícito: ahora tiene un interruptor propio, queda apagado por defecto y solo puede apagar A1/A2 si el superadministrador lo activa expresamente.
- Cualquier horario Tuya existente aparece con dispositivo, rango horario, días y switch Activo/Pausado para identificar con claridad los apagados a hora fija.
- El inventario puede consultarse usando i.Solar o WatchPower; solo la escritura de Output y Redischarge continúa dependiendo de i.Solar.

# Mi Solar v8.67.1

- El ícono de batería de “Tu sistema ahora” rellena su interior de forma continua y proporcional al SOC real: 25%, 50%, 73% o cualquier valor disponible.
- Mantiene el contorno, color verde y tamaño del diseño original; el porcentaje textual y los detalles continúan disponibles como respaldo accesible.

# Mi Solar v8.67.0

- El Arrayán estrena la fotografía real de la configuración vigente: PV1 con 9 paneles en el techo principal y PV2 con 8 paneles en el techo de motos.
- La misma fotografía actualizada se mantiene en amanecer, día, atardecer y noche mediante las capas ambientales existentes, sin volver a mostrar configuraciones antiguas.
- Inicio incorpora entre el flujo instantáneo y el rendimiento una línea climática compacta de 24 horas, con precipitación, posición actual, amanecer y puesta de sol exactos.
- El resumen reutiliza el pronóstico ya cargado por Mi Solar y no genera consultas meteorológicas adicionales ni modifica la sección Radiación.

# Mi Solar v8.66.4

- Aguas restaura el valor correcto de seguimiento a $1.500 CLP por m³ y lo aplica al consumo, promedio diario y proyección del período.
- El mes en curso muestra una celda editable “Valor del metro cúbico de agua”, con guardado permanente por instalación y validación entre $1 y $100.000.
- Las cuentas históricas conservan sus montos reales; el valor editable solo afecta el seguimiento y las proyecciones del período vigente.

# Mi Solar v8.66.3

- Aguas aplica la jerarquía grande de los montos CLP también en su hoja de estilos específica, evitando que el orden de carga vuelva a reducirlos.

# Mi Solar v8.66.2

- La línea meteorológica alinea 00, 06, 12, 18 y 24 exactamente con su proporción dentro de los 24 bloques horarios.
- Amanecer y atardecer se marcan sobre la escala en su minuto real; las horas sin datos conservan su espacio para no deformar la cronología.
- Aguas destaca con igual jerarquía visual los m³ y pesos consumidos, la proyección en m³ y pesos, y el gasto promedio diario calculado a $2.500/m³.

# Mi Solar v8.66.1

- Inicio recupera el Output real del inversor desde la telemetría o, si i.Solar no publica S05 en la muestra instantánea, desde el último cambio confirmado y auditado en Mi Solar, sin generar una consulta adicional al proveedor.
- Aguas valoriza el consumo y la proyección del período en curso a $2.500 CLP por m³.
- Radiación aísla los estilos de su línea meteorológica de 24 horas: desaparecen los espacios negros y el icono de lluvia flotante, se respetan lluvia y nubosidad nocturnas y se muestran las horas de amanecer y atardecer.

# Mi Solar v8.66.0

- Inicio muestra junto al inversor la prioridad de salida real: SBU, SOL o Utility; el normalizador ya no descarta ese parámetro al unificar i.Solar y WatchPower.
- Enel elimina del pie del gráfico los montos duplicados y conserva el período actual entre boletas con las comparaciones de Mi Solar y lecturas reales.
- Aguas concentra el mes en curso en consumo, gasto a la fecha, promedio diario y proyección por lecturas en m³ y pesos; elimina la proyección histórica duplicada.
- Radiación incorpora precipitación diaria en milímetros y una línea de tiempo de 24 horas para hoy y los próximos días, con noche, amanecer, sol, nubes, lluvia y atardecer.
- La consulta meteorológica agrega `is_day` y `precipitation_sum`, conserva la radiación oficial de Open-Meteo y su conversión documentada desde MJ/m² a kWh/m².

# Mi Solar v8.65.0

- Simplifica el período actual de Enel a dos filas comparables: Mi Solar y lecturas reales.
- Cada fila muestra consumo y gasto acumulados a la fecha, además de consumo y costo proyectados al cierre del período.
- La medición real identifica la última lectura utilizada y ambos costos a la fecha aplican la misma tarifa por kWh de su proyección.
- Optimiza la presentación para teléfono sin duplicar indicadores ni mezclar la predicción meteorológica con el consumo eléctrico.

# Mi Solar v8.64.1

- Corrige el alta de usuarios que parecía no responder: el botón Guardar ya no queda desactivado silenciosamente por una contraseña incompleta.
- Muestra junto al formulario el requisito exacto que falta y valida nombre, usuario, contraseña temporal de 8 caracteres y correo opcional sin depender de mensajes nativos ocultos del navegador.
- Informa claramente cuando el nombre de usuario ya existe, sin modificar el usuario anterior ni crear registros parciales.

# Mi Solar v8.64.0

- Simplifica la tarjeta de rendimiento conservando su gráfico y dejando una sola línea comparativa con la escala visual de −3 a +3.
- Usa referencias locales: Puerto Montt 3,58 kWh/kWp/día y Santiago / El Arrayán 4,21 kWh/kWp/día.
- Prorratea la referencia durante el día y aplica el valor diario completo al finalizar; la predicción meteorológica continúa separada.
- Traslada método, fuentes y alcance anual al botón informativo y actualiza la línea de referencia del histórico sin modificar los datos guardados.

# Mi Solar v8.63.0

- Puerto Montt queda corregido a su configuración física confirmada: 6 paneles JA Solar de 615 W conectados en serie, 3,69 kWp instalados desde el 18-09-2026.
- Inicio recalcula el rendimiento por potencia instalada y la meta promedio de 4,5 kWh/kWp a 16,61 kWh diarios; El Arrayán permanece en 47,43 kWh diarios.
- Equipos, Radiación, modelos estacionales, gráficos por kWp y proyecciones comparten la misma potencia instalada de 3,69 kWp.
- El historial técnico sustituye la configuración errónea de 1,29 kWp por la corrección confirmada, sin crear un período ficticio ni borrar la configuración anterior de 3 paneles.
- La calibración meteorológica de Puerto Montt conserva el día patrón del 08-10-2026, ahora normalizado contra la potencia correcta.

# Mi Solar v8.62.0

- Inicio compara el rendimiento por potencia instalada de El Arrayán y Puerto Montt contra una referencia diaria independiente de 4,5 kWh/kWp, sin reutilizar la proyección meteorológica de Radiación.
- Para el día en curso, la referencia se distribuye entre la salida y la puesta de sol y muestra cuánto debería haberse generado hasta la hora de consulta; para días anteriores se compara contra los 4,5 kWh/kWp completos.
- El estado informa explícitamente si la instalación está sobre, en torno, bajo o muy bajo el promedio, además de la diferencia porcentual y energética.
- Radiación mantiene su modelo propio con Open-Meteo, datos históricos y el corte inmutable de las 22:00; ambos indicadores quedan separados conceptual y visualmente.
- El Arrayán corrige el 08-10-2026 desde el valor manual referencial de 20 kWh a 17,08 kWh, calculado con la radiación Open-Meteo capturada a las 22:00 y el algoritmo vigente, sin alterar la muestra meteorológica original.

# Mi Solar v8.61.0

- Puerto Montt se rectifica a 6 paneles de 215 W en serie: 1,29 kWp instalados desde el 18-09-2026. Equipos, rendimiento y proyecciones comparten ahora esa única fuente técnica.
- La tarjeta de radiación muestra la hora de captura y la fuente del pronóstico oficial; el valor diario permanece inmutable desde el corte de las 22:00 del día anterior.
- Puerto Montt calibra sus próximas proyecciones con el día patrón del 08-10-2026, relacionando producción real, radiación del corte nocturno y potencia instalada.
- El Arrayán usa una regresión estacional robusta y excluye de análisis y gráficos diarios las jornadas con menos de 5 kWh solares, menos de 5 kWh de consumo o cobertura insuficiente, sin borrar los registros originales.
- Rendimiento por potencia instalada muestra explícitamente cuánto debería haberse producido a la hora actual y aclara que esa referencia usa el pronóstico meteorológico del día; 4,5 kWh/kWp/día queda sólo como comparación internacional de largo plazo.

# Mi Solar v8.60.2

- El corte confirmado de El Arrayán para el 8 de octubre se identifica también por instalación lógica, no sólo por el número de serie físico.
- Un registro inválido no puede volver a reemplazar el valor oficial confirmado de 20,00 kWh fijado el día anterior a las 22:00.
- Se añadió trazabilidad segura en producción para verificar el valor y la hora oficial que entrega la API.

# Mi Solar v8.60.1

- Radiación conserva como valor principal la proyección oficial fijada a las 22:00 del día anterior; la meteorología posterior nunca vuelve a sustituirla.
- Recupera para el 08-10-2026 el corte confirmado de El Arrayán de 20,00 kWh, que había sido mostrado pero no persistido.
- El seguimiento meteorológico se guarda en intervalos de dos horas y aparece separado, con hora, diferencia, radiación y metodología anterior, siempre fuera del cálculo oficial.
- El proceso programado conserva candidatos previos al corte para poder reconstruir automáticamente un pronóstico si una interrupción coincide con las 22:00.
- La apertura de Radiación reconcilia de manera idempotente un corte faltante sin modificar los cortes ya guardados.
- Corrige la causa de persistencia: los cortes oficiales usan una inserción inmutable y ya no requieren permisos de actualización de Supabase.
- La pantalla consulta el corte oficial aunque Open‑Meteo esté caído; el proveedor meteorológico queda desacoplado del valor persistido.

# Mi Solar v8.60.0

- Puerto Montt queda actualizado a 6 paneles JA Solar de 615 W conectados en una sola serie: 3,69 kWp instalados desde el 08-10-2026. La configuración anterior de 3 paneles se conserva en el historial.
- Inicio incorpora antes del aporte fotovoltaico un gráfico de producción específica en kWh/kWp para comparar justamente instalaciones de distinto tamaño.
- El Arrayán muestra el rendimiento normalizado de toda la instalación, del String 1 y del String 2; Puerto Montt muestra el total y su string único.
- El bloque califica el desempeño del día contra la proyección local acumulada a la hora consultada y explica la referencia internacional de largo plazo para Chile.
- Los gráficos históricos agregan una serie diaria de kWh/kWp, comparación por string y referencia chilena de 4,5 kWh/kWp/día.
- Radiación y proyecciones de Puerto Montt usan la nueva potencia instalada y normalizan la configuración histórica previa al cambio.

# Mi Solar v8.59.2

- Corrige un bloqueo falso de i.Solar: los timeouts internos del archivo histórico ya no incrementan los fallos del proveedor ni abren su pausa preventiva.
- La escritura histórica se divide en lotes de 100 muestras para evitar el `statement_timeout` que originó el incidente.
- El circuito sigue protegiendo la cuenta frente a errores reales de i.Solar, como límite de solicitudes, credenciales inválidas o bloqueo remoto.

# Mi Solar v8.59.1

- Inicio agranda el nodo central del inversor en teléfonos y separa el valor estimado de consumo propio de su etiqueta para que ambos se lean completos sin salir del círculo.
- Computadores y televisores mantienen la composición amplia existente; el ajuste responsivo se limita al flujo móvil.

# Mi Solar v8.59.0

- Equipos corrige el banco real a 4 Pylontech UF5000 en paralelo: 20,48 kWh nominales y 19,456 kWh utilizables al 95% de profundidad de descarga.
- La ficha del Axpert VM II Premium Plus 12K 48V incorpora potencia, sobretensión, eficiencia, batería, carga, comunicaciones y límites de sus dos MPPT.
- Cada string muestra potencia, corriente, voltaje de operación y Voc calculado a −20, −10, −2, 10 y 20 °C, incluyendo una advertencia visible cuando la tolerancia de placa puede superar 500 V.
- Inicio muestra en el nodo del inversor la potencia total procesada y una estimación conservadora de su consumo propio; si la muestra no cierra eléctricamente, evita publicar un valor engañoso.
- Radiación fija la proyección oficial de configuración actual y anterior a las 22:00 del día previo y conserva revisiones informativas una vez por hora sin alterar el cálculo oficial.
- Enel comienza con el ingreso directo de lectura y nota opcional, permite revisar las últimas lecturas y ordena el gráfico diario, el período entre boletas y ambas proyecciones finales en kWh y pesos.

# Mi Solar v8.58.0

- Inicio conserva desde la base canónica los voltajes y corrientes de PV1/PV2, la corriente firmada de batería, el voltaje de salida y las temperaturas interna y del disipador, tanto para i.Solar como para WatchPower.
- La normalización i.Solar acepta los alias reales adicionales usados por distintas versiones del inversor; WatchPower también conserva las mediciones técnicas disponibles al convertirlas para la interfaz.
- Los detalles distinguen un cero real de un parámetro ausente: si el proveedor no entregó el campo se informa “No disponible” en vez de mostrar 0 engañosamente.
- Consumo de la casa queda reducido a potencia activa, frecuencia, potencia aparente y acumulado diario. Se eliminan voltaje/corriente de salida y carga del inversor; el inversor conserva su voltaje, frecuencia y temperaturas, sin el porcentaje ambiguo “Carga”.
- El generador de respaldo de Puerto Montt mantiene todos sus parámetros.

# Mi Solar v8.57.0

- El Arrayán queda configurado desde el 01-10-2026 con 17 paneles de 620 W (10,54 kWp): String 1 de 9 paneles —4 Ulica y 5 OSDA— a 290° oeste/38°, y String 2 de 8 OSDA a 348° norte/20°.
- Equipos registra el banco de baterías; la identificación inicial como US5000 queda corregida en v8.59.0 al modelo físico verificado UF5000.
- El modelo de radiación, la curva horaria, los límites estacionales, las proyecciones oficiales, Inicio, Programación y las proyecciones que consumen otros módulos usan la configuración nueva desde su fecha efectiva.
- Los días históricos anteriores al cambio se normalizan por potencia y geometría para iniciar el modelo nuevo sin reescribir su producción real; los datos posteriores al 1 de octubre reemplazarán progresivamente esa referencia.
- Radiación conserva hasta el 30-09-2027 una línea violeta independiente con la proyección de la configuración anterior de 8,68 kWp, además de referencias estacionales antiguas en letra chica.
- Equipos incorpora un historial permanente de configuraciones dentro del registro protegido existente. Cada edición o eliminación posterior guarda una fotografía de los equipos vigentes y su fecha.

# Mi Solar v8.56.0

- Corrige el consumo del mes en curso cuando el medidor ya arrastra un número de ciclo histórico: 37,670 − 22,840 ahora informa 14,830 m³.
- El promedio diario usa los días transcurridos desde el inicio del período hasta la fecha actual de consulta, no hasta la fecha de la última lectura.
- La proyección por lecturas reales se activa correctamente desde la primera medición del período.
- Cada cuenta mensual incorpora “Editar cuenta” para corregir fechas, lecturas, consumo, importes, medidor y datos comerciales sin perder la foto o el PDF original.
- Al corregir ambas lecturas, la diferencia se recalcula automáticamente y la actualización queda limitada a la cuenta seleccionada y su instalación.

# Mi Solar v8.55.0

- Aguas avanza automáticamente al ciclo siguiente cuando se guarda una boleta: el nuevo seguimiento comienza al día siguiente de la última lectura facturada.
- El ciclo dura 30 días desde el cierre anterior; una boleta cerrada el 10 de septiembre crea el período 11 de septiembre–10 de octubre y se presenta como octubre.
- Las lecturas posteriores al cierre se reasignan de forma idempotente al mes en curso, conservando valores, fotografías e historial del período anterior.
- La última lectura de la boleta queda como base inicial del nuevo ciclo y alimenta correctamente el consumo acumulado.
- El mes en curso muestra dos proyecciones independientes: lineal por lecturas reales e histórica por cuentas anteriores.

# Mi Solar v8.54.1

- Restaura el flujo compacto anterior para subir una cuenta de agua; foto, rollo y PDF permanecen dentro del mismo cuadro.
- Subir una boleta ya no cierra el período abierto, crea ciclos duplicados ni reasigna lecturas existentes.
- Repara automáticamente un período inválido cuando la fecha inicial y la próxima lectura quedaron iguales.
- Una fecha de lectura vencida se identifica como tal y ya no se muestra engañosamente como “Hoy”.

# Mi Solar v8.54.0

- Aguas ofrece tres entradas claras para una boleta: sacar una foto, elegir una imagen guardada o subir el PDF original.
- Los PDF se analizan directamente como documento, se guardan en el almacenamiento privado y pueden volver a abrirse desde el historial.
- El selector se renderiza fuera del contenedor desplazable y por encima de la navegación, con altura adaptable y desplazamiento interno en iPhone.
- Guardar una boleta conserva todas las lecturas: cierra el ciclo en la fecha final de la cuenta y abre el siguiente ciclo desde esa misma fecha, no desde el mes calendario.
- Las lecturas guardadas quedan visibles dentro del detalle del período de facturación correspondiente.

# Mi Solar v8.53.4

- Sustituye el menú `fixed` por un marco móvil estable: únicamente el contenido se desplaza y la navegación queda fuera del área de scroll.
- Elimina aceleración y desenfoque de la navegación, evitando que iOS reutilice una capa gráfica en una posición antigua al reabrir la aplicación.
- El cuadro de parámetros queda anclado sobre el menú con separación permanente, altura máxima adaptable y desplazamiento interno para mostrar todo el texto.
- Agrega pruebas contra regresiones de posición, reanudación, scroll y solapamiento entre el cuadro y el menú.

# Mi Solar v8.53.3

- Corrige el menú móvil que podía quedar a mitad de pantalla al regresar a Mi Solar desde segundo plano.
- Elimina el desplazamiento calculado con `visualViewport`, cuyo valor podía quedar obsoleto en iOS.
- Ancla la navegación directamente al borde inferior seguro del iPhone y reserva el espacio necesario al final del contenido.
- Conserva una capa gráfica estable para evitar saltos del menú al reanudar, hacer zoom o cambiar la orientación.

# Mi Solar v8.53.2

- Aumenta la altura de las dos filas de automatización de piscina en celular.
- Presenta el título completo sobre el selector Manual · Apagado · Automático, sin truncarlo.
- Identifica claramente “Automatización bomba de agua piscina” y “Automatización bomba de calor piscina”.
- Conserva sin cambios los modos y estados físicos de A1/A2.

# Mi Solar v8.53.1

- Restaura la ficha blanca de parámetros al explorar los gráficos.
- La ficha se ubica fuera del lienzo y se actualiza al tocar o recorrer el eje, por lo que nunca cubre curvas, barras, escalas ni el desplazamiento.
- Elimina el lector oscuro inferior y conserva navegación, pantalla completa y descarga.
- Mantiene intactas las dos automatizaciones mutuamente excluyentes de la piscina incorporadas en v8.53.0.

# Mi Solar v8.53.0

- Elimina el globo flotante que tapaba los valores del gráfico y concentra fecha, series y valores en el lector persistente ubicado debajo del gráfico.
- Domótica incorpora una segunda automatización exclusiva para operar solamente A1, la bomba de agua de la piscina.
- Las automatizaciones “bomba de agua” y “bomba de agua + bomba de calor” son mutuamente excluyentes: al activar una, la otra queda en Apagado.
- La bomba de agua reutiliza las condiciones solares A/B, SOC, descarga máxima, confirmaciones, tiempo mínimo, bloqueo de rearranque, telemetría y corte previo a la puesta de sol.
- Conserva el modo actual de la automatización de bomba de calor al migrar y no ejecuta órdenes físicas durante la publicación.

# Mi Solar v8.52.0

- Domótica presenta la automatización de la bomba de calor en una sola línea minimalista, con todos los parámetros y diagnósticos dentro de un desplegable.
- Incorpora un selector persistente de tres posiciones: Manual, Apagado y Automático.
- Manual ejecuta y confirma la secuencia A1 → espera de circulación → A2, y mantiene la prioridad directa hasta cambiar de modo.
- Apagado es un punto neutro real: bloquea toda acción de Mi Solar sin modificar el estado físico de A1 ni A2.
- Automático conserva las condiciones solares, tiempos mínimos, protección de circulación, descarga, telemetría y corte previo a la puesta de sol.
- El modo queda guardado en la base de datos, conserva el estado vigente durante la migración y registra cada cambio en el historial.

# Mi Solar v8.51.0

- Todos los gráficos de Inicio, Enel y Aguas incorporan un lector táctil persistente que mantiene juntos la fecha y los valores de cada serie.
- Agrega navegación Anterior/Siguiente, acceso al último dato, restablecimiento, pantalla completa y descarga como imagen.
- En iPhone, el detalle seleccionado queda visible sobre el menú inferior y puede cerrarse sin perder el punto del gráfico.
- Optimiza la consulta histórica y agrega un índice cubriente para evitar que los gráficos queden vacíos por vencimiento de la base de datos.
- Mantiene intactos los cálculos energéticos, de costos y de agua; la mejora es transversal a su visualización y exploración.

# Mi Solar v8.50.0

- Corrige el abono familiar de $88.240: el movimiento #15 queda registrado desde `ecodjamb` hacia `mcodjamb` y el saldo de Mateo queda en $0.
- Los ingresos depositados por el propio superadministrador se aprueban y aplican inmediatamente al saldo; gastos y movimientos en nombre de terceros conservan su revisión.
- Al trabajar con la cuenta de otro usuario, la contraparte predeterminada es la sesión actual y ya no el primer familiar del listado.
- Evita que una respuesta anterior sobrescriba el saldo actualizado de “Mis gastos”.
- Mantiene el menú móvil anclado al borde inferior real al volver del reposo, rotar o ampliar la pantalla en iPhone.

# Mi Solar v8.37.1

- Corrige la lectura del 22 de agosto de 2026 a 7.897,593 m³ y muestra una diferencia exacta de 1,817 m³ frente a 7.899,410 m³.
- Detecta automáticamente el reemplazo o reinicio del medidor cuando la lectura acumulada baja.
- Inicia un nuevo ciclo de contador sin restarlo contra el medidor anterior y mantiene acumulado el consumo válido de ambos medidores.
- Identifica visualmente la primera lectura del nuevo medidor y evita saltos negativos o consumos artificiales.

# Mi Solar v8.37.0

- Costos conserva un corte diario de la proyección Mi Solar y de la proyección por lecturas reales para cada período Enel.
- Al ingresar una cuenta, ambas proyecciones quedan congeladas dentro del registro y no cambian al recalcular datos posteriores.
- El detalle de cada cuenta nueva compara kWh y monto real contra ambos modelos, mostrando sus diferencias para recalibración futura.
- Las 31 cuentas históricas existentes se mantienen intactas y no reciben valores retroactivos inventados.

# Mi Solar v8.36.1

- Corrige Probar conexión, Actualizar credenciales y Sincronizar ahora para ejecutarse de inmediato, sin esperar la cola de consultas históricas.
- Cada proveedor muestra progreso y resultado junto al botón accionado, incluyendo cantidad de equipos y nuevas lecturas de una sincronización.
- Desconectar usa una confirmación propia y conserva intactos todos los históricos; únicamente elimina la credencial cifrada y la sesión del proveedor.

# Mi Solar v8.36.0

- Costos incorpora al inicio un gráfico diario comparativo de red activa (`statusGrid = 1`) y producción solar total.
- El gráfico permite alternar entre mes calendario y período vigente entre boletas Enel, con promedio, acumulados, monto y proyección a 30 días.
- Los resúmenes y proyecciones superiores de Costos ahora usan los rangos comerciales reales guardados en las boletas (por ejemplo, 20 de junio–22 de julio), manteniendo intacto el módulo de cuentas Enel.

# Mi Solar v8.35.0

- “Accesos” se convierte en el menú independiente “Domótica”, dedicado a portón, artefactos, sensores y horarios.
- Usuarios incorpora dos paneles desplegables: gestión completa de usuarios y credenciales cifradas de i.Solar/WatchPower.
- Técnico deja de ocupar un menú independiente y todo su diagnóstico queda integrado al final de Equipos.
- Se conservan los endpoints, credenciales, permisos, históricos y fichas existentes sin migrar ni eliminar datos.

# Mi Solar v8.34.1

- Unifica Inicio y Costos usando como fuente prioritaria la importación de red acumulada exclusivamente con `statusGrid = 1`.
- Corrige la asignación de origen: red efectiva primero, luego batería y finalmente solar directo.
- El cuadro “Consumo cubierto por origen” muestra exactamente la misma red activa acumulada que el flujo superior.

# Mi Solar v8.34.0

- Las mesadas recuperan de forma idempotente fechas programadas omitidas por un despliegue o una caída del cron.
- La apertura de Familia concilia los últimos 35 días y crea solamente los cargos que realmente falten.
- Equipos incorpora especificaciones adicionales: tecnología, voltaje, corriente, conexión, serie y garantía.
- Familia recibe iconos más lúdicos en su encabezado, navegación y gastos recurrentes.

# Mi Solar v8.32.0

- Cuenta corriente familiar con formato bancario, saldo corrido y cierres por año.
- Gastos recurrentes integrados en “Agregar gasto” y administrados en un panel separado.
- Préstamos pendientes arrastrados al año siguiente y préstamos pagados archivados en verde.
- Familia, Agua y Usuarios separados del encabezado de telemetría solar.
- Usuarios más compactos y responsivos.

# Mi Solar v8.31.1

- Permite editar y eliminar gastos recurrentes conservando su historial.
- Permite anular movimientos y notifica a las contrapartes involucradas.
- Confirma fotografías opcionales para ingresos y gastos, con extracción por IA.

# Mi Solar v8.31.0

- Reduce Familia a dos menús: cuenta corriente y préstamos.
- Agrega saldo permanente, historial ilimitado, fotos opcionales y gastos recurrentes.
- Permite compartir cuentas familiares con autorización validada en backend.
- Admite préstamos con integrantes externos y una línea cronológica de pagos por préstamo.

# Mi Solar v8.30.0

- Unifica mesadas, gastos y depósitos en una cuenta corriente por usuario.
- Las mesadas recurrentes generan un único cargo negativo enlazado e idempotente.
- Mantiene préstamos como módulo independiente y conserva aprobación, comprobantes e IA.
- Impide movimientos o mesadas sin dos participantes distintos.
- Pausa, sin borrar, configuraciones antiguas donde beneficiario y pagador son la misma persona.

# Mi Solar v8.29.0

- Familia rediseñada con submenús superiores, indicadores y estadísticas por usuario.
- Rendiciones, depósitos, préstamos y pagos exigen comprobante privado; OpenAI propone los campos y el usuario los valida antes de guardar.
- Nuevo flujo de aprobación del superadministrador, auditoría y participantes explícitos en cada movimiento.
- Mesadas semanales seleccionan día de la semana; las mensuales, día del mes.
- El bootstrap antiguo queda desactivado y sin privilegios; `ecodjamb` es el único superadministrador activo.

## v8.28.6

- Restaurada la carga de boletas, comprobantes y lecturas de Agua al usar la referencia canónica `site:2` de El Arrayán.

## v8.28.5

- La telemetría i.Solar se normaliza desde el contenido real de la respuesta y ya no desde su sobre de transporte.

## v8.28.4

- Corregida la lectura canónica de i.Solar: usa el endpoint real del flujo instantáneo y la paginación admitida por Tumcapp.
- Los errores de i.Solar ahora conservan un código y mensaje sanitizados útiles para diagnóstico.

## v8.28.3

- i.Solar: se conserva y persiste el token renovado que devuelve cada consulta, evitando el estado conectado con lecturas posteriores fallidas.
- i.Solar: una sesión antigua inválida se renueva una sola vez, sin bucles ni ráfagas de login.
- Sincronización: i.Solar y WatchPower se actualizan en el proceso automático; con Inicio abierto, la lectura del proveedor se solicita cada dos minutos y el botón Actualizar fuerza una consulta inmediata.
- Sincronización: un reclamo atómico en la base de datos impide consultas simultáneas del cron y de varios teléfonos.
- Inicio: “Consulta” refleja la hora real en que el teléfono comprobó el respaldo, mientras “Último dato” mantiene la hora efectiva de la muestra.
- Acceso: tarjetas, estados, botones y formularios se reorganizan sin desbordes en iPhone.

# Mi Solar v8.28.2

- Proveedores: la ejecución automática se marca exitosa después de persistir la muestra, sin invocar una operación de estado inexistente.

# Mi Solar v8.28.1

- WatchPower: se validó la respuesta real del inversor y se agregaron los nombres efectivos de PV1, PV2, frecuencia y modo instantáneo.
- WatchPower: se documenta y corrige la desviación exacta de 12 horas del epoch del datalogger, conservando la marca original y la transformación aplicada.
- WatchPower: “Battery Mode” determina red inactiva aunque exista voltaje; la potencia de red queda en cero en ese estado.

# Mi Solar v8.28.0

- Usuarios: validación visible de la contraseña exacta de 8 caracteres antes de enviar; menús traducidos y acciones explicadas.
- Usuarios: la cuenta accidental desactivada `[SENSITIVE]` deja de mostrarse sin borrar su registro ni su auditoría.
- Acceso: credenciales y domótica quedan agrupadas en dos secciones desplegables.
- Proveedores: al guardar credenciales se revoca la sesión anterior, se valida la conexión y se guarda inmediatamente la primera lectura.
- Proveedores: los estados cambian a conectado solo después de una comprobación real exitosa.
- WatchPower: sincronización controlada cada cinco minutos mediante el proceso automático existente, con muestras separadas por proveedor.
- Datos: Inicio consulta la última muestra persistida de la fuente seleccionada; Actualizar fuerza una lectura nueva del proveedor.
- Datos: gráficos, radiación, costos y demás históricos vuelven a leer el archivo permanente de Mi Solar y ya no muestran ceros por seleccionar WatchPower.
- Seguridad: se conserva WatchPower exclusivamente en modo lectura y no se modificó ningún dato histórico.

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
# V8.45.0

- Nuevo menú Chat IA para consultar y analizar la base histórica de Mi Solar.
- Herramientas de lectura controladas para energía, calidad, proveedores, Enel, Aguas, equipos, radiación, domótica, piscina, notificaciones y finanzas familiares.
- Respuestas con fuentes consultadas, contexto de instalación y conversación continua.
- Protección de secretos, permisos por instalación, límite de consultas y auditoría sin guardar el contenido del chat.

# V8.45.1

- Aguas incorpora un acceso directo y compacto al WhatsApp de Benjamín Guajardo junto al contador de la próxima lectura.
- El botón utiliza el enlace móvil oficial, mantiene una etiqueta accesible y adapta su posición para pantallas pequeñas.
# V8.46.0

- Aguas: el acceso directo a WhatsApp de Benjamín prepara el saludo, RUT, número de cliente, período y última lectura registrada.
- iPhone: el menú inferior vuelve a usar anclaje fijo al borde seguro y deja de recalcular su altura al hacer zoom, reanudar la app o cambiar el viewport.
- WatchPower: Inicio, Enel y todos los gráficos consultan el histórico canónico aislado por proveedor; PV1, PV2 y energía diaria se calculan desde las muestras WatchPower guardadas.
- La caché del navegador queda separada por instalación y proveedor para impedir que datos i.Solar aparezcan al seleccionar WatchPower, o viceversa.
- La sincronización automática de WatchPower queda regulada a un ciclo efectivo de cinco minutos mediante la concesión distribuida existente.
- La serie agregada de WatchPower reutiliza el RPC privado ya autorizado; no abre nuevas tablas ni permisos públicos en Supabase.

# V8.47.0

- Domótica muestra el control manual del circuito de piscina junto al corte diario de respaldo, sin abrir la configuración.
- El modo de prueba manual mantiene A1 y A2 encendidos hasta que el usuario apaga explícitamente el switch; conserva la protección crítica que impide A2 sin A1.
- Los menús “Mesa de gastos” y “Equipo y técnico” pasan a llamarse “Mis gastos” y “Equipos”.

# V8.48.0

- Domótica separa la telemetría energética del estado físico: sol, batería, SOC y red siguen la fuente instantánea seleccionada, mientras A1 y A2 se comprueban directamente en Tuya.
- Corrige el falso estado “Manual ON”: si Tuya confirma A1 y A2 apagados, se limpia la marca manual antigua y la interfaz vuelve a apagado real.
- La automatización de piscina alinea automáticamente su proveedor con i.Solar o WatchPower según la selección superior.
- Agrega accesos rápidos para bomba de piscina, bomba de calor y portón, actualización Tuya cada 30 segundos y numeración completa de artefactos.
- Permite ordenar los artefactos manteniendo presionada una tarjeta, arrastrándola, usando flechas o eligiendo una posición; los nuevos equipos se agregan al final.
- Radiación identifica claramente la fuente energética activa y mantiene el pronóstico meteorológico separado de la telemetría del inversor.

# V8.49.0

- Inicio muestra primero el último flujo coherente guardado y consulta i.Solar o WatchPower después, sin esperar la reparación histórica.
- La reparación del día se ejecuta en segundo plano y los rangos diario, semanal y mensual se cargan en paralelo.
- Aguas, Equipos, Domótica, Mis gastos y las demás consultas propias de Mi Solar dejan de quedar detenidas por la cola del proveedor.
- Aguas, Equipos, Domótica y Mis gastos conservan una copia de memoria aislada por equipo, instalación o usuario para reaparecer al instante al volver al menú.
- Los menús secundarios y los gráficos pesados se cargan bajo demanda; el paquete inicial se reduce drásticamente para acelerar el ingreso desde iPhone.
- Enel elimina el mensaje que atribuía el respaldo a i.Solar o Mi Solar y usa información energética unificada.
- Cada sección no solar muestra el nombre y usuario correspondientes a la sesión autenticada, sin compartir caché financiera entre usuarios.
