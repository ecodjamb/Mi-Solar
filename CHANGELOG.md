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
