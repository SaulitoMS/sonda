<div align="center">

# Sonda

**Cliente de APIs local-first, sin login.**
Importa tu Swagger/OpenAPI, genera las colecciones, comprueba que la API cumple lo que promete y automatiza las pruebas, desde la app o desde la terminal.

[![CI](https://github.com/SaulitoMS/sonda/actions/workflows/ci.yml/badge.svg)](https://github.com/SaulitoMS/sonda/actions/workflows/ci.yml)
![Licencia](https://img.shields.io/badge/licencia-MIT-blue)
![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/Node-24-339933?logo=nodedotjs&logoColor=white)
![Tests](https://img.shields.io/badge/tests-800%2B-brightgreen)

[Descargas](#descargas) · [Primeros pasos](#primeros-pasos) · [Funciones](#funciones) · [CLI](#cli) · [Arquitectura](#arquitectura) · [Contribuir](#contribuir)

</div>

<!-- Agrega aquí una captura de la app: ![Sonda](docs/screenshot.png) -->

---

## Por qué Sonda

|                                    |                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Local-first**                 | Sin cuentas, sin nube y sin telemetría. Todo vive en tu computadora.                             |
| **Peticiones como archivos**    | Cada petición es un `.json` legible que puedes versionar con Git y revisar en un PR.             |
| **De la spec a la petición**    | Pega la URL de un Swagger/OpenAPI y Sonda crea la colección completa.                            |
| **Valida contra el schema**     | Detecta cuando la API no cumple su propia documentación, en la respuesta y en el body que envías. |
| **Automatización integrada**    | Runner, CLI para CI, monitor, fuzzing, snapshots, pruebas de rendimiento y servidor mock.        |
| **Secretos cifrados**           | Las variables secretas se guardan en el keychain del sistema, nunca en texto plano.              |

---

## Contenido

- [Descargas](#descargas)
- [Primeros pasos](#primeros-pasos)
- [Funciones](#funciones)
- [Atajos de teclado](#atajos-de-teclado)
- [CLI](#cli)
- [Cómo guarda tus datos](#cómo-guarda-tus-datos)
- [Arquitectura](#arquitectura)
- [Scripts disponibles](#scripts-disponibles)
- [Tests y CI](#tests-y-ci)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

---

## Descargas

Descarga el instalador de la última versión (**v0.1.1**) o consulta todas en [Releases](https://github.com/SaulitoMS/sonda/releases/latest).

| Sistema                 | Descarga                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Windows** (64 bits)   | [`sonda-0.1.1-setup.exe`](https://github.com/SaulitoMS/sonda/releases/download/v0.1.1/sonda-0.1.1-setup.exe)               |
| **macOS** (Apple Silicon) | [`sonda-0.1.1-arm64.dmg`](https://github.com/SaulitoMS/sonda/releases/download/v0.1.1/sonda-0.1.1-arm64.dmg)             |
| **macOS** (Intel)       | [`sonda-0.1.1-x64.dmg`](https://github.com/SaulitoMS/sonda/releases/download/v0.1.1/sonda-0.1.1-x64.dmg)                   |

> **Aviso:** los instaladores todavía no están firmados.
> En **Windows**, si aparece SmartScreen, pulsa _Más información_ y luego _Ejecutar de todas formas_.
> En **macOS**, si dice que no se puede abrir, haz clic derecho sobre la app, elige _Abrir_ y confirma.

---

## Primeros pasos

### Requisitos

- [Node.js](https://nodejs.org/) 24 (la versión que usa el CI)
- npm

### Instalación

```bash
git clone https://github.com/SaulitoMS/sonda.git
cd sonda
npm install
npm run dev
```

### Compilar los instaladores

```bash
npm run build:mac     # macOS
npm run build:win     # Windows
npm run build:linux   # Linux
```

Los instaladores quedan en la carpeta `dist/`.

### Tu primera prueba en 1 minuto

1. En la barra lateral, abre **Importar Swagger**.
2. Pega una spec, por ejemplo `https://petstore3.swagger.io/api/v3/openapi.json`.
3. Abre cualquier petición de la colección y pulsa **Enviar** (`Cmd/Ctrl + Enter`).
4. Revisa la pestaña **Schema** para ver si la respuesta cumple lo que promete la spec.

> Las guías paso a paso de cada funcionalidad están en [`funcionalidadesRD`](./funcionalidadesRD/README.md).

---

## Funciones

### Peticiones

- Métodos `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` y `OPTIONS`.
- Body **JSON**, **XML**, `x-www-form-urlencoded`, **multipart** con archivos y **binario**.
- **GraphQL** con introspección del schema, **WebSocket** y **Server-Sent Events**.
- Editor JSON asistido: formateo, validación, autocierre, búsqueda y autocompletado de `{{variables}}`.
- Cancelación, reintentos con backoff, redirecciones manuales con cadena visible y cookie jar compartido.
- Cada petición tiene su propia pestaña de **Notas**, **Scripts**, **Tests** y **Extraer**.

### Autenticación

- **Bearer**, **Basic**, **Digest**, **API Key**, **OAuth 1.0**, **AWS Signature v4** y **OAuth 2.0** (client credentials, password y authorization code con PKCE).
- **Herencia** desde la colección o la carpeta, con la opción de sobrescribirla o desactivarla por petición.
- **Inspector de JWT** con algoritmo, claims y expiración en vivo.

### Respuestas

- Estado, tiempo, **TTFB**, tamaño, headers y **desglose de tiempos** (waterfall).
- JSON en **árbol** o **tabla**, XML formateado, vista previa HTML en sandbox y binarios con descarga.
- Búsqueda dentro del body y filtro por ruta JSON.
- Pestaña **Cambios** que compara con la respuesta anterior, y comparación entre entornos.
- Exportación del body o de la respuesta completa.

### Colecciones

- Carpetas, drag and drop, duplicar, renombrar, búsqueda y **papelera** para recuperar lo borrado.
- Headers, autenticación, variables y scripts **heredados** por colección y carpeta.
- **Sincronizar con la spec** sin pisar tus cambios manuales, con detección de _breaking changes_.
- **Buscar y reemplazar** en toda la colección, **lint** de colección y **cobertura** de endpoints.
- **Respaldo** y restauración del workspace completo.

### Scripts

- Scripts **pre-request** y **post-response** en JavaScript, a nivel de petición, carpeta o colección.
- API propia `sonda.*` (entorno, request, response, `crypto`, `uuid`…) con **snippets** listos, como firma HMAC o `X-Request-Id`.
- Compatibilidad con la sintaxis `pm.*` de Postman.

### Importar y exportar

| Formato               | Importar           | Exportar |
| --------------------- | ------------------ | -------- |
| **Swagger / OpenAPI** | Sí (URL o archivo) | Sí       |
| **Postman**           | Sí                 | Sí       |
| **Insomnia** (v4)     | Sí                 | Sí       |
| **Bruno**             | Sí                 | No       |
| **Hoppscotch**        | Sí                 | No       |
| **HAR**               | Sí                 | Sí       |
| **cURL**              | Sí                 | Sí       |
| **Código**            | No                 | cURL, `fetch`, `axios`, Python `requests`, HTTPie, wget, PHP y más |
| **Documentación**     | No                 | Sí       |
| **Archivos `.http`**  | Sí                 | Sí       |

### Entornos y variables

- `{{variable}}` en URL, headers y body, resaltada en la barra: azul si existe, ámbar si no.
- Variables **globales**, de **entorno**, de **colección** y de **carpeta**.
- Si falta una variable, la petición **no se envía** y te dice cuál falta.
- Variables marcadas como **Secreto**, cifradas con el keychain.
- Comparar, mezclar, importar y exportar entornos (incluido `.env`), con detección de ciclos.
- **Variables dinámicas:** `{{$uuid}}`, `{{$timestamp}}`, `{{$isoTimestamp}}`, `{{$randomInt}}`, `{{$randomEmail}}`, `{{$randomFullName}}`, `{{$randomIp}}` y muchas más.

### Validación contra el schema

El diferenciador de Sonda. Las peticiones importadas de OpenAPI guardan el schema de cada status; al enviarlas, la pestaña **Schema** indica si la respuesta real cumple la spec.

| Revisa                                                                  | Resultado                          |
| ----------------------------------------------------------------------- | ---------------------------------- |
| Tipos, requeridos, `enum`, `nullable`, formatos, rangos y patrones      | Error con la ruta exacta (`$.tags[1].label`) |
| Arrays, `additionalProperties`, `allOf` / `anyOf` / `oneOf`, `not`      | Error con la variante más cercana  |
| Campos que la API devuelve pero la spec no documenta                    | Advertencia                      |
| Status que la spec no declara (ej. un `500` inesperado)                 | Aviso                           |

También se valida **lo que envías**: el body se comprueba contra el `requestBody` antes de mandarlo.

### Tests y automatización

- **Aserciones** sobre status, tiempo, headers y body JSON, con operadores de igualdad, comparación, `contiene`, regex y `existe`. Se pueden **generar desde la última respuesta**.
- **Extracción de variables** para encadenar peticiones (por ejemplo, un token de login).
- **Runner de colecciones** con datos CSV/JSON, repeticiones, reintentos, pausa, _detener al primer fallo_, repetir solo las fallidas, límite de tiempo por petición y estadísticas (promedio, p50, p95).
- **Historial de ejecuciones** para comparar contra corridas anteriores.
- **Reportes** en JSON, HTML (un solo archivo), JUnit XML y Markdown. No incluyen bodies, headers ni valores del entorno, así que se pueden compartir sin filtrar secretos.
- **Monitor** programado (de 1 minuto a 24 horas) con uptime y avisos solo cuando cambia el estado, también por **webhook**.

### Herramientas

Disponibles desde el menú **Herramientas** y la paleta de comandos.

| Herramienta        | Qué hace                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Historial**   | Guarda las peticiones enviadas y oculta credenciales. Incluye estadísticas y comparación         |
| **Cookies**     | Lista y borra las cookies guardadas                                                              |
| **Rendimiento** | Hasta 200 envíos con concurrencia configurable y percentiles                                     |
| **Fuzz**        | Genera bodies inválidos desde el schema y clasifica la reacción de la API                        |
| **Snapshot**    | Guarda una línea base y detecta cambios, con campos ignorables                                   |
| **Mock**        | Servidor local con respuestas generadas desde los schemas, con modo caos y overrides             |
| **Polling**     | Repite una petición hasta que se cumple una condición                                            |
| **Paginación**  | Recorre automáticamente los endpoints paginados                                                  |
| **Datos de prueba** | Genera datos aleatorios para tus bodies                                                      |
| **Git**         | Cambios del workspace, diff por archivo, descartar y commit desde la app                         |
| **Consola**     | Peticiones enviadas y `console.log` de los scripts                                               |
| **Host**        | Diagnóstico de DNS y certificado TLS                                                             |
| **Secretos**    | Detecta credenciales en texto plano dentro de las colecciones                                    |
| **Variables**   | Auditoría de variables usadas, no definidas o sin uso                                            |

### Interfaz

- Pestañas con marca de cambios sin guardar y **sesión restaurable**; fijado de pestañas.
- **Paleta de comandos**, tema claro y oscuro, diseño responsive y layout vertical u horizontal.
- Vista previa de la petición ya resuelta antes de enviarla.

### Ajustes

Tiempo límite (1 a 600 s), redirecciones, SSL (automático, siempre verificar o ignorar), proxy `http(s)` y reintentos automáticos (0 a 5).

---

## Atajos de teclado

| Atajo                      | Acción                                  |
| -------------------------- | --------------------------------------- |
| `Cmd/Ctrl + Enter`         | Enviar la petición                      |
| `Cmd/Ctrl + S`             | Guardar                                 |
| `Cmd/Ctrl + T`             | Nueva pestaña                           |
| `Cmd/Ctrl + K`             | Paleta de comandos                      |
| `Cmd/Ctrl + B`             | Mostrar u ocultar la barra lateral      |
| `Cmd/Ctrl + \`             | Cambiar layout vertical u horizontal    |
| `Cmd/Ctrl + F`             | Buscar en el body o en la respuesta     |

---

## CLI

Ejecuta tus colecciones desde la terminal o desde un pipeline, con los mismos schemas y aserciones que la app.

```bash
npm run build:cli
node out/cli/sonda.cjs run petstore --env dev --junit junit.xml
```

| Opción                                 | Qué hace                                                      |
| -------------------------------------- | ------------------------------------------------------------- |
| `-w, --workspace <ruta>`               | Carpeta del workspace (`$SONDA_WORKSPACE` o `~/Documents/Sonda`) |
| `-e, --env <nombre>`                   | Entorno a usar                                                |
| `--var <clave=valor>` / `--env-file`   | Define variables o las lee desde un `.env`                    |
| `--only` / `--exclude`                 | Filtra peticiones por término                                 |
| `--repeat <n>` / `--data <archivo>`    | Repite la colección o la ejecuta por cada fila de un CSV/JSON |
| `--include-writes`                     | Incluye `POST`, `PUT`, `PATCH` y `DELETE` (por defecto solo lectura) |
| `--bail` / `--strict` / `--dry-run`    | Detener al primer fallo, tratar avisos como fallos o simular  |
| `--retries` / `--delay` / `--timeout` / `--max-time` | Control de reintentos, pausas y tiempos         |
| `--junit` / `--json` / `--html` / `--markdown` | Escribe el reporte en el formato elegido              |
| `--baseline <archivo>`                 | Compara contra un reporte anterior y falla si algo empeoró    |
| `--watch`                              | Re-ejecuta al cambiar un `.json` del workspace                |

Con `sonda-cli list` ves las colecciones disponibles y con `--help` el resto de opciones.

### Ejemplo en GitHub Actions

```yaml
name: API checks
on: [push]
jobs:
  api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci --ignore-scripts
      - run: npm run build:cli
      - uses: actions/cache@v4
        with:
          path: baseline.json
          key: sonda-baseline-${{ github.run_id }}
          restore-keys: sonda-baseline-
      - run: >
          node out/cli/sonda.cjs run petstore -w ./sonda
          --baseline baseline.json --json baseline.json --junit junit.xml
```

La caché solo se guarda si el job termina bien, así que un `baseline.json` con regresiones nunca reemplaza al último bueno.

---

## Cómo guarda tus datos

```text
~/Documents/Sonda/
├── petstore/                      ← una carpeta por colección
│   ├── sonda.collection.json      ← nombre, baseUrl, origen de la spec, auth y headers
│   ├── pet/                       ← una subcarpeta por tag
│   │   ├── get-pet-petid.json     ← una petición = un archivo
│   │   └── post-pet.json
│   └── ...
└── .sonda/
    └── environments.json          ← entornos (sin los valores secretos)
```

- Puedes **versionar** las colecciones con Git y compartirlas con tu equipo.
- Los **secretos** se cifran con el keychain y viven en los datos privados de la app (`secrets.json`), **fuera** del workspace.
- El historial, la sesión de pestañas y los snapshots se guardan en el almacenamiento local de la app.

<details>
<summary>Ejemplo de archivo de petición</summary>

```json
{
  "name": "Find pet by ID",
  "method": "GET",
  "url": "{{baseUrl}}/pet/1",
  "headers": [],
  "body": "",
  "responseSchemas": {
    "200": {
      "type": "object",
      "required": ["name"],
      "properties": {
        "id": { "type": "integer" },
        "name": { "type": "string" }
      }
    },
    "404": null
  }
}
```

`null` significa que ese status está documentado sin body JSON.

</details>

---

## Arquitectura

```text
┌───────────────────────┐    IPC (preload)    ┌────────────────────────┐
│  Renderer (React)     │ ◄─────────────────► │  Main (Node/Electron)  │
│  Interfaz, stores     │                     │  HTTP, archivos,       │
│  Zustand, runner,     │                     │  importador Swagger,   │
│  monitor, validación  │                     │  cookies, mock server, │
│                       │                     │  keychain, scripts     │
└───────────────────────┘                     └────────────────────────┘
            └────────── src/shared: tipos y lógica pura ──────────┘
                                 ▲
                        src/cli: sonda-cli (sin Electron)
```

- El **renderer** no toca el disco ni la red: usa el API que expone `preload` (`window.api`).
- El **proceso principal** envía las peticiones, mantiene el cookie jar, lee y escribe el workspace (bloqueando rutas fuera de él), ejecuta los scripts, levanta el mock y gestiona el cifrado.
- **`src/shared`** contiene lógica pura sin dependencias de Electron, por eso es fácil de probar y la comparten la app y la CLI.

### Estructura

```text
src/
├── main/        # Proceso principal: HTTP, WebSocket, colecciones, entornos, Git, mock, scripts
├── preload/     # Puente seguro main ↔ renderer
├── renderer/    # Interfaz React: components/, store/ (Zustand) y lib/
├── cli/         # sonda-cli: ejecución de colecciones en terminal y CI
└── shared/      # Lógica pura y probada: validación, importadores, reportes, fuzz, mock…
```

### Tecnologías

| Área          | Herramientas                                                                          |
| ------------- | ------------------------------------------------------------------------------------- |
| Aplicación    | [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/) |
| Interfaz      | [React](https://react.dev/) + [Tailwind CSS](https://tailwindcss.com/)                |
| Estado        | [Zustand](https://zustand-demo.pmnd.rs/)                                              |
| Lenguaje      | [TypeScript](https://www.typescriptlang.org/)                                         |
| Red           | [undici](https://undici.nodejs.org/)                                                  |
| Specs OpenAPI | [swagger-parser](https://github.com/APIDevTools/swagger-parser)                       |
| Reportes      | [ExcelJS](https://github.com/exceljs/exceljs)                                         |
| Tests         | [Vitest](https://vitest.dev/)                                                         |
| Calidad       | ESLint + Prettier                                                                     |

---

## Scripts disponibles

| Comando                                           | Qué hace                                               |
| ------------------------------------------------- | ------------------------------------------------------ |
| `npm run dev`                                     | Abre la app en modo desarrollo con recarga en caliente |
| `npm start`                                       | Previsualiza la app compilada                          |
| `npm test` / `npm run test:watch`                 | Corre los tests una vez o en modo escucha              |
| `npm run lint`                                    | Revisa el código con ESLint                            |
| `npm run format`                                  | Da formato a todo el proyecto con Prettier             |
| `npm run typecheck`                               | Verifica los tipos de TypeScript                       |
| `npm run build`                                   | Comprueba tipos y compila la app                       |
| `npm run build:mac` / `build:win` / `build:linux` | Genera el instalador de cada sistema                   |
| `npm run build:unpack`                            | Genera la app sin empaquetar (útil para depurar)       |
| `npm run build:cli`                               | Compila la CLI en `out/cli/sonda.cjs`                  |
| `npm run cli -- run <colección>`                  | Compila y ejecuta la CLI                               |

---

## Tests y CI

La lógica de `src/shared` está cubierta con Vitest: más de **800 casos** en más de **90 archivos**.

```bash
npm test
```

En cada push a `main` y en cada pull request, **GitHub Actions** ejecuta `lint`, `typecheck` y los tests ([`ci.yml`](.github/workflows/ci.yml)).

---

## Limitaciones conocidas

- OAuth 2.0 no soporta el flujo implícito ni el de dispositivo.
- La validación de schemas cubre el subconjunto de JSON Schema que usa OpenAPI. Con `discriminator` elige la variante por el `enum` o `const` de la propiedad; no interpreta `mapping`.
- Las cookies de sesión se descartan al cerrar la app; las que tienen caducidad se guardan cifradas.
- Digest Auth con `qop=auth-int` no funciona con body multipart ni binario.
- El importador de Insomnia solo lee el formato JSON v4 y no importa los sub-entornos.
- Los instaladores de macOS aún no están firmados ni notarizados.

---

## Contribuir

Las ideas y los pull requests son bienvenidos.

1. Haz un fork y crea una rama.
2. Antes de abrir el PR, ejecuta:
   ```bash
   npm run format && npm run lint && npm run typecheck && npm test
   ```
3. Escribe los commits con [Conventional Commits](https://www.conventionalcommits.org/es/):
   ```text
   feat(runner): ejecutar colección con datos CSV/JSON por fila
   fix(sidebar): aceptar soltar en toda la colección y carpeta
   docs(readme): reestructurar y ampliar el README
   ```

---

## Licencia

Distribuido bajo la licencia **MIT**.

Hecho por [Saul Sarabia](https://github.com/SaulitoMS).