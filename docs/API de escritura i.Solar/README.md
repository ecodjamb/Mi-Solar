# API de escritura i.Solar / Tumcapp

Registro acumulativo de endpoints y comandos de escritura confirmados mediante capturas aisladas de Proxyman contra la aplicación oficial i.Solar.

## Endpoint confirmado

- Método: `POST`
- Ruta: `/app/api/mobile/paramSet/setParam`
- Formato observado:
  - `deviceSn=<SERIAL>`
  - `commands={"S05":"POPxx"}`
- Respuesta exitosa observada: `{"code":0,"message":"successful","data":null}`

## Output Source Priority

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

## Procedimiento de validación recomendado

Para cada futura escritura:

1. Leer el valor actual.
2. Enviar el comando mediante `paramSet/setParam`.
3. Confirmar `code = 0` y `message = successful`.
4. Volver a leer el parámetro con `paramSet/getParam`.
5. Confirmar que el valor objetivo quedó aplicado.
6. Registrar instalación, hora, valor anterior, valor nuevo y motivo.

## Seguridad

No incorporar un parámetro al motor automático hasta haberlo validado con una captura aislada de la aplicación oficial y una prueba controlada de lectura → escritura → lectura.

---

Este documento se debe ampliar con cada nuevo parámetro confirmado. No reemplazar comandos existentes sin nueva evidencia experimental.
