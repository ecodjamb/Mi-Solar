# Arquitectura y publicación de Mi Solar

Este documento es la referencia única para organizar, versionar, probar y publicar Mi Solar y sus complementos. Los números y destinos que las herramientas validan automáticamente viven en `release.config.json`.

## Jerarquía

1. **Mi Solar es el producto canónico.** La interfaz, API, datos, automatizaciones, monitor público y rutas de producción se mantienen en la rama `main` de `ecodjamb/Mi-Solar`.
2. **Alexa es un complemento.** Su código vive en `alexa/` dentro del mismo repositorio, tiene una versión propia y solo lee la respuesta sanitizada de `/api/public/monitor`.
3. **Un complemento nunca despliega Mi Solar.** Alexa no tiene proyecto Vercel, no consulta directamente i.Solar o WatchPower y no puede reemplazar la aplicación.
4. **Una sola producción.** El único proyecto es `ecodjamb1/mi-solar` y el único dominio canónico es `https://misolar.vercel.app`.

## Versiones

- La versión de Mi Solar se define en `release.config.json` y debe coincidir en `package.json`, `package-lock.json`, `VERSION.txt`, `src/config.ts`, `api/index.js` y la primera entrada de `CHANGELOG.md`.
- La versión de Alexa se define separadamente en `release.config.json` y debe coincidir con su manifiesto, documento APL y Lambda.
- `npm run version:check` impide compilar o publicar cuando exista cualquier diferencia.

## Flujo automático

1. Los cambios se preparan en una rama de trabajo.
2. GitHub Actions ejecuta instalación reproducible, contrato de versiones, TypeScript, todas las pruebas y compilación.
3. Solo un commit que pasa `npm run release:check` puede avanzar a `main`.
4. Vercel observa exclusivamente `main` y publica el proyecto `ecodjamb1/mi-solar`.
5. Después de publicar se verifica `/api/health`, `/api/public/monitor` y `/monitor`.
6. Si una verificación falla, se conserva la última producción estable y se corrige en una nueva rama; no se promueve un árbol local desordenado.

El propietario autorizó publicaciones automáticas de mejoras de Mi Solar. Esa autorización se aplica únicamente al flujo anterior: repositorio, proyecto y dominio canónicos, con verificaciones en verde. No autoriza desplegar desde worktrees auxiliares, omitir pruebas, cambiar secretos ni publicar otro proyecto.

## Producción estable y desarrollo

- Producción se mantiene en la última versión comprobada hasta que el siguiente commit canónico complete todas las verificaciones.
- Los despliegues de vista previa son descartables y no constituyen otra aplicación.
- Los archivos `.vercel/project.json` son enlaces locales; no definen una segunda aplicación ni deben existir en un worktree exclusivo de Alexa.

## Alexa

- Skill: complemento privado de Mi Solar.
- Fuente: `https://misolar.vercel.app/api/public/monitor`.
- Datos: solo lectura, sanitizados y reutilizados desde el archivo propio de Mi Solar.
- Publicación: Alexa Developer Console y Alexa Data Store; nunca Vercel.
- Pruebas: JSON/APL, sintaxis Lambda y transformación de datos sin credenciales.

## Comandos canónicos

```bash
npm run version:check
npm run release:check
```

La comprobación completa incluye `typecheck`, pruebas y compilación. No se debe ejecutar una publicación manual desde la carpeta histórica `mi-solar-alexa-widget`.
