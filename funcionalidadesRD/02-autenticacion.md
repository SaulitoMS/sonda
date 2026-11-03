# 02 · Autenticación

Cómo decirle a Sonda quién eres cuando una API lo exige: **Bearer**, **Basic**, **Digest**, **API Key** y **OAuth 2.0**, más la **herencia** para definir la autenticación una sola vez en la colección o en una carpeta.

![Pestaña Auth de una petición](./img/02-autenticacion/00-vista-general.png)

## Contenido

- [Dónde se configura](#dónde-se-configura)
- [Tipos de autenticación](#tipos-de-autenticación)
  - [Bearer Token](#bearer-token)
  - [Basic Auth](#basic-auth)
  - [Digest Auth](#digest-auth)
  - [API Key](#api-key)
  - [OAuth 2.0](#oauth-20)
- [Herencia: definirla una vez](#herencia-definirla-una-vez)
- [Prioridad entre auth y headers manuales](#prioridad-entre-auth-y-headers-manuales)
- [Variables y secretos](#variables-y-secretos)
- [Avisos y errores frecuentes](#avisos-y-errores-frecuentes)
- [Qué no cubre todavía](#qué-no-cubre-todavía)

---

## Dónde se configura

Hay tres lugares, de más específico a más general:

| Nivel         | Cómo llegar                                                                          | Alcance                              |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------------------ |
| **Petición**  | Pestaña **Auth** de la petición                                                      | Solo esa petición                    |
| **Carpeta**   | Candado 🔒 de la carpeta en la barra lateral (**"Autenticación de la carpeta"**)     | Todas las peticiones de la carpeta   |
| **Colección** | Candado 🔒 de la colección en la barra lateral (**"Autenticación de la colección"**) | Todas las peticiones de la colección |

El candado aparece al pasar el cursor sobre la fila. Si la colección o la carpeta **ya tienen auth configurada**, el candado se ve siempre, en azul.

![Candado de autenticación en la barra lateral](./img/02-autenticacion/01-candado-sidebar.png)

En la pestaña **Auth** de una petición, el selector **Tipo** ofrece:

| Opción                                | Qué hace                                                            |
| ------------------------------------- | ------------------------------------------------------------------- |
| **Heredar de la carpeta / colección** | Usa la auth definida arriba (es lo que traen las peticiones nuevas) |
| **Sin autenticación**                 | No envía auth, aunque la carpeta o la colección tengan              |
| **Bearer Token**                      | Token en el header `Authorization`                                  |
| **Basic Auth**                        | Usuario y contraseña                                                |
| **Digest Auth**                       | Usuario y contraseña con desafío del servidor                       |
| **API Key**                           | Clave en un header o en la query                                    |
| **OAuth 2.0**                         | Token pedido automáticamente (client credentials o password)        |

La pestaña **Auth** muestra un **punto azul** cuando la petición tiene un tipo de auth propio (distinto de _Heredar_ y _Sin autenticación_).

![Selector de tipo de autenticación](./img/02-autenticacion/02-selector-tipo.png)

---

## Tipos de autenticación

### Bearer Token

El más común para APIs modernas: envía `Authorization: Bearer <token>`.

1. En **Auth**, elige **Bearer Token**.
2. En **Token**, escribe el token o una variable: `{{token}}`.
3. Envía la petición.

Detalles:

- Si pegas el valor completo (`Bearer abc123`), Sonda **no duplica** la palabra `Bearer`.
- Si el token está vacío, no se envía el header y verás el aviso _"Auth Bearer: el token está vacío, no se envió el header Authorization."_

#### Inspector de JWT

Si el token es un JWT, aparece debajo un recuadro **JWT** con:

- el **algoritmo** (por ejemplo `HS256`),
- la **expiración en vivo**: _"Expira en 2 horas"_ en verde, o _"Expiró hace 3 días"_ en rojo (se actualiza cada 30 segundos),
- _"Sin fecha de expiración"_ si el token no trae `exp`,
- el aviso _"Aún no es válido (nbf)"_ si todavía no llegó su fecha de inicio,
- los claims `sub`, `iss`, `aud` y `scope`, si existen,
- el botón **Ver payload / Ocultar payload** para ver el JSON completo.

Si el token es una variable (`{{token}}`), el inspector la resuelve con el entorno activo.

![Inspector de JWT bajo el token Bearer](./img/02-autenticacion/03-jwt.png)

> El inspector **solo decodifica** el token: no verifica la firma.

### Basic Auth

Envía `Authorization: Basic <usuario:contraseña en base64>`.

1. Elige **Basic Auth**.
2. Escribe **Usuario** y **Contraseña** (admiten variables como `{{usuario}}`).
3. Envía.

Si ambos campos están vacíos, no se envía el header y verás el aviso correspondiente.

### Digest Auth

Para servidores que no aceptan la contraseña directa y responden con un **desafío** (routers, cámaras IP, APIs legacy). Usa los mismos campos que Basic.

1. Elige **Digest Auth**.
2. Escribe **Usuario** y **Contraseña**.
3. Envía.

Qué pasa por dentro:

1. Sonda envía la petición **sin** credenciales.
2. El servidor responde `401` con un header `WWW-Authenticate: Digest …`.
3. Sonda calcula la respuesta firmada y **reenvía la petición sola**.
4. Ves el resultado final en el panel de respuesta.

Soporta **MD5**, **MD5-sess**, **SHA-256** y **SHA-256-sess** con `qop=auth` (o sin `qop`).

Avisos posibles:

- _"Auth Digest: el servidor respondió 401 sin un desafío Digest compatible (MD5 o SHA-256 con qop=auth)."_ → el servidor no ofreció un desafío que Sonda pueda resolver (por ejemplo, solo `auth-int`).
- _"Auth Digest: no se pudo firmar la petición (revisa la URL)."_

> Si la petición ya tiene un header `Authorization` escrito a mano, Sonda **no** aplica Digest: el tuyo manda.

### API Key

Para APIs que piden una clave en un header o en la URL.

1. Elige **API Key**.
2. **Nombre:** cómo se llama el campo (por ejemplo `X-API-Key`).
3. **Valor:** la clave o una variable (`{{apiKey}}`).
4. **Agregar a:** **Header** o **Query param**.
5. Envía.

Con **Query param**, Sonda agrega `?nombre=valor` a la URL al enviar (sin tocar lo que ves en la barra).

Avisos: si falta el nombre o el valor, la clave no se agrega y Sonda lo indica.

### OAuth 2.0

Sonda pide el **token** por ti y lo manda como `Authorization: Bearer …`. Soporta dos flujos:

| Flujo                  | Cuándo usarlo                                                            |
| ---------------------- | ------------------------------------------------------------------------ |
| **Client Credentials** | Comunicación entre servicios: solo necesitas Client ID y Secret          |
| **Password**           | El servidor acepta usuario y contraseña de una persona para dar un token |

Configuración:

1. Elige **OAuth 2.0**.
2. En **Grant**, elige **Client Credentials** o **Password**.
3. Completa:

| Campo                        | Para qué                                                  |
| ---------------------------- | --------------------------------------------------------- |
| **URL del token**            | Endpoint que entrega el token (`{{baseUrl}}/oauth/token`) |
| **Client ID**                | Identificador de tu aplicación                            |
| **Client Secret**            | Secreto de tu aplicación                                  |
| **Usuario** y **Contraseña** | Solo con el grant **Password**                            |
| **Scope**                    | Permisos pedidos, separados por espacio (opcional)        |

4. Envía la petición.

![Configuración de OAuth 2.0 con grant Password](./img/02-autenticacion/04-oauth.png)

Cómo funciona:

- Al enviar, Sonda hace un `POST` a la **URL del token** (`application/x-www-form-urlencoded`), con el Client ID y Secret como Basic Auth, y `grant_type` según el flujo elegido.
- El token recibido se **guarda en memoria** y se reutiliza mientras siga vigente: no se vuelve a pedir en cada envío.
- Si el servidor no dice cuánto dura (`expires_in`), se asume **1 hora**. Se descartan 30 segundos antes de caducar, para no usar un token que vence en pleno viaje.
- Si el servidor responde `401` a un token que venía de la memoria, Sonda lo descarta y avisa: _"El token OAuth guardado fue rechazado (401). Se descartó: vuelve a enviar."_ Al reenviar, pide uno nuevo.
- Al cerrar la app, los tokens se pierden (nunca se guardan en disco).

Errores comunes:

| Mensaje                                                 | Causa                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| _OAuth 2.0: falta la URL del token._                    | El campo está vacío                                                   |
| _OAuth 2.0: falta el Client ID._                        | El campo está vacío                                                   |
| _OAuth 2.0: falta el usuario._                          | Con grant Password, no escribiste usuario                             |
| _OAuth 2.0: no se pudo pedir el token (…)_              | Error de red al llegar a la URL del token                             |
| _OAuth 2.0: el servidor respondió 400 · invalid_client_ | El servidor rechazó las credenciales (se muestra su detalle si lo da) |

---

## Herencia: definirla una vez

En lugar de repetir el token en cada petición, defínelo **una sola vez** y deja que las peticiones lo hereden.

### Configurar la auth de una colección o carpeta

1. En la barra lateral, pasa el cursor sobre la colección (o la carpeta).
2. Pulsa el **candado 🔒**.
3. Se abre **"Autenticación de «nombre»"** (o **"Autenticación de la carpeta «nombre»"**). Elige el tipo y completa los campos.
4. Pulsa **Guardar**.

![Modal de autenticación de una colección](./img/02-autenticacion/05-modal-coleccion.png)

Qué opciones hay en cada nivel:

- **Colección:** es la raíz, así que no puede "heredar". Por defecto es **Sin autenticación**.
- **Carpeta:** además de los tipos, ofrece **Heredar de la colección** (es el valor por defecto).
- **Petición:** ofrece **Heredar de la carpeta / colección** (es el valor por defecto de las peticiones nuevas).

### Cómo se decide qué auth se usa

Sonda toma **la primera que no sea "Heredar"**, yendo de lo más específico a lo más general:

```text
Petición  →  Carpeta  →  Colección
```

- **Sin autenticación** en cualquier nivel **corta la herencia**: no se envía auth, aunque un nivel superior tenga.
- Si ninguno define nada, la petición se envía sin auth.

### Ver de dónde viene la auth de una petición

En la pestaña **Auth**, con **Heredar** seleccionado, un recuadro te dice qué se está usando:

- _"Usando Bearer Token de la colección «Mi API»."_
- _"Usando Basic Auth de la carpeta «Admin»."_
- _"La carpeta y la colección no tienen autenticación: se envía sin auth."_
- _"Guarda la petición en una colección para heredar su autenticación."_ (si la petición aún no está guardada)

![Recuadro que indica de dónde se hereda la auth](./img/02-autenticacion/06-heredada.png)

### Ejemplo: una API con login

1. En la petición **Login**, usa la pestaña **Extraer** para guardar el token de la respuesta en la variable `token`.
2. En la **colección**, abre el candado y elige **Bearer Token** con valor `{{token}}`.
3. Todas las demás peticiones (que heredan) ya envían `Authorization: Bearer …` automáticamente.
4. En la petición **Login**, elige **Sin autenticación** para que no mande un token que todavía no existe.

---

## Prioridad entre auth y headers manuales

Si ya escribiste a mano un header con el mismo nombre que el que genera la auth (por ejemplo `Authorization` en la pestaña **Headers**), **el tuyo tiene prioridad** y el de la pestaña Auth no se agrega.

---

## Variables y secretos

- Todos los campos de autenticación aceptan `{{variables}}`.
- Recomendación: define tokens, contraseñas y secretos como variables del entorno y márcalas como **Secreto**. Así se cifran con el keychain del sistema y **el valor real no queda en el archivo de la petición**, que puede ir a Git.
- El **historial** oculta las credenciales escritas en texto plano (token, contraseñas, API keys, Client Secret) y conserva las referencias `{{variable}}`.
- Si una variable de auth no está definida, Sonda **no envía** la petición y te dice cuáles faltan.

---

## Avisos y errores frecuentes

| Mensaje                                                                 | Qué hacer                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| _Auth Bearer: el token está vacío…_                                     | Escribe el token o revisa que la variable tenga valor         |
| _Auth Basic: usuario y contraseña están vacíos…_                        | Completa los campos                                           |
| _Auth API Key: falta el nombre, no se agregó._                          | Escribe el nombre del header o parámetro                      |
| _Variables sin definir: {{token}}…_                                     | Define la variable en el entorno activo                       |
| _La carpeta y la colección no tienen autenticación: se envía sin auth._ | Configura la auth en la colección o carpeta, o en la petición |
| _El token OAuth guardado fue rechazado (401). Se descartó…_             | Vuelve a enviar: se pedirá un token nuevo                     |

---

## Qué no cubre todavía

- **OAuth 2.0** no soporta flujos que abren un navegador, como `authorization_code`.
- **Digest Auth** no soporta `qop=auth-int`, y todavía no se aplica en el **CLI** ni en la **exportación a cURL**.
- El inspector de **JWT** solo decodifica: no verifica la firma.

---

← [Volver al índice de funcionalidades](./README.md)
