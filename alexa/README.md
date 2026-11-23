# Widget Mi Solar para Echo Show

Este directorio es un complemento de la aplicación principal. La referencia única de arquitectura, versiones y publicación es [Arquitectura y publicación](../docs/ARQUITECTURA-Y-PUBLICACION.md). Alexa nunca despliega Mi Solar en Vercel.

Esta carpeta contiene dos documentos APL importables para la galería de widgets de Alexa y un sincronizador opcional. **No es una aplicación Android/iOS** y no carga el HTML de Mi Solar: usa datos del archivo energético existente.

## Estado

- Diseño APL responsivo v1.0.14: cuadrícula 2×2 con tarjetas simétricas, iconos equivalentes y cifras ampliadas para producción solar, casa, batería y red; incluye movimiento APL discreto en los flujos activos, hora de la última muestra, generación diaria y acceso directo a `/monitor`. La red solo muestra potencia cuando `statusGrid = 1`, igual que Mi Solar. La paleta usa los tonos oscuros verde/azul del flujo de Mi Solar.
- `widget-show5.json` es el documento canónico responsivo para Widget Medium (134–425 dp × 222–711 dp); se adapta a Echo Show 5, 8, 10, 11, 15 y 21 compatibles con widgets.
- Manifiesto del paquete: `widget-manifest.json` v1.0.14, con tres locales, logo v1.0.14 validado de 450×450 y vista previa 328×552.
- Fuente de la Lambda desplegada: `GET https://misolar.vercel.app/api/public/monitor`, ruta pública de solo lectura que entrega exclusivamente el estado sanitizado del monitor.
- El widget ya no necesita `ALEXA_WIDGET_TOKEN`; no abre consultas nuevas a i.Solar o WatchPower y no expone controles, usuarios ni información financiera.
- Fuente: `site:2` (El Arrayán), última telemetría ya respaldada por Mi Solar. No llama a i.Solar, WatchPower ni Supabase.
- Sincronizador: `sync-datastore.mjs` actualiza `MiSolar/Indicadores` mediante la Data Store REST API.
- La Skill privada ya está instalada en el Echo Show Cocina. La Lambda usa primero el `deviceId` real recibido en `UsagesInstalled`, `UpdateRequest` o `LaunchRequest`; solo usa el `userId` cuando el evento no contiene dispositivo. Alexa Data Store se autentica con el token LWA específico `alexa::datastore`; las credenciales oficiales se leen desde el elemento cifrado `alexa-widget-credentials` de la tabla DynamoDB propia de Alexa-hosted y nunca se incluyen en GitHub ni en los registros.

## Configuración de la Lambda / sincronizador

Configurar en Amazon las variables secretas:

- `ALEXA_LWA_CLIENT_ID` y `ALEXA_LWA_CLIENT_SECRET`: respaldo opcional para entornos administrados que dispongan de variables seguras. En Alexa-hosted se usa la tabla cifrada propia de la Skill.
- `ALEXA_API_REGION`: `na`, `eu` o `fe` (por defecto `na`).

La Lambda Alexa-hosted maneja `UsagesInstalled`, `UpdateRequest` y `LaunchRequest`. Cada apertura de la Skill actualiza Data Store y guarda de manera privada el `deviceId` y `userId` correctos en DynamoDB. Amazon no envía `UpdateRequest` para Skills en etapa de desarrollo; por eso la carga inicial se ejecuta también al instalar y al abrir la Skill.

La actualización periódica se ejecuta en `.github/workflows/alexa-widget-sync.yml` cada cinco minutos. El trabajo lee únicamente `GET /api/public/monitor`, que ya usa la muestra respaldada de Mi Solar, y publica un solo `PUT_OBJECT` dirigido al usuario de la Skill o, como respaldo, al Echo registrado. No consulta directamente i.Solar ni WatchPower y no toca el despliegue Vercel. Requiere los secretos de GitHub `ALEXA_LWA_CLIENT_ID`, `ALEXA_LWA_CLIENT_SECRET` y `ALEXA_WIDGET_USER_ID`; `ALEXA_WIDGET_DEVICE_ID` puede usarse como alternativa.

`ALEXA_WIDGET_DEVICE_SN` es el serial del inversor usado por la API de Mi Solar. **No es** el destino de Alexa Data Store. El destino válido comienza con `amzn1.ask.device.` y se obtiene exclusivamente de `context.System.device.deviceId` en `UsagesInstalled` o desde CloudWatch de la misma Skill.

## Crear el widget en Alexa Developer

1. Usar la **misma cuenta Amazon** registrada en el Echo Show Cocina.
2. En [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) crear Skill Custom, con backend Alexa-hosted Node.js para las pruebas.
3. Activar en **Build > Interfaces**: Data Store Packages, Data Store y Data Store Extension (`alexaext:datastore:10`). Guardar y reconstruir el modelo.
4. **Build > Multimodal Responses > Widget > Create Widget > Upload**, importar `widget-show5.json` para todos los tamaños compatibles y guardar. Es un documento APL sin contenedor `document` externo.
5. Para la Skill Alexa-hosted, copiar el contenido de `alexa/skill-handler.cjs` como controlador Lambda (`index.js`) e instalar `ask-sdk-core`. El evento `UsagesInstalled` permite identificar el dispositivo en los logs. Estos datos deben tratarse como identificadores internos.
6. En **Manifest**, reemplazar el contenido por `widget-manifest.json`. No dejar recursos genéricos: la versión 1.0.14 usa el logo v1.0.14 validado de 450×450 y `mi-solar-widget-preview-v2.png` (328×552).
7. Ejecutar **Build Model** y **Install > Send to Device** (no solo Preview). El dispositivo debe aparecer como compatible.
8. Para probar con números simulados sin credenciales puedes usar el botón **Install > Update Datastore** y enviar un comando con `PUT_OBJECT`, namespace `MiSolar`, key `Indicadores`, y content con las propiedades `generacion`, `consumo`, `bateria`, `red`, `carga`, `descarga`, `estado`.
9. La documentación de diseño de Amazon del año 2023 excluía el Echo Show 5, mientras que la guía actual de consumo muestra widgets para ese modelo. **Es necesario validar widgets APL de terceros en el Echo Show 5**; la galería visible no basta para confirmarlo.

## Sincronizar datos

Para un sincronizador externo opcional, definir en el ambiente del proceso:

- `ALEXA_LWA_CLIENT_ID`, `ALEXA_LWA_CLIENT_SECRET`: credenciales OAuth LWA de la Skill
- `ALEXA_WIDGET_USER_ID`: ID de usuario de la Skill; recomendado para actualizar todos sus widgets compatibles
- `ALEXA_WIDGET_DEVICE_ID`: alternativa para dirigir la escritura a un único dispositivo
- `ALEXA_API_REGION`: `na`, `eu` o `fe`, según región de la Skill

Ejecutar:

```bash
node alexa/sync-datastore.mjs
```

La llamada lee la API pública con timeout de 7 segundos y publica un único objeto mediante `PUT_OBJECT`. El flujo oficial la ejecuta cada cinco minutos. Si la fuente falla dentro del mismo proceso, conserva la última muestra válida y la marca como atrasada.

## Seguridad y limitaciones

- Las credenciales LWA se usan solo en Lambda/sincronizador, nunca en el APL, los logs ni el frontend. La lectura de Mi Solar no requiere un token compartido.
- Los logs enmascaran el `deviceId` y no imprimen tokens, credenciales LWA ni cuerpos de error externos.
- Los datos pueden estar atrasados si nadie ha abierto Mi Solar y no se archivan nuevas muestras. Se indica "Dato atrasado" cuando superan 15 minutos.
- El widget **no sustituye Alexa Home**, no elimina los fondos/protectores de pantalla y puede no estar siempre visible.
- Antes de comprar un Echo Show 10/11 validar que una instalación de un widget APL propio se acepta en el dispositivo destino.

Fuentes oficiales:
- https://developer.amazon.com/en-US/docs/alexa/alexa-presentation-language/create-and-manage-widgets.html
- https://developer.amazon.com/en-US/docs/alexa/alexa-presentation-language/test-widget.html
- https://developer.amazon.com/en-US/docs/alexa/alexa-presentation-language/data-store-rest-api-reference.html
