<div align="center">

# 🛰️ Sonda

**Cliente de APIs local-first, sin login.**
Importa tu Swagger/OpenAPI, genera las colecciones y comprueba que la API responde lo que promete.

[![CI](https://github.com/SaulitoMS/sonda/actions/workflows/ci.yml/badge.svg)](https://github.com/SaulitoMS/sonda/actions/workflows/ci.yml)
![Licencia](https://img.shields.io/badge/licencia-MIT-blue)
![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)

</div>

<!-- Agrega aquí una captura de la app: ![Sonda](docs/screenshot.png) -->

---

## ✨ ¿Por qué Sonda?

- 🔒 **Local-first:** no hay cuentas, ni nube, ni telemetría. Todo vive en tu computadora.
- 📁 **Tus peticiones son archivos:** cada petición es un `.json` legible que puedes versionar con Git.
- ⚡ **De la spec a la petición en segundos:** pega la URL de un Swagger/OpenAPI y Sonda crea la colección completa.
- ✅ **Valida las respuestas contra el schema:** detecta cuando la API no cumple su propia documentación.
- 🔑 **Secretos cifrados:** las variables marcadas como secreto se guardan en el keychain del sistema, no en texto plano.

---

## 📚 Contenido

- [Funciones](#-funciones)
- [Primeros pasos](#-primeros-pasos)
- [Guía de uso](#-guía-de-uso)
- [Cómo guarda tus datos](#-cómo-guarda-tus-datos)
- [Arquitectura](#-arquitectura)
- [Scripts disponibles](#-scripts-disponibles)
- [Tests y CI](#-tests-y-ci)
- [Limitaciones conocidas](#-limitaciones-conocidas)
- [Contribuir](#-contribuir)
- [Licencia](#-licencia)

---

## 🧩 Funciones

### 🌐 Peticiones HTTP

- Métodos `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` y `OPTIONS`.
- Editor de **headers** (con activar/desactivar cada fila) y de **body**.
- Si el body es JSON y no defines `Content-Type`, Sonda lo agrega por ti.
- Visor de respuesta con **status**, **tiempo**, **tamaño**, body formateado y headers.
- Botón para copiar el body, timeout de 30 s y seguimiento automático de redirecciones.
- Solo se permiten URLs `http` y `https`.

### 📂 Colecciones

- Crea colecciones, guarda peticiones en ellas y organízalas en carpetas.
- **Guardar** sobrescribe la petición abierta; **Guardar como…** crea una nueva.
- Abre la carpeta de trabajo desde la app para ver los archivos directamente.

### 📥 Importar Swagger / OpenAPI

- Soporta **Swagger 2.0 y OpenAPI 3.x**, por URL.
- Si la URL no es la spec (por ejemplo, la página de Swagger UI), Sonda prueba rutas comunes como `/v3/api-docs`, `/openapi.json` o `/swagger.json`.
- Genera una petición por endpoint, con ejemplos para parámetros de path, query, headers y body JSON.
- Agrupa las peticiones en carpetas según los _tags_ de la spec.
- Crea y activa un entorno con la `baseUrl` del servidor, y las peticiones la usan como `{{baseUrl}}`.

### 🔤 Entornos y variables

- Usa `{{variable}}` en la URL, los headers y el body.
- En la barra de URL, las variables se resaltan: **azul** si están definidas y **ámbar** si no. Al pasar el cursor ves su valor.
- Si falta alguna variable, Sonda **no envía** la petición y te dice cuáles faltan.
- Puedes crear, duplicar y cambiar de entorno desde la cabecera.
- Marca una variable como **Secreto** para cifrarla con el keychain del sistema.

### 🔁 cURL

- **Pega un comando `curl` directamente en la barra de URL** y se importa como petición.
- Entiende el formato que genera Chrome al copiar como cURL (`$'...'`).
- El modal **cURL** permite importar y **exportar** la petición actual como comando.
- Avisa de lo que no soporta (archivos `@`, cookies desde archivo, formularios `-F`).

### ✅ Validación de respuestas contra el schema

Es el diferenciador de Sonda. Las peticiones importadas de OpenAPI guardan los schemas de respuesta de cada status. Al enviarlas, una pestaña **Schema** te dice si la respuesta real cumple lo que la spec promete.

| Qué revisa                                                                   | Resultado                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Tipos, campos requeridos, `enum`, `nullable`                                 | ❌ Error con la ruta exacta, por ejemplo `$.tags[1].label` |
| Formatos (`date-time`, `email`, `uuid`, `uri`), rangos, longitudes, patrones | ❌ Error                                                   |
| Arrays (`minItems`, `maxItems`, `uniqueItems`) y `additionalProperties`      | ❌ Error                                                   |
| Combinaciones `allOf`, `anyOf`, `oneOf`                                      | ❌ Error con la variante más cercana                       |
| Campos que la API devuelve pero la spec no documenta                         | ⚠️ Advertencia (no invalida)                               |
| Status que la spec no declara (ej. un `500` inesperado)                      | ⚠️ Aviso de status no documentado                          |
| Body vacío o JSON inválido cuando se esperaba un body                        | ❌ Error                                                   |

El schema se busca por status exacto (`200`), por rango (`4XX`) o por `default`. Para colecciones importadas antes de esta función, vuelve a importar la spec.

### ⌨️ Atajos

| Atajo                      | Acción             |
| -------------------------- | ------------------ |
| `Cmd/Ctrl + Enter`         | Enviar la petición |
| `Enter` en la barra de URL | Enviar la petición |
| `Cmd/Ctrl + S`             | Guardar            |

---

## 🚀 Primeros pasos

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

## 🧭 Guía de uso

### Probar una API desde un Swagger

1. En la barra lateral, pulsa **⇣ Swagger**.
2. Pega la URL de la spec, por ejemplo `https://petstore3.swagger.io/api/v3/openapi.json`.
3. Sonda crea la colección, un entorno con la `baseUrl` y lo deja activo.
4. Abre cualquier petición de la colección y pulsa **Enviar**.
5. Revisa la pestaña **Schema** de la respuesta.

### Trabajar con entornos

1. Abre **Entornos** en la cabecera y pulsa **Gestionar entornos**.
2. Crea un entorno (por ejemplo `Producción`) y agrega variables como `baseUrl` o `token`.
3. Marca `token` como **Secreto** para que se guarde cifrado.
4. Úsalas en cualquier campo: `{{baseUrl}}/users`, `Authorization: Bearer {{token}}`.

### Importar un cURL

Copia el comando desde la documentación de una API o desde las DevTools del navegador y pégalo en la barra de URL. Sonda rellena método, URL, headers y body.

---

## 💾 Cómo guarda tus datos

Sonda guarda todo en archivos normales dentro de tu carpeta de documentos:

```text
~/Documents/Sonda/
├── petstore/                      ← una carpeta por colección
│   ├── sonda.collection.json      ← nombre, baseUrl y origen de la spec
│   ├── pet/                       ← una subcarpeta por tag
│   │   ├── get-pet-petid.json     ← una petición = un archivo
│   │   └── post-pet.json
│   └── ...
└── .sonda/
    └── environments.json          ← entornos (sin los valores secretos)
```

Así puedes versionar tus colecciones con Git y compartirlas con tu equipo.

**Los secretos no van en esa carpeta.** Se cifran con el keychain del sistema y se guardan en los datos privados de la aplicación (`secrets.json`), fuera del workspace.

<details>
<summary>📄 Ejemplo de archivo de petición</summary>

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

## 🏗️ Arquitectura

```text
┌───────────────────────┐    IPC (preload)    ┌────────────────────────┐
│  Renderer (React)     │ ◄─────────────────► │  Main (Node/Electron)  │
│  Interfaz, stores     │                     │  Peticiones HTTP,      │
│  Zustand, validación  │                     │  archivos, importador  │
│  de respuestas        │                     │  Swagger, keychain     │
└───────────────────────┘                     └────────────────────────┘
            └────────── src/shared: tipos y lógica pura ──────────┘
```

- El **renderer** no toca el sistema de archivos ni la red directamente: usa el API que expone `preload` (`window.api`).
- El **proceso principal** hace las peticiones HTTP, lee y escribe el workspace (bloqueando rutas fuera de él) y gestiona el cifrado.
- **`src/shared`** contiene lógica pura sin dependencias de Electron, por eso se prueba fácil con Vitest.

### Estructura del proyecto

```text
src/
├── main/                     # Proceso principal
│   ├── index.ts              #   Ventana y arranque
│   ├── http.ts               #   Envío de peticiones
│   ├── collections.ts        #   Colecciones y archivos del workspace
│   ├── environments.ts       #   Entornos y secretos cifrados
│   └── swagger.ts            #   Importador de OpenAPI/Swagger
├── preload/                  # Puente seguro main ↔ renderer
├── renderer/src/             # Interfaz (React)
│   ├── components/           #   RequestBar, ResponsePanel, Sidebar, modales…
│   ├── store/                #   Estado global con Zustand
│   └── lib/                  #   Utilidades de la interfaz
└── shared/                   # Código común y probado
    ├── curl.ts               #   Importar/exportar cURL
    ├── variables.ts          #   Interpolación de {{variables}}
    ├── validate.ts           #   Validación de respuestas contra el schema
    └── types.ts              #   Tipos compartidos
```

### Tecnologías

| Área          | Herramientas                                                                          |
| ------------- | ------------------------------------------------------------------------------------- |
| Aplicación    | [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/) |
| Interfaz      | [React](https://react.dev/) + [Tailwind CSS](https://tailwindcss.com/)                |
| Estado        | [Zustand](https://zustand-demo.pmnd.rs/)                                              |
| Lenguaje      | [TypeScript](https://www.typescriptlang.org/)                                         |
| Specs OpenAPI | [swagger-parser](https://github.com/APIDevTools/swagger-parser)                       |
| Tests         | [Vitest](https://vitest.dev/)                                                         |
| Calidad       | ESLint + Prettier                                                                     |

---

## 🧰 Scripts disponibles

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

## 🧪 Tests y CI

La lógica de `src/shared` está cubierta con Vitest: el parser y exportador de cURL, la interpolación de variables y el validador de respuestas.

```bash
npm test
```

En cada push a `main` y en cada pull request, **GitHub Actions** ejecuta `lint`, `typecheck` y los tests (ver [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

---

## 🚧 Limitaciones conocidas

- Aún no se pueden enviar **archivos** ni formularios **multipart** (`-F` en cURL se omite con un aviso).
- La validación de schemas cubre el subconjunto de JSON Schema que usa OpenAPI; todavía no interpreta `discriminator`, `not` ni `multipleOf`.
- El importador de Swagger funciona por **URL**; no importa archivos locales.
- Los instaladores de macOS aún no están firmados ni notarizados.

---

## 🤝 Contribuir

¡Las ideas y los pull requests son bienvenidos!

1. Haz un fork y crea una rama.
2. Antes de abrir el PR, ejecuta:
   ```bash
   npm run format && npm run lint && npm run typecheck && npm test
   ```
3. Escribe los commits siguiendo [Conventional Commits](https://www.conventionalcommits.org/es/):
   ```text
   feat(curl): importar y exportar peticiones como cURL
   fix(lint): evitar acceso a refs durante el render en VariableInput
   ci(actions): agregar lint, typecheck y tests en cada push y PR
   ```

---

## 📄 Licencia

Distribuido bajo la licencia **MIT**.

Hecho por [Saul Sarabia](https://github.com/SaulitoMS).
