const STATUS_INFO: Record<number, string> = {
  200: 'OK: la petición se procesó correctamente.',
  201: 'Created: se creó el recurso. Suele traer su URL en el header Location.',
  202: 'Accepted: la petición se aceptó pero se procesa de forma asíncrona.',
  204: 'No Content: salió bien y no hay body que devolver.',
  301: 'Moved Permanently: el recurso cambió de URL para siempre. Revisa el header Location.',
  302: 'Found: redirección temporal. Revisa el header Location.',
  304: 'Not Modified: el recurso no cambió desde tu última consulta (caché).',
  307: 'Temporary Redirect: redirección temporal que conserva el método.',
  308: 'Permanent Redirect: redirección permanente que conserva el método.',
  400: 'Bad Request: el servidor no entendió la petición. Revisa el body, los params y el JSON.',
  401: 'Unauthorized: faltan credenciales o no son válidas. Revisa la pestaña Auth o si el token caducó.',
  403: 'Forbidden: estás autenticado pero no tienes permiso para este recurso.',
  404: 'Not Found: la ruta o el recurso no existe. Revisa la URL y los ids.',
  405: 'Method Not Allowed: esa ruta no acepta este método. Mira el header Allow.',
  406: 'Not Acceptable: el servidor no puede responder en el formato de tu header Accept.',
  408: 'Request Timeout: el servidor esperó demasiado la petición.',
  409: 'Conflict: choca con el estado actual del recurso (por ejemplo, un duplicado).',
  410: 'Gone: el recurso existió pero se eliminó de forma permanente.',
  413: 'Payload Too Large: el body que enviaste es demasiado grande.',
  415: 'Unsupported Media Type: revisa tu header Content-Type.',
  422: 'Unprocessable Entity: el formato es válido pero los datos no pasan las reglas de validación.',
  429: 'Too Many Requests: superaste el límite de uso. Revisa el header Retry-After.',
  500: 'Internal Server Error: falló algo dentro del servidor. Normalmente no es culpa de tu petición.',
  501: 'Not Implemented: el servidor no soporta esta funcionalidad.',
  502: 'Bad Gateway: un servidor intermedio recibió una respuesta inválida.',
  503: 'Service Unavailable: el servicio está caído o saturado. Reintenta más tarde.',
  504: 'Gateway Timeout: un servidor intermedio no recibió respuesta a tiempo.'
}

const CLASS_INFO: Record<number, string> = {
  1: 'Respuesta informativa.',
  2: 'Éxito.',
  3: 'Redirección: el recurso está en otra ubicación.',
  4: 'Error del cliente: algo de la petición es incorrecto.',
  5: 'Error del servidor: la petición parece válida pero el servidor falló.'
}

/** Explicación corta de un código de estado HTTP, para mostrarla como tooltip */
export function describeStatus(status: number): string {
  return STATUS_INFO[status] ?? CLASS_INFO[Math.floor(status / 100)] ?? `Código ${status}`
}
