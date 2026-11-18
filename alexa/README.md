# Widget Mi Solar para Echo Show

Esta carpeta contiene dos documentos APL importables para la galería de widgets de Alexa y un sincronizador opcional. **No es una aplicación Android/iOS** y no carga el HTML de Mi Solar: usa datos del archivo energético existente.

## Estado

- Diseño APL para pantallas grandes: `widget.json` (seis parámetros y estado).
- Diseño de prueba compacto para Echo Show 5: `widget-show5.json` (generación, batería y estado).
- Datos de Vercel: `GET /api/alexa/widget-data`, autenticación Bearer con `ALEXA_WIDGET_TOKEN`.
- Fuente: último registro de `energy_samples` para `ALEXA_WIDGET_DEVICE_SN`. No llama a Tumcapp.
- Sincronizador: `sync-datastore.mjs` actualiza `MiSolar/Indicadores` mediante la Data Store REST API.
- **Sin instalar todavía**: requiere iniciar sesión en Amazon Developer, crear Skill, activar interfaces y que el Echo Show concreto sea aceptado para prueba.

## Configuración en Vercel (solo cuando se vaya a activar)

Configurar en el servidor las variables secretas:

- `ALEXA_WIDGET_DEVICE_SN`: número de serie del inversor de El Arrayán (nunca publicar).
- `ALEXA_WIDGET_TOKEN`: secreto aleatorio largo (>= 32 caracteres), distinto de `SESSION_SECRET`.

Las variables existentes del archivo (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `MISOLAR_DB_KEY`) siguen siendo necesarias. El endpoint responde 401 sin Bearer válido y 503 si faltan los ajustes.

## Crear el widget en Alexa Developer

1. Usar la **misma cuenta Amazon** registrada en el Echo Show Cocina.
2. En [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) crear Skill Custom, con backend Alexa-hosted Node.js para las pruebas.
3. Activar en **Build > Interfaces**: Data Store Packages, Data Store y Data Store Extension (`alexaext:datastore:10`). Guardar y reconstruir el modelo.
4. **Build > Multimodal Responses > Widget > Create Widget > Upload**, importar primero `widget-show5.json` en Echo Show 5 (o `widget.json` para pantallas grandes) y guardar. Son documentos APL sin contenedor `document` externo.
5. Para la Skill Alexa-hosted, copiar el contenido de `alexa/skill-handler.cjs` como controlador Lambda (`index.js`) e instalar `ask-sdk-core`. El evento `UsagesInstalled` permite identificar el dispositivo en los logs. Estos datos deben tratarse como identificadores internos.
6. En el **manifest** del paquete definir el nombre "Mi Solar" y descripción, y agregar los assets que solicite la consola.
7. Ejecutar **Build Model** y **Install > Send to Device** (no solo Preview). El dispositivo debe aparecer como compatible.
8. Para probar con números simulados sin credenciales puedes usar el botón **Install > Update Datastore** y enviar un comando con `PUT_OBJECT`, namespace `MiSolar`, key `Indicadores`, y content con las propiedades `generacion`, `consumo`, `bateria`, `red`, `carga`, `descarga`, `estado`.
9. La documentación de diseño de Amazon del año 2023 excluía el Echo Show 5, mientras que la guía actual de consumo muestra widgets para ese modelo. **Es necesario validar widgets APL de terceros en el Echo Show 5**; la galería visible no basta para confirmarlo.

## Sincronizar datos

Cuando se obtengan los accesos y un ID de dispositivo emitido por Alexa para la Skill, definir en el ambiente del proceso sincronizador:

- `MISOLAR_BASE_URL`: `https://tu-dominio-de-mi-solar`
- `ALEXA_WIDGET_TOKEN`: mismo secreto del backend Mi Solar
- `ALEXA_LWA_CLIENT_ID`, `ALEXA_LWA_CLIENT_SECRET`: credenciales OAuth LWA de la Skill
- `ALEXA_WIDGET_DEVICE_ID`: ID de dispositivo de la Skill (no el nombre "Echo Show Cocina")
- `ALEXA_API_REGION`: `na`, `eu` o `fe`, según región de la Skill

Ejecutar:

```bash
node alexa/sync-datastore.mjs
```

La llamada publica un objeto mediante `PUT_OBJECT` en el Data Store de Amazon. Se puede programar cada 5 minutos **después de comprobar el funcionamiento**, pero no se añade un cron por defecto; evitar consultas repetidas innecesarias.

## Seguridad y limitaciones

- El secreto se usa solo en el proceso servidor/sincronizador, nunca en el APL ni en Safari.
- Los datos pueden estar atrasados si nadie ha abierto Mi Solar y no se archivan nuevas muestras. Se indica "Dato atrasado" cuando superan 15 minutos.
- El widget **no sustituye Alexa Home**, no elimina los fondos/protectores de pantalla y puede no estar siempre visible.
- Antes de comprar un Echo Show 10/11 validar que una instalación de un widget APL propio se acepta en el dispositivo destino.

Fuentes oficiales:
- https://developer.amazon.com/en-US/docs/alexa/alexa-presentation-language/create-and-manage-widgets.html
- https://developer.amazon.com/en-US/docs/alexa/alexa-presentation-language/test-widget.html
- https://developer.amazon.com/en-US/docs/alexa/alexa-presentation-language/data-store-rest-api-reference.html
