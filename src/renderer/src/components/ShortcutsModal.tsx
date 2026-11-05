import { useMemo, useState } from 'react'
import { SHORTCUT_GROUPS, formatKeys } from '../../../shared/shortcuts'
import { Modal } from './Modal'

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)

export function ShortcutsModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return SHORTCUT_GROUPS
    return SHORTCUT_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((i) =>
        `${i.label} ${formatKeys(i.keys, isMac)}`.toLowerCase().includes(q)
      )
    })).filter((g) => g.items.length > 0)
  }, [query])

  return (
    <Modal title="Atajos de teclado" onClose={onClose} wide>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar un atajo…"
        spellCheck={false}
        className="mb-3 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-blue-500"
      />

      <div className="max-h-[60vh] overflow-auto pr-1">
        {groups.length === 0 && (
          <p className="py-6 text-center text-xs text-zinc-500">Ningún atajo coincide.</p>
        )}

        {groups.map((group) => (
          <section key={group.title} className="mb-4">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {group.title}
            </h3>
            <ul>
              {group.items.map((item) => (
                <li
                  key={`${item.keys}|${item.label}`}
                  className="flex items-center justify-between gap-4 border-t border-zinc-800 py-1.5 text-xs first:border-t-0"
                >
                  <span className="text-zinc-300">{item.label}</span>
                  <kbd className="shrink-0 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200">
                    {formatKeys(item.keys, isMac)}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-2 flex justify-end">
        <button
          onClick={onClose}
          className="rounded px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Cerrar
        </button>
      </div>
    </Modal>
  )
}
