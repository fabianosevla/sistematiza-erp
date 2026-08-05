'use client'
// ESTE ARQUIVO VAI EM: components/ui/SeletorPeriodo.tsx
//
// ─── SELETOR DE PERÍODO — PADRÃO DO SISTEMA ─────────────────────────────────
//
// Um único controle de data que muda de formato conforme a periodicidade:
//
//   diária     → grade de dias do mês; escolhe um dia
//   semanal    → grade de dias; escolher qualquer dia marca a semana inteira
//                (segunda a domingo) e o fim é calculado sozinho
//   mensal     → 12 meses do ano
//   trimestral → 4 trimestres do ano
//   semestral  → 2 semestres do ano
//   anual      → 12 anos por página
//
// Por que um componente e não um <input type="date"> em cada tela: o input
// nativo só sabe escolher UM dia. Para "semana de 4 a 10 de agosto" ou "3º
// trimestre" ele obrigaria o operador a saber de cabeça onde o período começa
// — e cada tela resolveria isso de um jeito diferente.
//
// O estado externo é sempre uma ÂNCORA (uma data qualquer dentro do período).
// O intervalo é derivado dela por `intervaloDe`, nunca guardado — assim é
// impossível ficar com início e fim inconsistentes entre si.
//
// USO
//   const [ancora, setAncora] = useState(new Date())
//   const periodo = intervaloDe(periodicidade, ancora)   // { inicio, fim, rotulo }
//
//   <SeletorPeriodo periodicidade={periodicidade} valor={ancora} onChange={setAncora} />
import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

export type Periodicidade = 'diaria' | 'semanal' | 'mensal' | 'trimestral' | 'semestral' | 'anual' | 'customizado'

export const PERIODICIDADES: { valor: Periodicidade; rotulo: string }[] = [
  { valor: 'diaria',     rotulo: 'Diária' },
  { valor: 'semanal',    rotulo: 'Semanal' },
  { valor: 'mensal',     rotulo: 'Mensal' },
  { valor: 'trimestral', rotulo: 'Trimestral' },
  { valor: 'semestral',  rotulo: 'Semestral' },
  { valor: 'anual',      rotulo: 'Anual' },
  { valor: 'customizado', rotulo: 'Período customizável' },
]

const MESES       = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
const MESES_CURTO = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
const DIAS_CURTO  = ['D','S','T','Q','Q','S','S']

export function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Intervalo fechado do período que contém a âncora, mais um rótulo legível. */
export function intervaloDe(periodicidade: Periodicidade, ancora: Date, fimCustom?: Date | null) {
  const a = new Date(ancora.getFullYear(), ancora.getMonth(), ancora.getDate())
  let inicio: Date, fim: Date, rotulo: string

  // Customizado é o único modo em que o fim NÃO se deriva do início: quem
  // define os dois é o operador, clicando duas vezes no calendário.
  if (periodicidade === 'customizado') {
    const f = fimCustom ? new Date(fimCustom.getFullYear(), fimCustom.getMonth(), fimCustom.getDate()) : a
    const [i2, f2] = a <= f ? [a, f] : [f, a]
    return {
      inicio: iso(i2),
      fim:    iso(f2),
      rotulo: iso(i2) === iso(f2)
        ? i2.toLocaleDateString('pt-BR')
        : `${i2.toLocaleDateString('pt-BR')} a ${f2.toLocaleDateString('pt-BR')}`,
    }
  }

  switch (periodicidade) {
    case 'diaria':
      inicio = new Date(a); fim = new Date(a)
      rotulo = a.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
      break
    case 'semanal': {
      // getDay() devolve 0 para domingo, que precisa recuar 6 dias — senão o
      // domingo cairia na semana seguinte.
      const recuo = a.getDay() === 0 ? 6 : a.getDay() - 1
      inicio = new Date(a); inicio.setDate(a.getDate() - recuo)
      fim    = new Date(inicio); fim.setDate(inicio.getDate() + 6)
      rotulo = `${inicio.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} a ${fim.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
      break
    }
    case 'mensal':
      inicio = new Date(a.getFullYear(), a.getMonth(), 1)
      fim    = new Date(a.getFullYear(), a.getMonth() + 1, 0)
      rotulo = `${MESES[a.getMonth()]} de ${a.getFullYear()}`
      break
    case 'trimestral': {
      const t = Math.floor(a.getMonth() / 3)
      inicio = new Date(a.getFullYear(), t * 3, 1)
      fim    = new Date(a.getFullYear(), t * 3 + 3, 0)
      rotulo = `${t + 1}º trimestre de ${a.getFullYear()}`
      break
    }
    case 'semestral': {
      const s = a.getMonth() < 6 ? 0 : 1
      inicio = new Date(a.getFullYear(), s * 6, 1)
      fim    = new Date(a.getFullYear(), s * 6 + 6, 0)
      rotulo = `${s + 1}º semestre de ${a.getFullYear()}`
      break
    }
    case 'anual':
    default:
      inicio = new Date(a.getFullYear(), 0, 1)
      fim    = new Date(a.getFullYear(), 11, 31)
      rotulo = String(a.getFullYear())
      break
  }
  return { inicio: iso(inicio), fim: iso(fim), rotulo }
}

/** Move a âncora um período inteiro para frente ou para trás. */
export function deslocar(periodicidade: Periodicidade, ancora: Date, passo: 1 | -1, fimCustom?: Date | null) {
  const d = new Date(ancora)
  if (periodicidade === 'customizado') {
    // Anda um bloco do mesmo tamanho do intervalo escolhido: quem olhou
    // 3 a 5 de agosto quer ver 6 a 8, não 4 a 6.
    const f    = fimCustom ?? ancora
    const dias = Math.abs(Math.round((f.getTime() - ancora.getTime()) / 86400000)) + 1
    d.setDate(d.getDate() + passo * dias)
    return d
  }
  switch (periodicidade) {
    case 'diaria':     d.setDate(d.getDate() + passo); break
    case 'semanal':    d.setDate(d.getDate() + passo * 7); break
    case 'mensal':     d.setMonth(d.getMonth() + passo); break
    case 'trimestral': d.setMonth(d.getMonth() + passo * 3); break
    case 'semestral':  d.setMonth(d.getMonth() + passo * 6); break
    case 'anual':      d.setFullYear(d.getFullYear() + passo); break
  }
  return d
}

/** Dois períodos são o mesmo se o intervalo derivado deles for idêntico. */
function mesmoPeriodo(p: Periodicidade, a: Date, b: Date) {
  return intervaloDe(p, a).inicio === intervaloDe(p, b).inicio
}

interface Props {
  periodicidade: Periodicidade
  valor:         Date
  onChange:      (d: Date) => void
  /** Só no modo customizado: segunda ponta do intervalo. */
  fimCustom?:    Date | null
  /** Só no modo customizado: recebe as duas pontas de uma vez. */
  onChangeCustom?: (inicio: Date, fim: Date) => void
  className?:    string
}

export function SeletorPeriodo({
  periodicidade, valor, onChange,
  fimCustom = null, onChangeCustom,
  className = '',
}: Props) {
  const [aberto, setAberto]     = useState(false)
  // Rascunho: o calendário navega e pré-seleciona sem alterar a tela atrás.
  // Só o OK confirma — Cancelar joga fora.
  const [rascunho, setRascunho] = useState<Date>(valor)
  // No modo customizado o rascunho tem duas pontas. `fimRascunho = null`
  // significa "primeiro clique dado, esperando o segundo".
  const [fimRascunho, setFimRascunho] = useState<Date | null>(fimCustom)
  const [pagina, setPagina]     = useState<Date>(valor)
  const caixaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setRascunho(valor); setPagina(valor); setFimRascunho(fimCustom)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, fimCustom, periodicidade])

  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false)
    }
    function esc(e: KeyboardEvent) { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    window.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); window.removeEventListener('keydown', esc) }
  }, [aberto])

  const ehCustom = periodicidade === 'customizado'
  const porDia   = periodicidade === 'diaria' || periodicidade === 'semanal' || ehCustom
  const rotulo   = intervaloDe(periodicidade, valor, fimCustom).rotulo

  function confirmar() {
    if (ehCustom) {
      // Só uma ponta escolhida: o período vira aquele único dia.
      const fim = fimRascunho ?? rascunho
      const [i, f] = rascunho <= fim ? [rascunho, fim] : [fim, rascunho]
      onChangeCustom?.(i, f)
    } else {
      onChange(rascunho)
    }
    setAberto(false)
  }
  function cancelar() {
    setRascunho(valor); setFimRascunho(fimCustom); setPagina(valor); setAberto(false)
  }

  // Modo customizado: 1º clique abre um intervalo novo, 2º clique fecha.
  function clicarDia(d: Date) {
    if (!ehCustom) { setRascunho(d); return }
    if (fimRascunho === null) { setFimRascunho(d); return }   // fecha o intervalo
    setRascunho(d); setFimRascunho(null)                       // recomeça
  }

  // Navegação do cabeçalho do calendário: mês a mês na grade de dias, ano a
  // ano nas grades de mês/trimestre/semestre, e de 12 em 12 na de anos.
  function paginar(passo: 1 | -1) {
    const d = new Date(pagina)
    if (porDia)                      d.setMonth(d.getMonth() + passo)
    else if (periodicidade === 'anual') d.setFullYear(d.getFullYear() + passo * 12)
    else                             d.setFullYear(d.getFullYear() + passo)
    setPagina(d)
  }

  const tituloPagina = porDia
    ? `${MESES[pagina.getMonth()].replace(/^./, c => c.toUpperCase())} ${pagina.getFullYear()}`
    : periodicidade === 'anual'
      ? `${Math.floor(pagina.getFullYear() / 12) * 12} – ${Math.floor(pagina.getFullYear() / 12) * 12 + 11}`
      : String(pagina.getFullYear())

  // ── Grade de dias ─────────────────────────────────────────────────────────
  function gradeDias() {
    const ano = pagina.getFullYear()
    const mes = pagina.getMonth()
    const primeiro   = new Date(ano, mes, 1)
    const totalDias  = new Date(ano, mes + 1, 0).getDate()
    const vazios     = primeiro.getDay()   // domingo = 0, e a grade começa no domingo
    const hoje       = new Date()

    const celulas: (Date | null)[] = [
      ...Array.from({ length: vazios }, () => null),
      ...Array.from({ length: totalDias }, (_, i) => new Date(ano, mes, i + 1)),
    ]

    return (
      <>
        <div className="grid grid-cols-7 gap-y-1 mb-1">
          {DIAS_CURTO.map((d, i) => (
            <span key={i} className="h-7 flex items-center justify-center text-[11px] font-medium text-gray-400">{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {celulas.map((d, i) => {
            if (!d) return <span key={i} />
            const ehHoje = iso(d) === iso(hoje)

            // No customizado, "selecionado" é ponta do intervalo; o miolo
            // ganha um realce mais fraco para o operador ver a faixa inteira.
            let selecionado: boolean
            let noMiolo = false
            if (ehCustom) {
              const ini = rascunho
              const fim = fimRascunho
              selecionado = iso(d) === iso(ini) || (!!fim && iso(d) === iso(fim))
              if (fim) {
                const [a1, a2] = ini <= fim ? [ini, fim] : [fim, ini]
                noMiolo = d > a1 && d < a2
              }
            } else {
              selecionado = mesmoPeriodo(periodicidade, d, rascunho)
            }

            return (
              <button
                key={i}
                onClick={() => clicarDia(d)}
                className={[
                  'h-8 w-8 mx-auto flex items-center justify-center text-[13px] rounded-full transition-colors',
                  selecionado
                    ? 'bg-green-500 text-white font-semibold'
                    : noMiolo
                      ? 'bg-green-50 text-green-700'
                      : ehHoje
                        ? 'text-green-700 font-semibold ring-1 ring-green-300 hover:bg-green-50'
                        : 'text-gray-700 hover:bg-gray-100',
                ].join(' ')}
              >
                {d.getDate()}
              </button>
            )
          })}
        </div>
        {periodicidade === 'semanal' && (
          <p className="mt-3 text-[11px] text-gray-400 text-center">
            {intervaloDe('semanal', rascunho).rotulo}
          </p>
        )}
        {ehCustom && (
          <p className="mt-3 text-[11px] text-gray-400 text-center">
            {fimRascunho === null
              ? 'Clique no dia final do período'
              : intervaloDe('customizado', rascunho, fimRascunho).rotulo}
          </p>
        )}
      </>
    )
  }

  // ── Grade de blocos (mês, trimestre, semestre, ano) ───────────────────────
  function gradeBlocos() {
    const ano = pagina.getFullYear()
    let opcoes: { rotulo: string; data: Date }[] = []
    let colunas = 3

    if (periodicidade === 'mensal') {
      opcoes = MESES_CURTO.map((m, i) => ({ rotulo: m, data: new Date(ano, i, 1) }))
    } else if (periodicidade === 'trimestral') {
      colunas = 2
      opcoes = [0, 1, 2, 3].map(t => ({ rotulo: `${t + 1}º tri`, data: new Date(ano, t * 3, 1) }))
    } else if (periodicidade === 'semestral') {
      colunas = 2
      opcoes = [0, 1].map(s => ({ rotulo: `${s + 1}º sem`, data: new Date(ano, s * 6, 1) }))
    } else {
      const base = Math.floor(ano / 12) * 12
      opcoes = Array.from({ length: 12 }, (_, i) => ({ rotulo: String(base + i), data: new Date(base + i, 0, 1) }))
    }

    return (
      <div className={`grid gap-1.5 ${colunas === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {opcoes.map((o, i) => {
          const selecionado = mesmoPeriodo(periodicidade, o.data, rascunho)
          return (
            <button
              key={i}
              onClick={() => setRascunho(o.data)}
              className={[
                'h-9 rounded-lg text-[13px] transition-colors',
                selecionado
                  ? 'bg-green-500 text-white font-semibold'
                  : 'text-gray-700 hover:bg-gray-100',
              ].join(' ')}
            >
              {o.rotulo}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div ref={caixaRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="h-9 min-w-[210px] px-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
      >
        <Calendar size={14} className="text-gray-400 flex-shrink-0" />
        <span className="text-sm text-gray-800 truncate">{rotulo}</span>
      </button>

      {aberto && (
        <div className="absolute z-40 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl p-4 w-[290px]">
          {/* Cabeçalho do calendário */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-800">{tituloPagina}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => paginar(-1)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                <ChevronLeft size={15} />
              </button>
              <button onClick={() => paginar(1)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          {porDia ? gradeDias() : gradeBlocos()}

          <div className="flex justify-end gap-1 mt-4 pt-3 border-t border-gray-100">
            <button onClick={cancelar} className="h-8 px-3 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
            <button onClick={confirmar} className="h-8 px-4 rounded-lg text-sm font-semibold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors">
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default SeletorPeriodo
