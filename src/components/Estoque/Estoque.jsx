import { useState } from 'react'
import { fmt, getEstoqueStatus } from '../../data/storage'

function FormMovimento({ produtos, onSalvar, onCancelar }) {
  const [form, setForm] = useState({ produtoId: '', tipo: 'entrada', quantidade: 1, motivo: '', custo: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const produto = produtos.find(p => p.id === parseInt(form.produtoId))

  const salvar = () => {
    if (!form.produtoId || !form.quantidade) return alert('Selecione o produto e quantidade!')
    onSalvar({ ...form, produtoId: parseInt(form.produtoId), quantidade: parseFloat(form.quantidade), custo: parseFloat(form.custo) || 0 })
  }

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '14px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle = { fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(22,22,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, backdropFilter: 'blur(2px)', padding: '24px' }}>
      <div style={{ background: 'var(--bg-layer-01)', borderRadius: 'var(--radius-xl)', padding: '32px', maxWidth: '480px', width: '100%', boxShadow: 'var(--shadow-lg)' }}>
        <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>Registrar movimentação</p>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>Entrada ou saída de estoque</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>

          {/* Tipo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {['entrada', 'saida'].map(t => {
              const ativo = form.tipo === t
              const cor = t === 'entrada' ? 'var(--receita)' : 'var(--despesa)'
              const bg  = t === 'entrada' ? 'var(--receita-bg)' : 'var(--despesa-bg)'
              return (
                <button key={t} onClick={() => set('tipo', t)}
                  style={{ background: ativo ? bg : 'var(--bg-primary)', border: `1.5px solid ${ativo ? cor : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-lg)', padding: '14px', cursor: 'pointer', textAlign: 'center' }}>
                  <span style={{ fontSize: '20px', display: 'block', marginBottom: '4px' }}>{t === 'entrada' ? '📥' : '📤'}</span>
                  <span style={{ fontSize: '13px', fontWeight: ativo ? '600' : '400', color: ativo ? cor : 'var(--text-secondary)', textTransform: 'capitalize' }}>{t === 'entrada' ? 'Entrada' : 'Saída'}</span>
                </button>
              )
            })}
          </div>

          <div>
            <label style={labelStyle}>Produto *</label>
            <select value={form.produtoId} onChange={e => set('produtoId', e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Selecione...</option>
              {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} (estoque: {p.estoque} {p.unidade})</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Quantidade *</label>
              <input type="number" min="0.01" step="0.01" value={form.quantidade} onChange={e => set('quantidade', e.target.value)}
                style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--brand)'} onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'} />
            </div>
            {form.tipo === 'entrada' && (
              <div>
                <label style={labelStyle}>Custo unitário (R$)</label>
                <input type="number" step="0.01" value={form.custo} onChange={e => set('custo', e.target.value)} placeholder="0,00"
                  style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--brand)'} onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'} />
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Motivo</label>
            <input value={form.motivo} onChange={e => set('motivo', e.target.value)}
              placeholder={form.tipo === 'entrada' ? 'Ex: Compra fornecedor, Devolução...' : 'Ex: Vencido, Quebra, Ajuste...'}
              style={inputStyle} onFocus={e => e.target.style.borderColor = 'var(--brand)'} onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'} />
          </div>

          {produto && (
            <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', padding: '12px 16px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Estoque atual: <strong>{produto.estoque} {produto.unidade}</strong>
                {' → '}
                <strong style={{ color: form.tipo === 'entrada' ? 'var(--receita)' : 'var(--despesa)' }}>
                  {form.tipo === 'entrada'
                    ? produto.estoque + (parseFloat(form.quantidade) || 0)
                    : Math.max(0, produto.estoque - (parseFloat(form.quantidade) || 0))
                  } {produto.unidade}
                </strong>
              </p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onCancelar} style={{ flex: 1, background: 'var(--bg-layer-02)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '14px', cursor: 'pointer', color: 'var(--text-primary)' }}>Cancelar</button>
          <button onClick={salvar} style={{ flex: 1, background: 'var(--brand)', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', color: '#fff' }}>Registrar</button>
        </div>
      </div>
    </div>
  )
}

export default function Estoque({ produtos, movimentos, onRegistrarMovimento }) {
  const [showForm, setShowForm] = useState(false)
  const [filtro, setFiltro] = useState('todos')

  const produtosFiltrados = produtos.filter(p => {
    if (filtro === 'zerado') return p.estoque === 0
    if (filtro === 'baixo')  return p.estoque > 0 && p.estoque <= p.estoqueMinimo
    if (filtro === 'ok')     return p.estoque > p.estoqueMinimo
    return true
  })

  const alertas = produtos.filter(p => getEstoqueStatus(p) !== 'ok').length

  return (
    <div style={{ padding: '32px' }}>

      {showForm && (
        <FormMovimento
          produtos={produtos}
          onSalvar={(mov) => { onRegistrarMovimento(mov); setShowForm(false) }}
          onCancelar={() => setShowForm(false)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>Estoque</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {alertas > 0 ? `⚠️ ${alertas} produto${alertas !== 1 ? 's' : ''} com alerta` : '✅ Estoque em dia'}
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px 20px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
          + Movimentação
        </button>
      </div>

      {/* Cards resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Produtos OK',      valor: produtos.filter(p => getEstoqueStatus(p) === 'ok').length,     bg: 'var(--receita-bg)', cor: 'var(--receita)' },
          { label: 'Estoque baixo',    valor: produtos.filter(p => getEstoqueStatus(p) === 'baixo').length,  bg: 'var(--pendente-bg)', cor: 'var(--pendente)' },
          { label: 'Sem estoque',      valor: produtos.filter(p => getEstoqueStatus(p) === 'zerado').length, bg: 'var(--despesa-bg)', cor: 'var(--despesa)' },
        ].map(c => (
          <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.bg}`, borderRadius: 'var(--radius-lg)', padding: '20px' }}>
            <p style={{ fontSize: '26px', fontWeight: '700', color: c.cor, letterSpacing: '-0.5px', lineHeight: 1 }}>{c.valor}</p>
            <p style={{ fontSize: '11px', fontWeight: '600', color: c.cor, marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.8 }}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {[
          { key: 'todos',   label: 'Todos' },
          { key: 'ok',      label: '✅ OK' },
          { key: 'baixo',   label: '⚠️ Baixo' },
          { key: 'zerado',  label: '🔴 Zerado' },
        ].map(f => (
          <button key={f.key} onClick={() => setFiltro(f.key)}
            style={{ background: filtro === f.key ? 'var(--brand)' : 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-full)', padding: '6px 14px', fontSize: '12px', fontWeight: filtro === f.key ? '600' : '400', cursor: 'pointer', color: filtro === f.key ? '#fff' : 'var(--text-secondary)' }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Tabela de produtos */}
      <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '12px', padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-primary)' }}>
          {['Produto', 'Unidade', 'Estoque atual', 'Mínimo', 'Status'].map(h => (
            <p key={h} style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</p>
          ))}
        </div>
        {produtosFiltrados.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <p style={{ fontSize: '13px' }}>Nenhum produto nesta categoria.</p>
          </div>
        ) : (
          produtosFiltrados.map((p, idx) => {
            const st = getEstoqueStatus(p)
            const badge = st === 'zerado' ? { label: 'Zerado', bg: 'var(--despesa-bg)', cor: 'var(--despesa)' }
                        : st === 'baixo'  ? { label: 'Baixo',  bg: 'var(--pendente-bg)', cor: 'var(--pendente)' }
                        : { label: 'OK', bg: 'var(--receita-bg)', cor: 'var(--receita)' }
            return (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '12px', padding: '14px 20px', alignItems: 'center', borderBottom: idx < produtosFiltrados.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{p.nome}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>{p.categoria}</p>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{p.unidade}</p>
                <p style={{ fontSize: '14px', fontWeight: '700', color: st !== 'ok' ? badge.cor : 'var(--text-primary)' }}>{p.estoque}</p>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{p.estoqueMinimo}</p>
                <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: 'var(--radius-full)', background: badge.bg, color: badge.cor, display: 'inline-block' }}>{badge.label}</span>
              </div>
            )
          })
        )}
      </div>

      {/* Histórico de movimentações */}
      {movimentos.length > 0 && (
        <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Últimas movimentações</p>
          </div>
          {movimentos.slice(0, 10).map((m, idx) => {
            const produto = produtos.find(p => p.id === m.produtoId)
            const isEntrada = m.tipo === 'entrada'
            return (
              <div key={m.id} style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: idx < Math.min(movimentos.length, 10) - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', background: isEntrada ? 'var(--receita-bg)' : 'var(--despesa-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>
                  {isEntrada ? '📥' : '📤'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{produto?.nome || 'Produto removido'}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>{m.motivo || (isEntrada ? 'Entrada de estoque' : 'Saída de estoque')} · {m.data}</p>
                </div>
                <p style={{ fontSize: '14px', fontWeight: '700', color: isEntrada ? 'var(--receita)' : 'var(--despesa)', flexShrink: 0 }}>
                  {isEntrada ? '+' : '-'}{m.quantidade} {produto?.unidade || ''}
                </p>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}