import { useState } from 'react'
import { fmt, categoriasProduto, unidades, getEstoqueStatus } from '../../data/storage'

function FormProduto({ produto, onSalvar, onCancelar }) {
  const [form, setForm] = useState({
    nome:          produto?.nome          || '',
    codigo:        produto?.codigo        || '',
    categoria:     produto?.categoria     || 'Mercearia',
    unidade:       produto?.unidade       || 'UN',
    precoCusto:    produto?.precoCusto    || '',
    precoVenda:    produto?.precoVenda    || '',
    estoque:       produto?.estoque       || 0,
    estoqueMinimo: produto?.estoqueMinimo || 5,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const salvar = () => {
    if (!form.nome || !form.precoVenda) return alert('Preencha nome e preço de venda!')
    onSalvar({
      ...form,
      precoCusto:    parseFloat(form.precoCusto)    || 0,
      precoVenda:    parseFloat(form.precoVenda)    || 0,
      estoque:       parseFloat(form.estoque)       || 0,
      estoqueMinimo: parseFloat(form.estoqueMinimo) || 0,
    })
  }

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '14px', color: 'var(--text-primary)', outline: 'none', background: 'var(--bg-layer-01)', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle = { fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }
  const focus = (e) => e.target.style.borderColor = 'var(--brand)'
  const blur  = (e) => e.target.style.borderColor = 'var(--border-subtle)'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(22,22,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, backdropFilter: 'blur(2px)', padding: '24px' }}>
      <div style={{ background: 'var(--bg-layer-01)', borderRadius: 'var(--radius-xl)', padding: '32px', maxWidth: '560px', width: '100%', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', overflowY: 'auto' }}>
        <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>{produto ? 'Editar produto' : 'Novo produto'}</p>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>Preencha os dados do produto</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={labelStyle}>Nome *</label>
              <input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Coca-Cola 2L" autoFocus style={inputStyle} onFocus={focus} onBlur={blur} />
            </div>
            <div>
              <label style={labelStyle}>Código de barras</label>
              <input value={form.codigo} onChange={e => set('codigo', e.target.value)} placeholder="EAN-13" style={inputStyle} onFocus={focus} onBlur={blur} />
            </div>
            <div>
              <label style={labelStyle}>Categoria</label>
              <select value={form.categoria} onChange={e => set('categoria', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {categoriasProduto.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Unidade</label>
              <select value={form.unidade} onChange={e => set('unidade', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {unidades.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Preço de custo (R$)</label>
              <input type="number" step="0.01" value={form.precoCusto} onChange={e => set('precoCusto', e.target.value)} placeholder="0,00" style={inputStyle} onFocus={focus} onBlur={blur} />
            </div>
            <div>
              <label style={labelStyle}>Preço de venda (R$) *</label>
              <input type="number" step="0.01" value={form.precoVenda} onChange={e => set('precoVenda', e.target.value)} placeholder="0,00" style={inputStyle} onFocus={focus} onBlur={blur} />
            </div>
            <div>
              <label style={labelStyle}>Estoque atual</label>
              <input type="number" value={form.estoque} onChange={e => set('estoque', e.target.value)} placeholder="0" style={inputStyle} onFocus={focus} onBlur={blur} />
            </div>
            <div>
              <label style={labelStyle}>Estoque mínimo</label>
              <input type="number" value={form.estoqueMinimo} onChange={e => set('estoqueMinimo', e.target.value)} placeholder="5" style={inputStyle} onFocus={focus} onBlur={blur} />
            </div>
          </div>

          {form.precoCusto > 0 && form.precoVenda > 0 && (
            <div style={{ background: 'var(--receita-bg)', borderRadius: 'var(--radius-md)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: 'var(--receita)' }}>Margem de lucro</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--receita)' }}>
                {(((form.precoVenda - form.precoCusto) / form.precoCusto) * 100).toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onCancelar} style={{ flex: 1, background: 'var(--bg-layer-02)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '14px', cursor: 'pointer', color: 'var(--text-primary)' }}>Cancelar</button>
          <button onClick={salvar} style={{ flex: 1, background: 'var(--brand)', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', color: '#fff' }}>
            {produto ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Produtos({ produtos, onAtualizar, onExcluir }) {
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [busca, setBusca] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas')

  const filtrados = produtos.filter(p => {
    const matchBusca = p.nome.toLowerCase().includes(busca.toLowerCase()) || (p.codigo && p.codigo.includes(busca))
    const matchCat = categoriaFiltro === 'Todas' || p.categoria === categoriaFiltro
    return matchBusca && matchCat
  })

  const salvar = (form) => {
    if (editando) {
      onAtualizar(produtos.map(p => p.id === editando.id ? { ...editando, ...form } : p))
    } else {
      onAtualizar([...produtos, { id: Date.now(), ...form }])
    }
    setShowForm(false)
    setEditando(null)
  }

  const statusBadge = (p) => {
    const st = getEstoqueStatus(p)
    if (st === 'zerado') return { label: 'Zerado', bg: 'var(--despesa-bg)', cor: 'var(--despesa)' }
    if (st === 'baixo')  return { label: 'Baixo',  bg: 'var(--pendente-bg)', cor: 'var(--pendente)' }
    return { label: 'OK', bg: 'var(--receita-bg)', cor: 'var(--receita)' }
  }

  const categorias = ['Todas', ...new Set(produtos.map(p => p.categoria))]

  return (
    <div style={{ padding: '32px' }}>

      {(showForm || editando) && (
        <FormProduto produto={editando} onSalvar={salvar} onCancelar={() => { setShowForm(false); setEditando(null) }} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>Produtos</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>{produtos.length} produto{produtos.length !== 1 ? 's' : ''} cadastrado{produtos.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setEditando(null); setShowForm(true) }}
          style={{ background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px 20px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
          + Novo produto
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou código..."
          style={{ flex: 1, minWidth: '200px', padding: '9px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '13px', outline: 'none', fontFamily: 'DM Sans, sans-serif', color: 'var(--text-primary)' }}
          onFocus={e => e.target.style.borderColor = 'var(--brand)'}
          onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'} />
        {categorias.map(cat => (
          <button key={cat} onClick={() => setCategoriaFiltro(cat)}
            style={{ background: categoriaFiltro === cat ? 'var(--brand)' : 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-full)', padding: '6px 14px', fontSize: '12px', fontWeight: categoriaFiltro === cat ? '600' : '400', cursor: 'pointer', color: categoriaFiltro === cat ? '#fff' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>

        {/* Header tabela */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 80px', gap: '12px', padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-primary)' }}>
          {['Produto', 'Categoria', 'Estoque', 'Custo', 'Venda', ''].map(h => (
            <p key={h} style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</p>
          ))}
        </div>

        {filtrados.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📦</div>
            <p style={{ fontSize: '13px' }}>Nenhum produto encontrado</p>
          </div>
        ) : (
          filtrados.map((p, idx) => {
            const badge = statusBadge(p)
            const margem = p.precoCusto > 0 ? (((p.precoVenda - p.precoCusto) / p.precoCusto) * 100).toFixed(0) : null
            return (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 80px', gap: '12px', padding: '14px 20px', alignItems: 'center', borderBottom: idx < filtrados.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>{p.codigo || 'Sem código'} · {p.unidade}</p>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{p.categoria}</p>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: 'var(--radius-full)', background: badge.bg, color: badge.cor }}>
                    {p.estoque} {p.unidade}
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{fmt(p.precoCusto)}</p>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{fmt(p.precoVenda)}</p>
                  {margem && <p style={{ fontSize: '10px', color: 'var(--receita)', marginTop: '1px' }}>+{margem}%</p>}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => setEditando(p)}
                    style={{ background: 'var(--bg-layer-02)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', cursor: 'pointer', fontSize: '12px' }}>✏️</button>
                  <button onClick={() => onExcluir(p.id)}
                    style={{ background: 'var(--despesa-bg)', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)', padding: '5px 8px', cursor: 'pointer', fontSize: '12px' }}>🗑️</button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}