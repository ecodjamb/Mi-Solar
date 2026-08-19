# API de escritura i.Solar / Tumcapp

Registro acumulativo de endpoints y comandos de escritura confirmados mediante capturas aisladas de Proxyman contra la aplicación oficial i.Solar.

## Endpoint confirmado

- Método: `POST`
- Ruta: `/app/api/mobile/paramSet/setParam`
- Formato observado:
  - `deviceSn=<SERIAL>`
  - `commands={...}`
- Respuesta exitosa observada: `{"code":0,"message":"successful","data":null}`

## 1. Output Source Priority

Parámetro de menú: **Output** / prioridad de fuente de salida.

| Modo objetivo | Comando confirmado | Evidencia experimental |
|---|---|---|
| Utility | `{"S05":"POP00"}` | Captura aislada SBU → Utility, 2026-08-09 19:12 |
| SOL | `{"S05":"POP01"}` | Captura aislada SBU → SOL, 2026-08-09 19:15 |
| SBU | `{"S05":"POP02"}` | Captura aislada SOL → SBU, 2026-08-09 19:08 |

### Mapa

```text
Utility = POP00
SOL     = POP01
SBU     = POP02
```

## 2. Battery Capacity Redischarge (%)

Parámetro de menú: **Battery Capacity Redischarge**.

### Valores confirmados

| Valor objetivo | Comando observado | Comandos adicionales | Estado |
|---|---|---|---|
| 30 % | `{"S017":"PBDC030"}` | ninguno | VALIDADO |
| 50 % | `{"S017":"PBDC050"}` | ninguno | VALIDADO |
| 100 % | `{"S017":"PBDC100","S024":"PTOPVCB010"}` | `S024 = PTOPVCB010` | VALIDADO, con comando acoplado |

Todas las capturas devolvieron:

```json
{"code":0,"message":"successful","data":null}
```

### Patrón confirmado

Con tres valores independientes (30, 50 y 100), queda suficientemente validado que el comando principal se construye como:

```text
S017 = PBDC + porcentaje expresado en 3 dígitos
```

Ejemplos:

```text
30%  -> PBDC030
50%  -> PBDC050
100% -> PBDC100
```

Esto permite construir programáticamente el comando para porcentajes admitidos por el inversor/app oficial, sujeto a respetar los rangos y pasos válidos que exponga `getParam`.

### Captura 50 % — evidencia

Captura aislada Proxyman del 2026-08-09 19:34, realizada al cambiar el parámetro a **50 %**:

```text
POST /app/api/mobile/paramSet/setParam
commands={"S017":"PBDC050"}
```

No apareció `S024` ni otro comando acoplado en esta escritura. Esto refuerza que `S024 / PTOPVCB010` observado al seleccionar 100 % corresponde a una condición particular de esa operación/configuración y no forma parte obligatoria de toda escritura PBDC.

### Advertencia importante: 100 %

La captura de 100 % envió simultáneamente:

```text
{"S017":"PBDC100","S024":"PTOPVCB010"}
```

Por lo tanto, para automatizar específicamente 100 % se debe conservar esta advertencia y determinar primero qué representa `S024 / PTOPVCB010` y por qué la app oficial lo acopla.

### Relación funcional observada por el usuario

En combinación con modo **SBU**, este parámetro se usa para definir el umbral de redischarge de batería. En la operación observada del sistema, su ajuste influye en cuándo el inversor vuelve a utilizar la batería y en la prioridad entre abastecer la casa y cargar la batería cuando existe excedente solar.

## Procedimiento de validación recomendado

Para cada futura escritura:

1. Leer el valor actual cuando sea útil para auditoría y evitar escrituras redundantes.
2. Enviar únicamente el/los comando(s) observados para el cambio objetivo.
3. Confirmar `code = 0` y `message = successful`.
4. Volver a leer el parámetro con `paramSet/getParam`.
5. Confirmar que el valor objetivo quedó aplicado.
6. Registrar instalación, hora, valor anterior, valor nuevo, comandos enviados y motivo.
7. Si la app oficial envía comandos acoplados, documentarlos y no descartarlos hasta entender su función.

## Seguridad

No incorporar un parámetro al motor automático hasta haberlo validado con una captura aislada de la aplicación oficial y una prueba controlada de lectura → escritura → lectura.

---

Este documento se debe ampliar con cada nuevo parámetro confirmado. No reemplazar comandos existentes sin nueva evidencia experimental.
