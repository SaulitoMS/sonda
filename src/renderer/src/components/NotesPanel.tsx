import { useRequestStore } from '../store/useRequestStore'

export function NotesPanel(): React.JSX.Element {
  const description = useRequestStore((s) => s.description)
  const setDescription = useRequestStore((s) => s.setDescription)

  return (
    <div className="flex h-full flex-col gap-2">
      <p className="text-xs text-zinc-500">
        Documenta para qué sirve esta petición: qué espera, qué devuelve y los casos raros. Se
        guarda en el mismo archivo .json, así que viaja con Git. Las peticiones importadas de un
        Swagger traen aquí la descripción de la spec.
      </p>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Ej: Requiere haber hecho login antes. Devuelve 409 si el email ya existe."
        className="min-h-48 flex-1 resize-none rounded-md border border-zinc-700 bg-zinc-800 p-2 text-sm leading-relaxed outline-none placeholder:text-zinc-500 focus:border-blue-500"
      />
      <span className="self-end text-[10px] text-zinc-600">{description.length} caracteres</span>
    </div>
  )
}
