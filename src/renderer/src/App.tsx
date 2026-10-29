import { useEffect } from 'react'
import { RequestBar } from './components/RequestBar'
import { RequestPanel } from './components/RequestPanel'
import { ResponsePanel } from './components/ResponsePanel'
import { useRequestStore } from './store/useRequestStore'

function App(): React.JSX.Element {
  const send = useRequestStore((s) => s.send)

  // Cmd/Ctrl + Enter para enviar desde cualquier lugar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [send])

  return (
    <div className="flex h-full flex-col bg-zinc-900 text-zinc-200">
      <header className="flex h-10 items-center border-b border-zinc-800 px-4">
        <h1 className="text-sm font-bold tracking-wide text-blue-400">Sonda</h1>
      </header>

      <RequestBar />

      <main className="flex min-h-0 flex-1 flex-col">
        <section className="flex min-h-0 flex-1 flex-col border-b border-zinc-800">
          <RequestPanel />
        </section>
        <section className="flex min-h-0 flex-[1.4] flex-col">
          <ResponsePanel />
        </section>
      </main>
    </div>
  )
}

export default App