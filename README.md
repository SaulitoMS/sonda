<div align="center">

# Sonda

**Cliente de APIs local-first, sin login.**
Importa tu Swagger/OpenAPI, genera las colecciones, comprueba que la API responde lo que promete y automatiza las pruebas desde el mismo lugar.

[![CI](https://github.com/SaulitoMS/sonda/actions/workflows/ci.yml/badge.svg)](https://github.com/SaulitoMS/sonda/actions/workflows/ci.yml)
![Licencia](https://img.shields.io/badge/licencia-MIT-blue)
![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)

</div>

<!-- Agrega aquí una captura de la app: ![Sonda](docs/screenshot.png) -->

---

## Por qué Sonda

- **Local-first.** No hay cuentas, ni nube, ni telemetría. Todo vive en tu computadora.
- **Tus peticiones son archivos.** Cada petición es un `.json` legible que puedes versionar con Git.
- **De la spec a la petición en segundos.** Pega la URL de un Swagger/OpenAPI, o elige el archivo, y Sonda crea la colección completa.
- **Valida contra el schema.** Detecta cuando la API no cumple su propia documentación, tanto en la respuesta como en el body que envías.
- **Más que enviar peticiones.** Runner de colecciones, pruebas de rendimiento, fuzzing, snapshots, monitor programado y servidor mock, todo integrado.
- **Secretos cifrados.** Las variables marcadas como secreto se guardan en el keychain del sistema, no en texto plano.

---

## Contenido

- [Resumen de funciones](#resumen-de-funciones)
- [Primeros pasos](#primeros-pasos)
- [Funciones en detalle](#funciones-en-detalle)
  - [Peticiones HTTP](#peticiones-http)
  - [Autenticación](#autenticación)
  - [Respuestas](#respuestas)
  - [Colecciones y organización](#colecciones-y-organización)
  - [Importar y exportar](#importar-y-exportar)
  - [Entornos y variables](#entornos-y-variables)
  - [Validación contra el schema](#validación-contra-el-schema)
  - [Tests, aserciones y extracción](#tests-aserciones-y-extracción)
  - [Runner de colecciones](#runner-de-colecciones)
  - [Herramientas](#herramientas)
  - [Interfaz y productividad](#interfaz-y-productividad)
  - [Ajustes](#ajustes)
- [Guía de uso](#guía-de-uso)
- [Cómo guarda tus datos](#cómo-guarda-tus-datos)
- [Arquitectura](#arquitectura)
- [Scripts disponibles](#scripts-disponibles)
- [Tests y CI](#tests-y-ci)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

---

## Resumen de funciones

| Área                | Qué incluye                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Peticiones          | Todos los métodos HTTP, body JSON, `x-www-form-urlencoded` y `multipart` con archivos, GraphQL, Server-Sent Events |
| Autenticación       | Bearer, Basic, API Key y OAuth 2.0, con herencia desde la colección o la carpeta e inspector de JWT                |
| Respuestas          | JSON en árbol, XML formateado, vista previa HTML, binarios, comparación con la respuesta anterior, exportación     |
| Colecciones         | Carpetas, drag and drop, duplicar, renombrar, headers y autenticación heredados, búsqueda                          |
| Importar / exportar | OpenAPI/Swagger (URL o archivo), Postman, HAR, cURL; exportación a Postman y a código                              |
| Validación          | Respuesta y body contra el schema de la spec, con sincronización posterior de la colección                         |
| Automatización      | Aserciones, extracción de variables, runner con datos CSV/JSON, reportes JSON, HTML y JUnit, monitor programado    |
| Herramientas        | Rendimiento, fuzz, snapshot, mock server, historial, cookies                                                       |
| Interfaz            | Pestañas con sesión restaurable, paleta de comandos, tema claro y oscuro, diseño responsive, layout configurable   |

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
```

### Desarrollo

```bash
npm run dev
```

### Compilar los instaladores

```bash
npm run build:mac     # macOS
npm run build:win     # Windows
npm run build:linux   # Linux
```

Los instaladores quedan en la carpeta `dist/`.

---

## Funciones en detalle

### Peticiones HTTP

- Métodos `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` y `OPTIONS`.
- Pestañas **Params**, **Auth**, **Headers**, **Body**, **Tests** y **Extraer**. Los parámetros se sincronizan con la URL y cada fila de headers se puede activar o desactivar.
- **Tipos de body:** JSON, `x-www-form-urlencoded` y `multipart/form-data` con archivos (hasta 100 MB por archivo).
- **Editor JSON asistido:** botón para formatear y validar, sangría y cierre automático de llaves, corchetes y comillas, búsqueda con resaltado (`Cmd/Ctrl + F`), y resaltado y autocompletado de `{{variables}}`.
- Si el body es JSON y no defines `Content-Type`, Sonda lo agrega por ti.
- **Asistente GraphQL** con introspección del schema para listar queries y mutations y generar la consulta de partida.
- **Server-Sent Events:** vista en vivo del stream y lista de eventos al terminar.
- **Cancelación** de peticiones en curso desde la barra de URL.
- **Reintentos automáticos** con backoff en peticiones idempotentes.
- **Redirecciones manuales:** se muestra la cadena completa de saltos, se conservan las cookies en cada uno y se quitan las credenciales al cambiar de sitio, con las mismas reglas que un navegador.
- **Cookie jar** compartido entre peticiones, con modal para ver y borrar cookies.
- Solo se permiten URLs `http` y `https`.

### Autenticación

- Pestaña **Auth** con **Bearer**, **Basic**, **API Key** y **OAuth 2.0** (flujo `client_credentials`, con el token en caché en memoria hasta que caduca).
- **Herencia:** la autenticación se puede definir en la colección o en una carpeta, y las peticiones la heredan. Cada petición puede sobrescribirla o desactivarla.
- **Inspector de JWT** bajo el token Bearer, con algoritmo, claims y expiración en vivo (decodifica el token, no verifica la firma).
- Aviso cuando la autenticación queda vacía y por eso no se envía.

### Respuestas

- Estado, tiempo, **TTFB**, tamaño, body formateado y headers.
- **JSON en árbol** con filtro por ruta y botón para copiar la ruta de cualquier nodo.
- **XML** formateado y **vista previa HTML** dentro de un sandbox.
- **Binarios** con vista previa y descarga. Las respuestas se limitan a 100 MB.
- **Búsqueda** dentro del body (`Cmd/Ctrl + F`).
- Pestaña **Cambios:** compara la respuesta con la anterior de la misma petición y lista lo que se agregó, se quitó o cambió.
- **Exportar** el body o la respuesta completa a un archivo.
- Botón para copiar el body.

### Colecciones y organización

- Crea colecciones, guarda peticiones en ellas y organízalas en carpetas.
- **Guardar** sobrescribe la petición abierta; **Guardar como…** crea una nueva.
- **Drag and drop** para mover y reordenar peticiones, carpetas y colecciones.
- Duplicar peticiones, renombrar con doble clic y buscar desde la barra lateral.
- **Headers heredados** por colección y carpeta: los de la carpeta pisan a los de la colección.
- **Sincronizar con la spec:** vuelve a leer el OpenAPI de origen y aplica los cambios a la colección, sin pisar lo que editaste a mano.
- Abre la carpeta de trabajo desde la app para ver los archivos directamente.

### Importar y exportar

| Origen o destino      | Detalle                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Swagger / OpenAPI** | Swagger 2.0 y OpenAPI 3.x, por **URL** o desde un **archivo local** `.json`, `.yaml` o `.yml`                                                               |
| **Postman**           | Importa colecciones `.json` y exporta tus colecciones al formato de Postman                                                                                 |
| **HAR**               | Importa capturas del navegador. Se queda solo con las llamadas a APIs (XHR y fetch), junta las repetidas y usa `{{baseUrl}}` si todas van al mismo servidor |
| **cURL**              | Pega un comando en la barra de URL y se importa. Entiende el formato de Chrome (`$'...'`). El modal permite exportar la petición como comando               |
| **Código**            | Genera la petición en cURL, JavaScript (`fetch`), JavaScript (`axios`) y Python (`requests`)                                                                |

Al importar un Swagger:

- Si la URL no es la spec (por ejemplo, la página de Swagger UI), Sonda prueba rutas comunes como `/v3/api-docs`, `/openapi.json` o `/swagger.json`.
- Genera una petición por endpoint, con ejemplos para parámetros de path, query, headers y body JSON.
- Agrupa las peticiones en carpetas según los _tags_ de la spec.
- Crea y activa un entorno con la `baseUrl` del servidor, y las peticiones la usan como `{{baseUrl}}`.

### Entornos y variables

- Usa `{{variable}}` en la URL, los headers y el body.
- En la barra de URL, las variables se resaltan: **azul** si están definidas y **ámbar** si no. Al pasar el cursor ves su valor.
- Si falta alguna variable, Sonda **no envía** la petición y te dice cuáles faltan.
- Puedes crear, duplicar y cambiar de entorno desde la cabecera.
- Marca una variable como **Secreto** para cifrarla con el keychain del sistema.
- **Variables dinámicas** que se generan en cada envío:

| Categoría     | Variables                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fechas        | `{{$timestamp}}`, `{{$timestampMs}}`, `{{$isoTimestamp}}`, `{{$date}}`, `{{$randomPastDate}}`, `{{$randomFutureDate}}`                                     |
| Datos         | `{{$uuid}}`, `{{$randomInt}}`, `{{$randomDecimal}}`, `{{$randomBool}}`, `{{$randomString}}`, `{{$randomColor}}`                                            |
| Personas      | `{{$randomFirstName}}`, `{{$randomLastName}}`, `{{$randomFullName}}`, `{{$randomUsername}}`, `{{$randomEmail}}`, `{{$randomPhone}}`, `{{$randomPassword}}` |
| Lugares y red | `{{$randomCity}}`, `{{$randomCompany}}`, `{{$randomIp}}`, `{{$randomUrl}}`                                                                                 |

### Validación contra el schema

Es el diferenciador de Sonda. Las peticiones importadas de OpenAPI guardan los schemas de respuesta de cada status. Al enviarlas, una pestaña **Schema** te dice si la respuesta real cumple lo que la spec promete.

| Qué revisa                                                                   | Resultado                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| Tipos, campos requeridos, `enum`, `nullable`                                 | Error con la ruta exacta, por ejemplo `$.tags[1].label` |
| Formatos (`date-time`, `email`, `uuid`, `uri`), rangos, longitudes, patrones | Error                                                   |
| `multipleOf` y `not`                                                         | Error                                                   |
| Arrays (`minItems`, `maxItems`, `uniqueItems`) y `additionalProperties`      | Error                                                   |
| Combinaciones `allOf`, `anyOf`, `oneOf`                                      | Error con la variante más cercana                       |
| Campos que la API devuelve pero la spec no documenta                         | Advertencia (no invalida)                               |
| Status que la spec no declara (ej. un `500` inesperado)                      | Aviso de status no documentado                          |
| Body vacío o JSON inválido cuando se esperaba un body                        | Error                                                   |

El schema se busca por status exacto (`200`), por rango (`4XX`) o por `default`.

También se valida **lo que envías**: el body de la petición se comprueba contra el schema del `requestBody` antes de mandarlo. Para colecciones importadas antes de estas funciones, vuelve a importar la spec o usa **Sincronizar**.

### Tests, aserciones y extracción

- **Aserciones por petición**, junto a la validación de schema. Se pueden aplicar sobre **status**, **tiempo**, **headers** y **body JSON** (por ruta, como `data.items[0].id`), con operadores `es igual a`, `es distinto de`, `menor`, `mayor`, `contiene`, `no contiene`, `coincide con (regex)`, `existe` y `no existe`.
- **Generar aserciones desde la última respuesta:** Sonda propone status exacto, tiempo con margen, `content-type` y la forma del JSON. Solo fija valores estables; no fija ids, fechas ni contadores.
- **Extraer variables:** guarda un valor del body o de un header de la respuesta en una variable del entorno, para encadenar peticiones (por ejemplo, un token de login).

### Runner de colecciones

Ejecuta todas las peticiones de una colección con un clic y revisa el resultado de cada una.

- Valida el schema y las aserciones de cada petición.
- **Datos de prueba:** ejecuta la colección una vez por fila de un archivo **CSV o JSON**. Las columnas se usan como variables.
- Reintentos, pausa entre peticiones (0 a 10 000 ms), detener al primer fallo y **repetir solo las fallidas**.
- Estadísticas: promedio, p50, p95 y la petición más lenta.
- **Reportes** en JSON, HTML (un solo archivo, sin dependencias) y **JUnit XML** para GitHub Actions, GitLab CI o Jenkins. Los reportes no incluyen bodies, headers ni valores del entorno, así que se pueden compartir sin filtrar secretos.

### Herramientas

Disponibles desde el menú **Herramientas** de la cabecera y desde la paleta de comandos.

| Herramienta     | Qué hace                                                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Historial**   | Guarda las peticiones enviadas y permite restaurarlas. Oculta credenciales en headers, query y bodies, y recorta los bodies largos                               |
| **Cookies**     | Lista y borra las cookies guardadas de las respuestas                                                                                                            |
| **Rendimiento** | Envía la petición varias veces (hasta 200) con concurrencia configurable (hasta 10) y muestra percentiles, entre ellos p50 y p95                                 |
| **Fuzz**        | Genera bodies inválidos a partir del schema de la petición y clasifica la reacción de la API: rechazada, aceptada, dudosa o fallo (`5xx`)                        |
| **Snapshot**    | Guarda una respuesta como línea base y detecta cambios en la API, con una lista de campos a ignorar                                                              |
| **Monitor**     | Ejecuta una colección cada cierto tiempo (de 1 minuto a 24 horas), calcula el uptime y avisa solo cuando el estado cambia: cuando empieza a fallar o se recupera |
| **Mock**        | Levanta un servidor local con respuestas de ejemplo generadas desde los schemas de la colección, útil para desarrollar el frontend antes que el backend          |
| **cURL**        | Importa o exporta la petición actual como comando                                                                                                                |
| **Ajustes**     | Tiempo límite, SSL, proxy y reintentos                                                                                                                           |

### Interfaz y productividad

- **Pestañas** con marca de cambios sin guardar. La sesión se restaura al reabrir la app (hasta 30 pestañas).
- **Paleta de comandos** para buscar y abrir peticiones, y ejecutar acciones.
- **Tema claro y oscuro.**
- **Diseño responsive** y paneles redimensionables, con el layout de petición y respuesta en vertical u horizontal.

| Atajo                      | Acción                                  |
| -------------------------- | --------------------------------------- |
| `Cmd/Ctrl + Enter`         | Enviar la petición                      |
| `Enter` en la barra de URL | Enviar la petición                      |
| `Cmd/Ctrl + S`             | Guardar                                 |
| `Cmd/Ctrl + T`             | Nueva pestaña                           |
| `Cmd/Ctrl + K`             | Abrir la paleta de comandos             |
| `Cmd/Ctrl + B`             | Mostrar u ocultar la barra lateral      |
| `Cmd/Ctrl + \`             | Cambiar el layout vertical u horizontal |
| `Cmd/Ctrl + F`             | Buscar en el body o en la respuesta     |

### Ajustes

| Ajuste                 | Detalle                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Tiempo límite          | De 1 a 600 segundos (30 por defecto)                                                                |
| Redirecciones          | Seguirlas automáticamente o no                                                                      |
| SSL                    | Automático (tolera certificados inválidos solo en `localhost`), siempre verificar o ignorar errores |
| Proxy                  | URL `http://` o `https://`                                                                          |
| Reintentos automáticos | De 0 a 5, con espera configurable entre intentos                                                    |

---

## Guía de uso

### Probar una API desde un Swagger

1. En la barra lateral, abre **Importar Swagger**.
2. Pega la URL de la spec, por ejemplo `https://petstore3.swagger.io/api/v3/openapi.json`, o elige un archivo local.
3. Sonda crea la colección, un entorno con la `baseUrl` y lo deja activo.
4. Abre cualquier petición de la colección y pulsa **Enviar**.
5. Revisa la pestaña **Schema** de la respuesta.

### Ejecutar toda la colección

1. En la colección, pulsa **Ejecutar todas las peticiones**.
2. Opcional: carga un CSV o JSON para repetir la ejecución con distintos datos.
3. Revisa los resultados y exporta el reporte en HTML o JUnit si lo necesitas en el CI.

### Encadenar peticiones

1. En la petición de login, abre la pestaña **Extraer** y guarda el token de la respuesta en una variable, por ejemplo `token`.
2. En las demás peticiones, usa `Authorization: Bearer {{token}}`, o define la autenticación una sola vez en la colección y deja que se herede.

### Trabajar con entornos

1. Abre **Entornos** en la cabecera y pulsa **Gestionar entornos**.
2. Crea un entorno (por ejemplo `Producción`) y agrega variables como `baseUrl` o `token`.
3. Marca `token` como **Secreto** para que se guarde cifrado.
4. Úsalas en cualquier campo: `{{baseUrl}}/users`, `Authorization: Bearer {{token}}`.

### Importar un cURL

Copia el comando desde la documentación de una API o desde las DevTools del navegador y pégalo en la barra de URL. Sonda rellena método, URL, headers y body.

### Migrar desde Postman o desde el navegador

Usa **Postman** en la barra lateral para importar una colección `.json` de Postman o una captura `.har` exportada desde la pestaña Red del navegador.

---

## Cómo guarda tus datos

Sonda guarda las colecciones y los entornos en archivos normales dentro de tu carpeta de documentos:

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

Así puedes versionar tus colecciones con Git y compartirlas con tu equipo.

**Los secretos no van en esa carpeta.** Se cifran con el keychain del sistema y se guardan en los datos privados de la aplicación (`secrets.json`), fuera del workspace.

El historial, la sesión de pestañas y los snapshots se guardan en el almacenamiento local de la aplicación, no en el workspace.

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
│  Interfaz, stores     │                     │  Peticiones HTTP,      │
│  Zustand, runner,     │                     │  archivos, importador  │
│  monitor, validación  │                     │  Swagger, cookies,     │
│                       │                     │  mock server, keychain │
└───────────────────────┘                     └────────────────────────┘
            └────────── src/shared: tipos y lógica pura ──────────┘
```

- El **renderer** no toca el sistema de archivos ni la red directamente: usa el API que expone `preload` (`window.api`).
- El **proceso principal** hace las peticiones HTTP, mantiene el cookie jar, lee y escribe el workspace (bloqueando rutas fuera de él), levanta el servidor mock y gestiona el cifrado.
- **`src/shared`** contiene lógica pura sin dependencias de Electron, por eso se prueba fácil con Vitest.

### Estructura del proyecto

```text
src/
├── main/                     # Proceso principal
│   ├── index.ts              #   Ventana y arranque
│   ├── http.ts               #   Envío de peticiones, streams y multipart
│   ├── cookieJar.ts          #   Cookies entre peticiones
│   ├── collections.ts        #   Colecciones y archivos del workspace
│   ├── environments.ts       #   Entornos y secretos cifrados
│   ├── settings.ts           #   Ajustes globales
│   ├── swagger.ts            #   Importador de OpenAPI/Swagger
│   └── mockServer.ts         #   Servidor mock local
├── preload/                  # Puente seguro main ↔ renderer
├── renderer/src/             # Interfaz (React)
│   ├── components/           #   RequestPanel, ResponsePanel, Sidebar, modales…
│   ├── store/                #   Estado global con Zustand
│   └── lib/                  #   Utilidades de la interfaz (runner, monitor, OAuth…)
└── shared/                   # Código común y probado
    ├── validate.ts           #   Validación contra el schema
    ├── assertions.ts         #   Aserciones y autogeneración
    ├── extract.ts            #   Extracción de variables
    ├── variables.ts          #   Interpolación de {{variables}}
    ├── dynamicVariables.ts   #   Variables dinámicas ({{$uuid}}, …)
    ├── curl.ts / codegen.ts  #   cURL y generación de código
    ├── postman.ts / har.ts   #   Importadores de Postman y HAR
    ├── specSync.ts           #   Sincronización con la spec
    ├── report.ts             #   Reportes JSON, HTML y JUnit
    ├── fuzz.ts / mock.ts     #   Fuzzing y respuestas mock
    ├── monitor.ts            #   Lógica del monitor
    └── types.ts              #   Tipos compartidos
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
| Tests         | [Vitest](https://vitest.dev/)                                                         |
| Calidad       | ESLint + Prettier                                                                     |

---

## Scripts disponibles

| Comando                                           | Qué hace                                               |
| ------------------------------------------------- | ------------------------------------------------------ |
| `npm run dev`                                     | Abre la app en modo desarrollo con recarga en caliente |
| `npm start`                                       | Previsualiza la app compilada                          |
| `npm test`                                        | Corre los tests una vez                                |
| `npm run test:watch`                              | Corre los tests y se queda escuchando cambios          |
| `npm run lint`                                    | Revisa el código con ESLint                            |
| `npm run format`                                  | Da formato a todo el proyecto con Prettier             |
| `npm run typecheck`                               | Verifica los tipos de TypeScript                       |
| `npm run build`                                   | Comprueba tipos y compila la app                       |
| `npm run build:mac` / `build:win` / `build:linux` | Genera el instalador de cada sistema                   |
| `npm run build:unpack`                            | Genera la app sin empaquetar (útil para depurar)       |

---

## Tests y CI

La lógica de `src/shared` está cubierta con Vitest, con más de 350 casos repartidos en 28 archivos. Incluye el parser y exportador de cURL, la interpolación de variables, el validador de schemas, las aserciones, los importadores de Postman y HAR, la sincronización con la spec, los reportes, el fuzzing, los snapshots, el monitor y el generador de código, entre otros.

```bash
npm test
```

En cada push a `main` y en cada pull request, **GitHub Actions** ejecuta `lint`, `typecheck` y los tests (ver [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

Los reportes JUnit del runner permiten, además, usar Sonda como paso de verificación de tu propia API en tus pipelines.

---

## Limitaciones conocidas

- OAuth 2.0 soporta por ahora solo el flujo `client_credentials`; no hay flujos que requieran abrir un navegador.
- La validación de schemas cubre el subconjunto de JSON Schema que usa OpenAPI; todavía no interpreta `discriminator`.
- Las cookies viven solo en memoria y se descartan al cerrar la app.
- Los instaladores de macOS aún no están firmados ni notarizados.

---

## Contribuir

Las ideas y los pull requests son bienvenidos.

1. Haz un fork y crea una rama.
2. Antes de abrir el PR, ejecuta:
   ```bash
   npm run format && npm run lint && npm run typecheck && npm test
   ```
3. Escribe los commits siguiendo [Conventional Commits](https://www.conventionalcommits.org/es/):
   ```text
   feat(runner): ejecutar colección con datos CSV/JSON por fila
   fix(sidebar): aceptar soltar en toda la colección y carpeta
   docs(readme): actualizar funciones y guía de uso
   ```

---

## Licencia

Distribuido bajo la licencia **MIT**.

Hecho por [Saul Sarabia](https://github.com/SaulitoMS).
