import { useRequestStore } from '../store/useRequestStore'
import { SCRIPT_SNIPPETS, appendSnippet } from '../../../shared/scriptSnippets'

const editor =
  'min-h-32 w-full flex-1 resize-y rounded-md border border-zinc-700 bg-zinc-800 p-2 font-mono text-xs leading-relaxed outline-none placeholder:text-zinc-500 focus:border-blue-500'

function Section({
  title,
  hint,
  value,
  onChange,
  placeholder,
  phase
}: {
  title: string
  hint: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  phase: 'pre' | 'post'
}): React.JSX.Element {
  const snippets = SCRIPT_SNIPPETS.filter((s) => s.phase === phase)

  return (
    <div className="flex flex-1 flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-zinc-300">{title}</span>
        <span className="text-[11px] text-zinc-500">{hint}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {snippets.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(appendSnippet(value, s.code))}
            className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
          >
            + {s.label}
          </button>
        ))}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={editor}
      />
    </div>
  )
}

export function ScriptsPanel(): React.JSX.Element {
  const preScript = useRequestStore((s) => s.preScript)
  const postScript = useRequestStore((s) => s.postScript)
  const setPreScript = useRequestStore((s) => s.setPreScript)
  const setPostScript = useRequestStore((s) => s.setPostScript)

  return (
    <div className="flex min-h-full flex-col gap-3">
      <Section
        title="Pre-script"
        hint="Antes de enviar"
        phase="pre"
        value={preScript}
        onChange={setPreScript}
        placeholder={"sonda.request.headers['X-Request-Id'] = String(Date.now())"}
      />
      <Section
        title="Post-script"
        hint="Al recibir la respuesta"
        phase="post"
        value={postScript}
        onChange={setPostScript}
        placeholder={
          "const data = sonda.response.json()\nsonda.test('status 200', () => sonda.expect(sonda.response.status).toBe(200))\nsonda.env.set('token', data.token)"
        }
      />

      <details className="rounded-md border border-zinc-800 p-2 text-[11px] leading-relaxed text-zinc-400">
        <summary className="cursor-pointer text-zinc-300">Referencia de la API</summary>
        <div className="mt-2 space-y-1 font-mono">
          <p>sonda.env.get(&quot;nombre&quot;) · sonda.env.set(&quot;nombre&quot;, valor)</p>
          <p>
            Pre: sonda.request.method / .url / .body / .headers[&quot;Nombre&quot;] (editables; la
            URL conserva sus {'{{variables}}'})
          </p>
          <p>
            Post: sonda.response.status / .ok / .statusText / .timeMs / .headers /
            .header(&quot;nombre&quot;) / .text / .json()
          </p>
          <p>
            sonda.test(&quot;nombre&quot;, () =&gt; &#123; ... &#125;) · sonda.assert(cond, msg)
          </p>
          <p>
            sonda.expect(x).toBe / toEqual / toContain / toMatch / toBeGreaterThan / toBeLessThan /
            toBeGreaterThanOrEqual / toBeLessThanOrEqual / toBeBetween / toBeTruthy / toBeFalsy /
            toBeNull / toBeType(&quot;string&quot;) / toHaveLength / toBeOneOf([...]) /
            toMatchObject(&#123;...&#125;) / toHaveProperty (con .not)
          </p>
          <p>
            sonda.uuid() · sonda.now() · sonda.base64.encode(&quot;texto&quot;) /
            .decode(&quot;...&quot;) · sonda.jwt.decode(token) → &#123; header, payload &#125;
          </p>
          <p>
            sonda.crypto.sha256(texto, &quot;hex&quot; | &quot;base64&quot;) ·
            sonda.crypto.hmacSha256(clave, texto, &quot;hex&quot; | &quot;base64&quot;)
          </p>
          <p>console.log(...) aparece como aviso en la respuesta</p>
        </div>
        <p className="mt-2 font-sans">
          Los scripts son síncronos (sin await, fetch ni require) y se detienen a los 2 segundos. El
          body solo se puede cambiar en modo texto.
        </p>
      </details>
    </div>
  )
}