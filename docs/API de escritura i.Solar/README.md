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

### Captura 30 % — validada

Captura aislada de Proxyman del 2026-08-09 19:22:

```text
POST /app/api/mobile/paramSet/setParam
```

Body observado:

```text
deviceSn=96342509120972
commands={"S017":"PBDC030"}
```

Respuesta del servidor:

```json
{"code":0,"message":"successful","data":null}
```

Mapeo confirmado:

```text
Battery Capacity Redischarge 30% = {"S017":"PBDC030"}
```

### Captura 100 % — validada

Captura aislada de Proxyman del 2026-08-09 19:30, con el parámetro dejado en **100 %**.

Body exacto observado:

```text
deviceSn=96342509120972&commands={"S017":"PBDC100","S024":"PTOPVCB010"}
```

Respuesta del servidor:

```json
{"code":0,"message":"successful","data":null}
```

Esto confirma que el comando de Redischarge para 100 % contiene:

```text
S017 = PBDC100
```

Por lo tanto, con los puntos 30 % y 100 % confirmados, la evidencia apoya fuertemente el patrón:

```text
PBDC + porcentaje en 3 dígitos
```

Ejemplos confirmados:

```text
30%  -> PBDC030
100% -> PBDC100
```

### Advertencia importante: escritura acoplada al 100 %

La captura de 100 % **no envió únicamente S017**. La aplicación oficial envió simultáneamente:

```text
{"S017":"PBDC100","S024":"PTOPVCB010"}
```

Por lo tanto:

- `PBDC100` queda validado como el valor 100 % de Battery Capacity Redischarge.
- `S024 / PTOPVCB010` es un segundo comando que la app oficial decidió enviar en la misma operación.
- Todavía NO se debe asumir que S024 es irrelevante ni omitirlo en una automatización de 100 % hasta identificar qué parámetro representa y por qué la app lo acopla.
- La captura de 30 % sí envió únicamente `{"S017":"PBDC030"}`.

### Mapeo validado hasta ahora

- Slot principal: `S017`
- Código principal: `PBDC`
- 30 %: `PBDC030`
- 100 %: `PBDC100`
- Estado: **VALIDADO para 30 % y 100 %**
- Patrón general `PBDCxxx`: **muy probable, pendiente de un tercer valor aislado para cerrarlo como fórmula general**

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
