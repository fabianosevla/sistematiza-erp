import { useState } from 'react'
import { fmt } from '../../data/storage'

export default function Financeiro({ contas, clientes, onQuitar }) {
  const [filtro, setFiltro] = useState('pendente')
  const [busca, setBusca] = useState('')

  const filtradas = contas.filter(c => {
    const matchFiltro = filtro === 'todos' || c.status === filtro
    const matchBusca  = c.clienteNome.toLowerCase().includes(busca.toLowerCase())
    return matchFiltro && matchBusca
  })

  const totalPendente = contas.filter(c => c.status === 'pendente').reduce((acc, c) => acc + c.valor, 0)
  const totalPago     = contas.filter(c => c.status === 'pago').reduce((acc, c) => acc + c.valor, 0)
  const totalGeral    = contas.reduce((acc, c) => acc + c.valor, 0)

  const hoje = new Date().toLocaleDateString('pt-BR')
  const vencidas = contas.filter(c => {
    if (c.status !== 'pendente') return false
    const [d, m, a] = c.vencimento.split('/')
    const venc = new Date(a, m - 1, d)
    return venc < new Date()
  })

  const isVencida = (conta) => {
    if (conta.status !== 'pendente') return false
    const [d, m, a] = conta.vencimento.split('/')
    const venc = new Date(a, m - 1, d)
    return venc < new Date()
  }

  return (
    <div style={{ padding: '32px' }}>

      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>Financeiro</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>Contas a receber e controle de fiado</p>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total a receber', valor: fmt(totalPendente), bg: contas.filter(c=>c.status==='pendente').length > 0 ? 'var(--pendente-bg)' : 'var(--bg-layer-01)', cor: contas.filter(c=>c.status==='pendente').length > 0 ? 'var(--pendente)' : 'var(--text-primary)', border: contas.filter(c=>c.status==='pendente').length > 0 ? 'var(--pendente-bg)' : 'var(--border-subtle)' },
          { label: 'Vencidas',        valor: vencidas.length,    bg: vencidas.length > 0 ? 'var(--despesa-bg)' : 'var(--bg-layer-01)', cor: vencidas.length > 0 ? 'var(--despesa)' : 'var(--text-primary)', border: vencidas.length > 0 ? 'var(--despesa-bg)' : 'var(--border-subtle)' },
          { label: 'Total recebido',  valor: fmt(totalPago),     bg: 'var(--receita-bg)', cor: 'var(--receita)', border: 'var(--receita-bg)' },
          { label: 'Total geral',     valor: fmt(totalGeral),    bg: 'var(--bg-layer-01)', cor: 'var(--text-primary)', border: 'var(--border-subtle)' },
        ].map(c => (
          <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 'var(--radius-lg)', padding: '20px' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: c.cor, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', opacity: 0.8 }}>{c.label}</p>
            <p style={{ fontSize: '22px', fontWeight: '800', color: c.cor, letterSpacing: '-0.5px', lineHeight: 1 }}>{c.valor}</p>
          </div>
        ))}
      </div>

      {/* Clientes devedores */}
      {clientes.filter(c => c.saldoDevedor > 0).length > 0 && (
        <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Clientes com saldo devedor</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0' }}>
            {clientes.filter(c => c.saldoDevedor > 0).map((c, idx, arr) => (
              <div key={c.id} style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderRight: (idx + 1) % 3 !== 0 ? '1px solid var(--border-subtle)' : 'none', borderBottom: idx < arr.length - 3 ? '1px solid var(--border-subtle)' : 'none' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-full)', background: 'var(--pendente-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', color: 'var(--pendente)', flexShrink: 0 }}>
                  {c.nome.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</p>
                  <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--pendente)', marginTop: '1px' }}>{fmt(c.saldoDevedor)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { key: 'pendente', label: '⏳ Pendentes' },
          { key: 'pago',     label: '✅ Pagos' },
          { key: 'todos',    label: 'Todos' },
        ].map(f => (
          <button key={f.key} onClick={() => setFiltro(f.key)}
            style={{ background: filtro === f.key ? 'var(--brand)' : 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-full)', padding: '6px 14px', fontSize: '12px', fontWeight: filtro === f.key ? '600' : '400', cursor: 'pointer', color: filtro === f.key ? '#fff' : 'var(--text-secondary)' }}>
            {f.label}
          </button>
        ))}
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente..."
          style={{ flex: 1, minWidth: '150px', padding: '7px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '13px', outline: 'none', fontFamily: 'DM Sans, sans-serif', color: 'var(--text-primary)' }}
          onFocus={e => e.target.style.borderColor = 'var(--brand)'}
          onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'} />
      </div>

      {/* Lista de contas */}
      <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 100px', gap: '12px', padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-primary)' }}>
          {['Cliente', 'Parcela', 'Vencimento', 'Valor', ''].map(h => (
            <p key={h} style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</p>
          ))}
        </div>

        {filtradas.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>💰</div>
            <p style={{ fontSize: '13px' }}>Nenhuma conta encontrada</p>
          </div>
        ) : (
          filtradas.map((c, idx) => {
            const vencida = isVencida(c)
            return (
              <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 100px', gap: '12px', padding: '14px 20px', alignItems: 'center', borderBottom: idx < filtradas.length - 1 ? '1px solid var(--border-subtle)' : 'none', background: vencida ? '#fff9f9' : 'transparent' }}
                onMouseEnter={e => e.currentTarget.style.background = vencida ? '#fff0f0' : 'var(--bg-primary)'}
                onMouseLeave={e => e.currentTarget.style.background = vencida ? '#fff9f9' : 'transparent'}>

                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.clienteNome}</p>
                  {vencida && <p style={{ fontSize: '10px', color: 'var(--despesa)', fontWeight: '600', marginTop: '1px' }}>⚠️ Vencida</p>}
                </div>

                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{c.parcela}</p>

                <p style={{ fontSize: '12px', color: vencida ? 'var(--despesa)' : 'var(--text-secondary)', fontWeight: vencida ? '600' : '400' }}>{c.vencimento}</p>

                <p style={{ fontSize: '14px', fontWeight: '700', color: c.status === 'pago' ? 'var(--receita)' : vencida ? 'var(--despesa)' : 'var(--text-primary)' }}>{fmt(c.valor)}</p>

                <div>
                  {c.status === 'pendente' ? (
                    <button onClick={() => onQuitar(c.id)}
                      style={{ background: 'var(--receita-bg)', border: '1px solid var(--receita)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', color: 'var(--receita)', whiteSpace: 'nowrap' }}>
                      ✓ Quitar
                    </button>
                  ) : (
                    <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--receita)' }}>✅ Pago</span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

    </div>
  )
}