# 01 · Peticiones HTTP

Todo lo necesario para armar, enviar y controlar una petición en Sonda: método, URL, parámetros, headers, body, GraphQL, streams (SSE), cancelación, reintentos, redirecciones y cookies.

![Vista general de una petición en Sonda](./img/01-peticiones-http/00-vista-general.png)

## Contenido

- [La barra de petición](#la-barra-de-petición)
- [Enviar una petición](#enviar-una-petición)
- [Pestañas de la petición](#pestañas-de-la-petición)
- [Params](#params)
- [Headers](#headers)
- [Body](#body)
  - [Texto / JSON](#texto--json)
  - [x-www-form-urlencoded](#x-www-form-urlencoded)
  - [form-data (con archivos)](#form-data-con-archivos)
  - [Content-Type automático](#content-type-automático)
- [Asistente GraphQL](#asistente-graphql)
- [Server-Sent Events (SSE)](#server-sent-events-sse)
- [Cancelar una petición](#cancelar-una-petición)
- [Reintentos automáticos](#reintentos-automáticos)
- [Redirecciones](#redirecciones)
- [Cookies](#cookies)
- [Ajustes que afectan al envío](#ajustes-que-afectan-al-envío)
- [Errores y avisos frecuentes](#errores-y-avisos-frecuentes)
- [Atajos](#atajos)

---

## La barra de petición

En la parte superior de cada pestaña hay tres elementos:

1. **Selector de método:** `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` y `OPTIONS`. Cada método tiene su propio color.
2. **Barra de URL:** acepta direcciones completas y variables `{{variable}}`.
3. **Botón Enviar** (o **Cancelar** mientras la petición está en curso).

![Barra de petición con método, URL y botón Enviar](./img/01-peticiones-http/01-barra-peticion.png)

Reglas de la URL:

- Debe empezar con `http://` o `https://`. Cualquier otro protocolo se rechaza con el mensaje _"Solo se permiten URLs http y https"_.
- Si escribes algo que no es una URL válida, verás _"URL inválida. Incluye http:// o https://"_.
- Las variables se resaltan en **azul** si están definidas en el entorno activo y en **ámbar** si no. Si falta alguna, Sonda **no envía** la petición y te dice cuáles faltan.
- El botón **Enviar** está deshabilitado mientras la URL esté vacía.

### Pegar un comando cURL

Si copias un comando `curl` (por ejemplo, desde la documentación de una API o desde las DevTools del navegador) y lo pegas en la barra de URL, Sonda **no lo escribe como texto**: lo interpreta y rellena método, URL, headers y body.

1. Copia el comando completo.
2. Haz clic en la barra de URL.
3. Pega (`Cmd/Ctrl + V`).
4. Aparece el aviso **"cURL importado ✓"**. Si Sonda no pudo interpretar alguna parte, el aviso dice **"cURL importado (con avisos)"**.

![Aviso "cURL importado" después de pegar un comando](./img/01-peticiones-http/02-pegar-curl.png)

> Si lo pegado no se puede interpretar como cURL, se pega como texto normal.

---

## Enviar una petición

1. Elige el **método**.
2. Escribe la **URL**.
3. (Opcional) Configura params, headers, auth y body en las pestañas.
4. Pulsa **Enviar**, o usa `Enter` dentro de la barra de URL, o `Cmd/Ctrl + Enter` desde cualquier parte.

Cuando la respuesta llega, el panel de respuesta muestra estado, tiempo, TTFB, tamaño, body y headers (ver la guía de _Respuestas_).

![Petición enviada con su respuesta](./img/01-peticiones-http/03-respuesta.png)

---

## Pestañas de la petición

Debajo de la barra hay una fila de pestañas:

| Pestaña      | Para qué sirve                                                           |
| ------------ | ------------------------------------------------------------------------ |
| **Params**   | Parámetros de query, sincronizados con la URL                            |
| **Auth**     | Autenticación de la petición (ver la guía de _Autenticación_)            |
| **Headers**  | Headers HTTP, con casilla para activar o desactivar cada uno             |
| **Body**     | Cuerpo de la petición                                                    |
| **Tests**    | Aserciones sobre la respuesta                                            |
| **Scripts**  | Scripts previos y posteriores al envío                                   |
| **Extraer**  | Guardar valores de la respuesta en variables del entorno                 |
| **Notas**    | Descripción de la petición                                               |

Algunas pestañas muestran un indicador cuando tienen contenido: un número azul (Params, Headers, Tests, Extraer), un punto azul (Auth, Scripts, Notas) o, en Body, una marca verde o un número rojo cuando la petición viene de un OpenAPI y se valida contra su schema.

![Fila de pestañas con indicadores](./img/01-peticiones-http/04-pestanas.png)

---

## Params

La pestaña **Params** es una tabla de parámetros de query que está **sincronizada con la URL en ambos sentidos**:

- Si escribes `?page=2&limit=10` en la URL, aparecen las filas `page` y `limit` en la tabla.
- Si editas una fila de la tabla, la URL se reescribe sola.

Cómo usarla:

1. Abre la pestaña **Params**.
2. Escribe el nombre en **Parámetro** y su valor en **Valor**.
3. Al escribir en la última fila, Sonda agrega automáticamente otra fila vacía.
4. Para quitar un parámetro, pulsa la **✕** de su fila.

![Tabla de Params sincronizada con la URL](./img/01-peticiones-http/05-params.png)

> Los params no tienen casilla de activar/desactivar porque viven en la URL: para desactivar uno, bórralo.

---

## Headers

1. Abre la pestaña **Headers**.
2. Escribe el nombre (por ejemplo `Accept`) y el valor (`application/json`).
3. Usa la **casilla** de cada fila para activar o desactivar el header sin borrarlo.
4. Pulsa **✕** para eliminar la fila.

Puedes usar variables en nombre y valor: `Authorization` → `Bearer {{token}}`.

![Pestaña Headers con filas activas y una desactivada](./img/01-peticiones-http/06-headers.png)

Notas:

- Si la colección o la carpeta definen **headers heredados**, se suman a los de la petición; los de la petición tienen prioridad si coinciden.
- Un header escrito a mano con el mismo nombre que el que genera la pestaña **Auth** tiene prioridad sobre el de Auth.

---

## Body

Abre la pestaña **Body**. Arriba eliges el tipo:

| Tipo                       | Cuándo usarlo                                         |
| -------------------------- | ----------------------------------------------------- |
| **Texto / JSON**           | JSON, texto plano, XML, GraphQL                       |
| **x-www-form-urlencoded**  | Formularios clásicos (`campo=valor&campo2=valor2`)    |
| **form-data**              | Formularios con archivos (multipart)                  |

> Con `GET` y `HEAD` el body no se envía. Si abres la pestaña con uno de esos métodos verás el aviso _"GET no envía body. Cambia el método para usarlo."_

![Selector de tipo de body](./img/01-peticiones-http/07-body-tipos.png)

### Texto / JSON

1. Elige **Texto / JSON**.
2. Escribe el body en el editor.
3. Pulsa **Formatear** para dar formato al JSON (el botón está deshabilitado si el editor está vacío; si el texto no es JSON, no se toca).

Ayudas del editor:

- **Validación en vivo:** si el body parece JSON y tiene un error de sintaxis, el encabezado del editor muestra _"JSON inválido: …"_ en rojo. Si el body usa `{{variables}}`, no se marca error, porque aún no es JSON hasta que se resuelven.
- **Sangría y cierre automático** de `{`, `[` y `"` mientras escribes.
- **Variables:** `{{variable}}` se resalta y se autocompleta.
- **Botón GraphQL:** abre el [Asistente GraphQL](#asistente-graphql).

![Editor JSON con botón Formatear y error de sintaxis](./img/01-peticiones-http/08-body-json.png)

**Validación contra el schema (peticiones importadas de OpenAPI):** el body se comprueba contra el `requestBody` de la spec. La pestaña **Body** muestra una marca verde si es válido o un número rojo con los errores. Es solo un aviso: la petición **se envía igual**, para que puedas probar cómo reacciona la API a un body incorrecto.

### x-www-form-urlencoded

1. Elige **x-www-form-urlencoded**.
2. Escribe el nombre en **Campo** y el contenido en **Valor**.
3. Usa la casilla de cada fila para activarla o desactivarla, y **✕** para borrarla.

### form-data (con archivos)

1. Elige **form-data**.
2. En cada fila, el selector te deja elegir **Texto** o **Archivo**.
3. Con **Archivo**, pulsa **Elegir archivo…** y selecciona el archivo en tu computadora. Se muestra solo el nombre del archivo; el cursor encima muestra la ruta completa.
4. Cambiar el tipo de una fila **vacía su valor** (un texto no es una ruta de archivo).

![Body form-data con un campo de texto y un archivo](./img/01-peticiones-http/09-form-data.png)

Límites y errores:

- Cada archivo puede pesar hasta **100 MB**.
- Si una fila de tipo Archivo no tiene archivo, el envío falla con _"El campo … no tiene archivo seleccionado"_.
- Si el archivo ya no existe en esa ruta: _"No se encontró el archivo del campo …"_.
- Si pasa de 100 MB: _"El archivo del campo … supera los 100 MB"_.

> Al guardar una petición con archivos, se guarda la **ruta**, no el contenido. Si compartes la colección, cada persona debe volver a elegir sus archivos.

### Content-Type automático

Sonda completa el `Content-Type` cuando tú no lo defines:

| Body                                          | Content-Type que agrega                         |
| --------------------------------------------- | ----------------------------------------------- |
| Texto que parece JSON (empieza con `{` o `[`) | `application/json`                              |
| x-www-form-urlencoded                         | `application/x-www-form-urlencoded`             |
| form-data                                     | `multipart/form-data` con su boundary (siempre) |

Si ya escribiste un `Content-Type` en **Headers**, Sonda respeta el tuyo.

---

## Asistente GraphQL

Sirve para armar el body de una petición GraphQL (query + variables) sin escribir el JSON a mano, e incluso explorar las operaciones del servidor.

1. Escribe la **URL del endpoint** GraphQL en la barra superior (y, si hace falta, su auth o headers).
2. Abre **Body → Texto / JSON → GraphQL**. Se abre el **Asistente GraphQL**.
3. (Opcional) Pulsa **Cargar operaciones del servidor**. Sonda pide el schema por introspección usando la URL, los headers y la auth de la petición actual, y lista las queries y mutations disponibles.
4. Usa **Filtrar…** para buscar una operación y haz clic en ella: Sonda arma la **Query** y las **Variables (JSON)** de partida.
5. Edita la query y las variables a tu gusto.
6. Pulsa **Aplicar al body**.

![Asistente GraphQL con lista de operaciones](./img/01-peticiones-http/10-graphql.png)

Qué hace **Aplicar al body**:

- Escribe en el body un JSON `{ "query": …, "variables": … }`.
- Cambia el tipo de body a **Texto / JSON**.
- Si el método era `GET` o `HEAD`, lo cambia a `POST` (GraphQL viaja casi siempre por POST).

Errores comunes:

- _"Escribe primero la URL del endpoint GraphQL en la barra superior."_ → falta la URL.
- Si el servidor no permite introspección o devuelve otra cosa, el asistente muestra el error y puedes escribir la query a mano.
- _"El schema no expone queries ni mutations."_ → el schema está vacío.

---

## Server-Sent Events (SSE)

Si el servidor responde con `Content-Type: text/event-stream`, Sonda lo trata como un stream:

1. Envía la petición con **Enviar**.
2. Mientras el stream sigue abierto, el panel de respuesta muestra **"Recibiendo eventos…"** con el tamaño acumulado y el texto que va llegando **en vivo**.
3. Cuando termina, los datos se muestran como **una tarjeta por evento** (hasta 500 eventos). Con el botón **Ver texto / Ver eventos** alternas entre la lista de tarjetas y el texto crudo.

![Stream SSE en vivo y lista de eventos al terminar](./img/01-peticiones-http/11-sse.png)

Cómo termina un stream (Sonda lo indica junto a la respuesta):

| Motivo                  | Mensaje                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| El servidor lo cerró    | _El servidor cerró el stream._                                         |
| Lo detuviste            | _Detuviste el stream: esto es lo recibido hasta ese momento._          |
| Tiempo límite           | _Se alcanzó el tiempo límite: esto es lo recibido hasta entonces._     |
| Límite de tamaño        | _Se cortó al llegar al límite de 20 MB._                               |
| Error de conexión       | _La conexión se interrumpió._                                          |

> Para detener un stream que no termina, usa el botón **Cancelar**: conservas todo lo recibido hasta ese momento.

---

## Cancelar una petición

Mientras una petición está en curso, el botón **Enviar** se convierte en un botón rojo **Cancelar** con un indicador giratorio.

1. Pulsa **Cancelar**.
2. La petición se aborta. Si estaba esperando para reintentar, no se vuelve a intentar.

Cada pestaña se cancela por separado: cancelar una no afecta a las demás.

---

## Reintentos automáticos

Sonda puede repetir una petición cuando falla por causas pasajeras.

**Cómo activarlo:** **Herramientas → Ajustes → Reintentos automáticos** (de 0 a 5; por defecto 0, es decir, desactivado).

| Ajuste               | Rango            | Por defecto |
| -------------------- | ---------------- | ----------- |
| Reintentos           | 0 a 5            | 0           |
| Espera base (ms)     | 100 a 10 000 ms  | 500 ms      |

Cuándo reintenta:

- **Métodos:** solo `GET`, `HEAD`, `OPTIONS`, `PUT` y `DELETE`. `POST` y `PATCH` **nunca** se reintentan, para no duplicar datos.
- **Causas:** errores de red, tiempo límite y respuestas `429`, `502`, `503` o `504`.
- **Espera:** si la respuesta trae `Retry-After`, se respeta (hasta un máximo de 10 s). Si no, la espera se **duplica** en cada intento (500 ms, 1 s, 2 s…), con tope de 10 s.

Cuando se usó algún reintento, el resultado muestra el aviso _"Se reintentó N veces antes de obtener esta respuesta."_

![Ajustes con reintentos automáticos](./img/01-peticiones-http/12-ajustes-reintentos.png)

---

## Redirecciones

Por defecto Sonda **sigue las redirecciones** (`301`, `302`, `303`, `307`, `308`) y te muestra el recorrido completo.

Qué verás en la respuesta: una franja plegable **"↪ N redirecciones"** con la URL final. Al desplegarla aparece cada salto:

- el status del salto (por ejemplo `302`),
- la URL que se pidió,
- el tiempo que tardó,
- cuántas cookies guardó esa respuesta,
- y, en la línea de abajo, a dónde mandó el servidor (`→ location`).

![Cadena de redirecciones desplegada](./img/01-peticiones-http/13-redirecciones.png)

Detalles:

- Las **cookies** se conservan en cada salto.
- Al cambiar de sitio, se quitan las credenciales, con las mismas reglas que un navegador.

**Para ver el `3xx` en bruto** (sin seguirlo): **Ajustes → desmarca "Seguir redirecciones automáticamente"**. Sonda devolverá la respuesta de redirección tal cual, con su header `Location`.

---

## Cookies

Sonda mantiene un **cookie jar** compartido entre todas las peticiones: las cookies que el servidor manda con `Set-Cookie` se guardan y se envían solas en las siguientes peticiones al mismo dominio y ruta (respetando `Secure`, `Path`, `Domain` y caducidad).

**Ver y borrar cookies:** **Herramientas → Cookies**.

1. Se abre una tabla con **Dominio**, **Nombre**, **Valor**, **Ruta** y **Expira**.
2. Las cookies marcadas como `Secure` muestran un aviso: _"Solo se envía por https"_.
3. Pulsa **Borrar cookie** en una fila para quitar esa cookie.
4. Usa el botón para borrarlas todas (pide confirmación: _"¿Borrar todas las cookies?"_).
5. Si no hay ninguna, verás _"No hay cookies guardadas."_

![Modal de cookies](./img/01-peticiones-http/14-cookies.png)

Persistencia: las cookies **con fecha de caducidad** se guardan cifradas con el keychain del sistema y sobreviven al cerrar la app; las **cookies de sesión** se descartan al cerrarla.

---

## Ajustes que afectan al envío

Se abren desde **Herramientas → Ajustes**.

| Ajuste                                     | Qué controla                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| **Tiempo límite (segundos)**               | De 1 a 600 s. Si el servidor no responde a tiempo, la petición falla. Por defecto, 30 s                  |
| **Seguir redirecciones automáticamente**   | Activado por defecto                                                                                      |
| **Certificados SSL**                       | _Automático_ (tolera certificados inválidos solo en `localhost`), _Siempre verificar_ o _Ignorar errores_ |
| **Proxy**                                  | URL `http://` o `https://`. Vacío = sin proxy. Las peticiones a `localhost` no lo usan                    |
| **Reintentos automáticos / Espera base**   | Ver [Reintentos automáticos](#reintentos-automáticos)                                                     |

---

## Errores y avisos frecuentes

| Mensaje                                                      | Qué significa y qué hacer                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| _Variables sin definir: {{x}}. Defínelas en el entorno "…"_  | La petición usa variables que no existen. Defínelas en el entorno activo                    |
| _Selecciona o crea un entorno en la cabecera._               | Usas variables pero no hay entorno activo                                                   |
| _URL inválida. Incluye http:// o https://_                   | Falta el protocolo o la URL está mal escrita                                                |
| _Solo se permiten URLs http y https_                         | Otros protocolos (`ftp://`, `file://`, …) no están soportados                               |
| _JSON inválido: …_                                           | El body parece JSON pero tiene un error de sintaxis (se envía igual si lo dejas así)        |
| _El campo "…" no tiene archivo seleccionado_                 | Una fila `form-data` de tipo Archivo está vacía                                             |
| _La respuesta supera los 100 MB y se descartó_               | Sonda limita las respuestas a 100 MB para no agotar la memoria                              |
| _El body enviado no cumple el schema de la spec (N errores)_ | Aviso de validación; la petición se envía de todos modos                                    |

---

## Atajos

| Atajo                      | Acción                                  |
| -------------------------- | --------------------------------------- |
| `Enter` en la barra de URL | Enviar la petición                      |
| `Cmd/Ctrl + Enter`         | Enviar la petición                      |
| `Cmd/Ctrl + T`             | Abrir una pestaña nueva                 |
| `Cmd/Ctrl + S`             | Guardar la petición                     |

---

← [Volver al índice de funcionalidades](./README.md)