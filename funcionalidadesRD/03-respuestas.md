# 03 · Respuestas

Todo lo que Sonda te muestra después de enviar una petición: estado, tiempos, body en árbol o texto, headers, comparación con la respuesta anterior, revisión de seguridad y exportación.

![Panel de respuesta de Sonda](./img/03-respuestas/00-vista-general.png)

## Contenido

- [Estados del panel](#estados-del-panel)
- [Barra de resumen](#barra-de-resumen)
- [Pestaña Body](#pestaña-body)
  - [JSON en árbol](#json-en-árbol)
  - [Filtrar el JSON](#filtrar-el-json)
  - [Ver como texto y copiar](#ver-como-texto-y-copiar)
  - [XML](#xml)
  - [HTML: vista previa](#html-vista-previa)
  - [Binarios e imágenes](#binarios-e-imágenes)
  - [Eventos SSE](#eventos-sse)
- [Buscar dentro de la respuesta](#buscar-dentro-de-la-respuesta)
- [Pestaña Headers](#pestaña-headers)
- [Pestañas Schema y Tests](#pestañas-schema-y-tests)
- [Pestaña Cambios](#pestaña-cambios)
- [Pestaña Seguridad](#pestaña-seguridad)
- [Avisos sobre la respuesta](#avisos-sobre-la-respuesta)
- [Exportar](#exportar)
- [Límites de tamaño](#límites-de-tamaño)
- [Qué hacer cuando…](#qué-hacer-cuando)

---

## Estados del panel

| Estado                | Qué verás                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| **Sin enviar**        | _"Aún no hay respuesta"_, con el recordatorio de `Ctrl/⌘ + Enter` para enviar                      |
| **Enviando**          | Un indicador giratorio con _"Enviando petición…"_. Si es un stream SSE, el texto llega en vivo     |
| **Respuesta**         | La barra de resumen, las pestañas y el contenido                                                   |
| **Error**             | Un recuadro rojo **"Error en la petición"** con el motivo y cuánto tardó en fallar                 |

El estado **Error** aparece cuando no hubo respuesta del servidor: no se pudo resolver el dominio, se rechazó la conexión, venció el tiempo límite, etc. Una respuesta `404` o `500` **no** es un error de este tipo: es una respuesta normal con su status.

![Recuadro "Error en la petición"](./img/03-respuestas/01-error.png)

---

## Barra de resumen

A la derecha de las pestañas aparecen tres datos y el botón de exportar:

### Estado (status)

Un indicador con el código y el texto (por ejemplo `200 OK`), con color según la familia:

| Códigos   | Color   |
| --------- | ------- |
| `2xx`     | Verde   |
| `3xx`     | Azul    |
| `4xx`     | Ámbar   |
| `5xx`     | Rojo    |

### Tiempo

El tiempo total en milisegundos, con un reloj. El color indica qué tan rápida fue:

| Tiempo        | Color   |
| ------------- | ------- |
| Menos de 300 ms | Verde |
| 300 a 999 ms  | Ámbar   |
| 1000 ms o más | Rojo    |

Junto al tiempo aparece **(TTFB n)**: el _time to first byte_, es decir, cuánto tardó el servidor en empezar a responder.

**Desglose:** pasa el cursor sobre el tiempo para ver un tooltip con el detalle:

- **Conexión nueva:** `DNS: 12 ms · TCP + TLS: 45 ms · Espera del servidor: 80 ms · Descarga: 5 ms`
- **Conexión reutilizada:** `Conexión reutilizada · Espera del servidor: 80 ms · Descarga: 5 ms`

![Tooltip con el desglose de tiempos](./img/03-respuestas/02-tiempos.png)

### Tamaño

El peso del body recibido en `B`, `KB` o `MB`.

---

## Pestaña Body

### JSON en árbol

Si la respuesta es JSON, se muestra como un **árbol** navegable.

- Los dos primeros niveles vienen **abiertos**; los más profundos, cerrados.
- Un nodo cerrado muestra cuántos hijos tiene: `{ 5 campos }` o `[ 12 items ]`.
- **Clic en una clave** para **copiar su ruta** al portapapeles. Verás **"✓ ruta copiada"** un instante. Es útil para armar aserciones y extracciones (por ejemplo, `data.items[0].id`).

![Árbol JSON con una ruta copiada](./img/03-respuestas/03-arbol-json.png)

### Filtrar el JSON

Encima del árbol hay un campo de filtro. Escribe una consulta y se muestra **solo** lo que coincide.

| Consulta                                        | Qué devuelve                                         |
| ----------------------------------------------- | ---------------------------------------------------- |
| `data.items[0].name`                            | Una ruta concreta                                    |
| `items[-1]`                                     | El último elemento de una lista                      |
| `items[*].id` o `items.*.id`                    | El campo `id` de todos los elementos                 |
| `..email`                                       | Todos los `email`, a cualquier profundidad           |
| `items[?(@.price > 10)]`                        | Los elementos que cumplen una condición              |
| `items[?(@.price > 10 && @.active == true)]`    | Varias condiciones con `&&`                          |
| `items[?(@.name ~= 'ana' \|\| @.role == "admin")]` | Alternativas con `\|\|`                           |

Operadores en las condiciones: `==`, `!=`, `>`, `>=`, `<`, `<=` y `~=` (**contiene**, sin distinguir mayúsculas). Un `@.campo` solo, sin operador, pide que el campo exista y no sea `null` ni `false`.

Mensajes:

- _No existe "…" en la respuesta_ → la consulta es válida pero no hay nada que coincida.
- _Consulta mal escrita. Ejemplos: …_ → la sintaxis no es correcta.

![Filtro aplicado sobre un JSON](./img/03-respuestas/04-filtro.png)

### Ver como texto y copiar

- **Ver texto / Ver árbol:** alterna entre el árbol y el JSON formateado como texto.
- **Copiar:** copia el body ya formateado. El botón cambia a **¡Copiado!** un momento.
- Si la respuesta no tiene contenido, verás _"(respuesta vacía)"_.

### XML

Si la respuesta es XML bien formado, se muestra **indentado**. Si no está bien formado, se muestra tal cual llegó.

### HTML: vista previa

Si la respuesta es una página HTML, aparece un botón junto al body:

- **Vista previa:** muestra la página renderizada.
- **Ver código:** vuelve al HTML en texto (es la vista por defecto).

La vista previa está **aislada por seguridad**: sin scripts, imágenes ni estilos externos. Verás el aviso _"Sin scripts, imágenes ni estilos externos (por seguridad)"_.

![Vista previa de una respuesta HTML](./img/03-respuestas/05-html.png)

### Binarios e imágenes

Si la respuesta no es texto (PDF, imagen, ZIP…), Sonda no intenta mostrarla como texto:

- Muestra el tipo y el tamaño (por ejemplo `image/png · 84.2 KB`).
- Si es una **imagen** (`png`, `jpg`, `gif`, `webp`, `avif`, `bmp`, `ico`), la muestra como **vista previa**.
- El botón **Descargar .ext** guarda el archivo con la extensión que corresponde.

Casos especiales:

- Más de **20 MB**: _"Supera el límite de 20 MB: no se puede mostrar ni descargar desde Sonda."_
- Una respuesta binaria abierta desde el **historial**: _"El contenido no se conservó (por ejemplo, al abrirlo desde el historial). Envía la petición otra vez."_

![Respuesta binaria con vista previa de imagen](./img/03-respuestas/06-binario.png)

### Eventos SSE

Los streams `text/event-stream` se muestran como una tarjeta por evento, con botón **Ver texto / Ver eventos**. Está explicado en detalle en la [guía de Peticiones HTTP](./01-peticiones-http.md#server-sent-events-sse).

---

## Buscar dentro de la respuesta

Con la pestaña **Body** abierta:

1. Pulsa `Cmd/Ctrl + F`. Aparece una barra de búsqueda.
2. Escribe lo que buscas. Se resaltan las coincidencias y verás el contador (`3/12`), o _"Sin resultados"_.
3. Navega entre coincidencias:
   - `Enter` o **↓**: siguiente
   - `Shift + Enter` o **↑**: anterior
4. Cierra con `Esc` o con **✕**.

La búsqueda funciona tanto en el árbol JSON (abre los nodos donde hay coincidencias) como en la vista de texto. Si hay demasiadas coincidencias, el contador muestra un tope con un `+`.

**No está disponible** en la vista previa HTML, en la lista de eventos SSE ni en respuestas binarias, porque no son texto plano.

![Búsqueda dentro de la respuesta](./img/03-respuestas/07-busqueda.png)

---

## Pestaña Headers

Una tabla con todos los headers de la respuesta. La pestaña muestra cuántos hay: **Headers (12)**. Puedes seleccionar y copiar cualquier valor.

![Pestaña Headers de la respuesta](./img/03-respuestas/08-headers.png)

---

## Pestañas Schema y Tests

Estas dos pestañas **solo aparecen cuando aplican**:

| Pestaña    | Aparece si…                                                              | Indicador                                                              |
| ---------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **Schema** | La petición viene de un OpenAPI y la respuesta se validó                 | `✓` válida · `✗ N` errores · `⚠` status no documentado · `–` sin schema |
| **Tests**  | La petición tiene aserciones                                             | `3/4` en verde si pasan todas, en rojo si falla alguna                 |

Cómo se configuran y qué comprueban está en las guías de _Validación contra el schema_ y _Tests, aserciones y extracción_.

---

## Pestaña Cambios

Compara la respuesta que acabas de recibir con **la última vez que enviaste esa misma petición** (mismo método y misma URL). Sirve para detectar cuándo una API cambió algo sin avisar.

1. Envía la petición.
2. Envíala de nuevo más tarde (o después de un cambio en el servidor).
3. Abre la pestaña **Cambios**.

Qué muestra:

- Un resumen: _"3 cambios respecto a la respuesta de las 14:32"_ en ámbar, o _"Sin cambios en el body respecto a la respuesta de las 14:32"_ en verde.
- Si cambió el status: `Status: 200 → 500`.
- Una línea por cambio, con su ruta:

| Símbolo | Significado       | Ejemplo                        |
| ------- | ----------------- | ------------------------------ |
| `+`     | Campo agregado    | `+ user.phone "555-0100"`      |
| `−`     | Campo eliminado   | `− user.nickname` (tachado)    |
| `~`     | Valor modificado  | `~ user.age 29 → 30`           |

La pestaña muestra una marca: `✓` si no hay cambios o el **número** de cambios.

![Pestaña Cambios con diferencias](./img/03-respuestas/09-cambios.png)

Mensajes:

- _"Aún no hay una respuesta anterior de esta petición para comparar. Envíala otra vez."_ → es la primera vez.
- _"Solo se comparan respuestas JSON completas (el historial guarda hasta 30 000 caracteres)."_ → la respuesta actual o la anterior no es JSON, o era demasiado larga para guardarse completa.

> La comparación usa el **Historial**. Si lo borras, se pierde la respuesta anterior.

---

## Pestaña Seguridad

Sonda revisa **cada respuesta exitosa** en busca de problemas evidentes de seguridad. La pestaña siempre está visible, con una marca: `✓` verde si no hay hallazgos, o un número (rojo si hay alguno de severidad **Alto**, ámbar si no).

Cada hallazgo tiene una etiqueta de severidad (**Alto**, **Medio** o **Bajo**), un título y una explicación.

| Qué revisa                                                              | Severidad            |
| ----------------------------------------------------------------------- | -------------------- |
| La petición va por **HTTP sin cifrar**                                  | Alto                 |
| CORS con `*` junto con **credenciales**                                 | Alto                 |
| El body **filtra un error interno** (stack trace de Node.js, Java, Python o .NET, o un error de SQL) | Alto |
| El JSON incluye un campo tipo **contraseña, token o secreto** con valor | Alto                 |
| **Cookies** sin `HttpOnly` o sin `Secure`                               | Medio si parece de sesión o sensible; Bajo si no |
| Falta `Strict-Transport-Security` (HSTS)                                | Bajo                 |
| CORS abierto a cualquier origen                                         | Bajo                 |
| Expone la tecnología (`X-Powered-By`) o la versión del servidor (`Server`) | Bajo              |
| Falta `X-Content-Type-Options: nosniff`                                 | Bajo                 |
| Página HTML sin `Content-Security-Policy` ni `X-Frame-Options`          | Bajo                 |
| **Cookies** sin `SameSite`                                              | Bajo                 |

Si no hay nada que reportar, verás _"No se detectaron problemas de seguridad evidentes en esta respuesta"_.

![Pestaña Seguridad con hallazgos](./img/03-respuestas/10-seguridad.png)

> Es una revisión **automática y básica** de lo que se ve en una sola respuesta. No reemplaza una auditoría de seguridad.

---

## Avisos sobre la respuesta

Encima de las pestañas pueden aparecer franjas de información:

- **Avisos en ámbar (⚠):** cosas que Sonda quiere que sepas. Por ejemplo: variables de auth vacías, reintentos usados, token OAuth descartado, Digest sin desafío compatible.
- **Variables extraídas:** una línea por cada extracción configurada, con `✓ {{variable}} = valor` o `✗ {{variable}} · motivo`. Si la variable es secreta, el valor se oculta (`••••••••`).
- **"↪ N redirecciones":** el recorrido completo si hubo redirecciones (ver la [guía de Peticiones HTTP](./01-peticiones-http.md#redirecciones)).

![Avisos y variables extraídas sobre la respuesta](./img/03-respuestas/11-avisos.png)

---

## Exportar

El botón **Exportar** (icono de descarga) abre un menú:

| Opción                              | Qué hace                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Body (.ext)**                     | Guarda el body con la extensión adecuada al tipo de contenido (`.json`, `.xml`, `.html`, `.txt`, o la del binario) |
| **Respuesta completa (.json)**      | Guarda un JSON con la petición, el status, los headers, los tiempos y el body. El archivo termina en `-completa.json` |
| **Copiar como tipos TypeScript**    | Copia al portapapeles interfaces TypeScript generadas a partir del JSON. Solo aparece si el body es un JSON objeto o lista |

Sonda propone un nombre de archivo a partir del método y la ruta de la URL.

![Menú Exportar](./img/03-respuestas/12-exportar.png)

---

## Límites de tamaño

| Caso                                  | Límite    | Qué pasa al superarlo                                                              |
| ------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| Respuesta completa                    | 100 MB    | Se descarta con el error _"La respuesta supera los 100 MB y se descartó…"_         |
| Respuesta binaria (para ver o bajar)  | 20 MB     | Se muestra el tipo y el tamaño, pero no se puede visualizar ni descargar           |
| Stream SSE                            | 20 MB     | Se corta y se indica _"Se cortó al llegar al límite de 20 MB."_                    |
| Comparación en **Cambios**            | 30 000 caracteres (lo que guarda el historial) | Se avisa que no se puede comparar         |

---

## Qué hacer cuando…

| Situación                                                          | Qué hacer                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Quiero ver solo un campo de un JSON enorme                         | Usa el **filtro** del Body (`data.items[*].id`)                                            |
| Quiero la ruta de un campo para una aserción                       | Haz clic en su clave en el árbol y pega la ruta                                            |
| Quiero saber si la API cambió desde ayer                           | Revisa la pestaña **Cambios**                                                              |
| La respuesta tarda mucho                                           | Pasa el cursor sobre el tiempo: ¿es DNS, conexión o el servidor?                           |
| Quiero llevarme la respuesta                                       | **Exportar → Body** o **Respuesta completa**                                               |
| Necesito los tipos TypeScript de la respuesta                      | **Exportar → Copiar como tipos TypeScript**                                                |
| La respuesta es HTML y quiero ver cómo se ve                       | Pulsa **Vista previa**                                                                     |

---

← [Volver al índice de funcionalidades](./README.md)