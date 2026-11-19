# Widget Mi Solar para Echo Show

Esta carpeta contiene dos documentos APL importables para la galería de widgets de Alexa y un sincronizador opcional. **No es una aplicación Android/iOS** y no carga el HTML de Mi Solar: usa datos del archivo energético existente.

## Estado

- Diseño APL responsivo v1.0.8: cuadrícula 2×2 con producción solar, casa, batería y red, más generación diaria y barra de avance.
- `widget-show5.json` es el documento canónico responsivo para Widget Medium (134–425 dp × 222–711 dp); se adapta a Echo Show 5, 8, 10, 11, 15 y 21 compatibles con widgets.
- Manifiesto del paquete: `widget-manifest.json` v1.0.8, con tres locales, logo 450×450 versionado y vista previa 328×552.
- Fuente preferida: `GET https://misolar.vercel.app/api/alexa/widget-data`, autenticada con `Authorization: Bearer <ALEXA_WIDGET_TOKEN>`.
- Respaldo transitorio: si la ruta protegida no está disponible, la Lambda usa `GET /api/public/monitor`, que lee el mismo archivo de Mi Solar y no consulta i.Solar ni WatchPower.
- Fuente: `site:2` (El Arrayán), última telemetría ya respaldada por Mi Solar. No llama a i.Solar, WatchPower ni Supabase.
- Sincronizador: `sync-datastore.mjs` actualiza `MiSolar/Indicadores` mediante la Data Store REST API.
- **Sin instalar todavía**: requiere iniciar sesión en Amazon Developer, crear Skill, activar interfaces y que el Echo Show concreto sea aceptado para prueba.

## Configuración de la Lambda / sincronizador

Configurar en Amazon las variables secretas:

- `ALEXA_LWA_CLIENT_ID` y `ALEXA_LWA_CLIENT_SECRET`: credenciales LWA con alcance `alexa::datastore`.
- `ALEXA_WIDGET_TOKEN`: el mismo secreto ya configurado en Vercel para la ruta protegida. Se conserva `ALEXA_WIDGET_DATA_TOKEN` solo como alias transitorio.
- `ALEXA_WIDGET_DEVICE_ID` o `ALEXA_WIDGET_DEVICE_IDS`: destino(s) capturados en `UsagesInstalled`.
- `ALEXA_API_REGION`: `na`, `eu` o `fe` (por defecto `na`).

La Lambda maneja `UsagesInstalled` y `UpdateRequest` y también acepta un evento programado con `source: aws.events` o `type: MiSolarScheduledSync`. Programar como máximo una ejecución por minuto. El estado local `/tmp/mi-solar-alexa-state.json` conserva la última muestra válida, evita escrituras idénticas y sí publica el cambio a “Dato atrasado” una sola vez cuando falla la fuente.

`ALEXA_WIDGET_DEVICE_SN` es el serial del inversor usado por la API de Mi Solar. **No es** el destino de Alexa Data Store. El destino válido comienza con `amzn1.ask.device.` y se obtiene exclusivamente de `context.System.device.deviceId` en `UsagesInstalled` o desde CloudWatch de la misma Skill.

## Crear el widget en Alexa Developer

1. Usar la **misma cuenta Amazon** registrada en el Echo Show Cocina.
2. En [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) crear Skill Custom, con backend Alexa-hosted Node.js para las pruebas.
3. Activar en **Build > Interfaces**: Data Store Packages, Data Store y Data Store Extension (`alexaext:datastore:10`). Guardar y reconstruir el modelo.
4. **Build > Multimodal Responses > Widget > Create Widget > Upload**, importar `widget-show5.json` para todos los tamaños compatibles y guardar. Es un documento APL sin contenedor `document` externo.
5. Para la Skill Alexa-hosted, copiar el contenido de `alexa/skill-handler.cjs` como controlador Lambda (`index.js`) e instalar `ask-sdk-core`. El evento `UsagesInstalled` permite identificar el dispositivo en los logs. Estos datos deben tratarse como identificadores internos.
6. En **Manifest**, reemplazar el contenido por `widget-manifest.json`. No dejar recursos genéricos: la versión 1.0.8 usa `mi-solar-widget-icon-v1.0.8.png` (450×450) y `mi-solar-widget-preview-v2.png` (328×552).
7. Ejecutar **Build Model** y **Install > Send to Device** (no solo Preview). El dispositivo debe aparecer como compatible.
8. Para probar con números simulados sin credenciales puedes usar el botón **Install > Update Datastore** y enviar un comando con `PUT_OBJECT`, namespace `MiSolar`, key `Indicadores`, y content con las propiedades `generacion`, `consumo`, `bateria`, `red`, `carga`, `descarga`, `estado`.
9. La documentación de diseño de Amazon del año 2023 excluía el Echo Show 5, mientras que la guía actual de consumo muestra widgets para ese modelo. **Es necesario validar widgets APL de terceros en el Echo Show 5**; la galería visible no basta para confirmarlo.

## Sincronizar datos

Cuando se obtengan los accesos y un ID de dispositivo emitido por Alexa para la Skill, definir en el ambiente del proceso sincronizador:

- `ALEXA_LWA_CLIENT_ID`, `ALEXA_LWA_CLIENT_SECRET`: credenciales OAuth LWA de la Skill
- `ALEXA_WIDGET_DEVICE_ID`: ID de dispositivo de la Skill (no el nombre "Echo Show Cocina")
- `ALEXA_API_REGION`: `na`, `eu` o `fe`, según región de la Skill

Ejecutar:

```bash
node alexa/sync-datastore.mjs
```

La llamada lee la API pública con timeout de 7 segundos y publica un único objeto mediante `PUT_OBJECT`. Puede ejecutarse cada minuto, pero la escritura se omite mientras `sampledAt` no cambie. Si la fuente falla, conserva la última muestra válida y la marca como atrasada.

## Seguridad y limitaciones

- El secreto se usa solo en Lambda/sincronizador, nunca en el APL, los logs ni el frontend.
- Los logs enmascaran el `deviceId` y no imprimen tokens, credenciales LWA ni cuerpos de error externos.
- Los datos pueden estar atrasados si nadie ha abierto Mi Solar y no se archivan nuevas muestras. Se indica "Dato atrasado" cuando superan 15 minutos.
- El widget **no sustituye Alexa Home**, no elimina los fondos/protectores de pantalla y puede no estar siempre visible.
- Antes de comprar un Echo Show 10/11 validar que una instalación de un widget APL propio se acepta en el dispositivo destino.

Fuentes oficiales:
- https://developer.amazon.com/en-US/docs/alexa/alexa-presentation-language/create-and-manage-widgets.html
- https://developer.amazon.com/en-US/docs/alexa/alexa-presentation-language/test-widget.html
- https://developer.amazon.com/en-US/docs/alexa/alexa-presentation-language/data-store-rest-api-reference.html
