/** Arma el JSON del webhook según el servicio (Discord usa `content`; Slack y la mayoría usan `text`) */
export function buildWebhookPayload(
  url: string,
  note: { title: string; body: string }
): Record<string, unknown> {
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    /* URL inválida: se usa el formato genérico */
  }

  if (host.endsWith('discord.com') || host.endsWith('discordapp.com')) {
    return { content: `**${note.title}**\n${note.body}` }
  }
  return { text: `*${note.title}*\n${note.body}`, title: note.title, body: note.body }
}
