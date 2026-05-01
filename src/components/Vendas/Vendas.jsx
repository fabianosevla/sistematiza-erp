import { useState } from 'react'
import { fmt, formasPagamento } from '../../data/storage'

function BuscaProduto({ produtos, onAdicionar }) {
  const [busca, setBusca] = useState('')
  const resultado = busca.length < 2 ? [] : produtos.filter(p =>
    p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (p.codigo && p.codigo.includes(busca))
  ).slice(0, 6)

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={busca}
        onChange={e => setBusca(e.target.value)}
        placeholder="Buscar por nome ou código de barras..."
        style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '14px', outline: 'none', fontFamily: 'DM Sans, sans-serif', color: 'var(--text-primary)' }}
        onFocus={e => e.target.style.borderColor = 'var(--brand)'}
        onBlur={e => setTimeout(() => setBusca(''), 200)}
      />
      {resultado.length > 0 && (
        <div style={{ position: 'absolute', top: '44px', left: 0, right: 0, background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', zIndex: 100, overflow: 'hidden' }}>
          {resultado.map(p => (
            <div key={p.id} onClick={() => { onAdicionar(p); setBusca('') }}
              style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-subtle)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{p.nome}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>{p.codigo || 'Sem código'} · Estoque: {p.estoque} {p.unidade}</p>
              </div>
              <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--brand)', flexShrink: 0 }}>{fmt(p.precoVenda)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Vendas({ produtos, clientes, onRegistrarVenda }) {
  const [itens, setItens] = useState([])
  const [clienteId, setClienteId] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('Dinheiro')
  const [parcelas, setParcelas] = useState(1)
  const [desconto, setDesconto] = useState(0)
  const [vendaFinalizada, setVendaFinalizada] = useState(null)

  const total = itens.reduce((acc, i) => acc + i.quantidade * i.precoVenda, 0)
  const totalComDesconto = Math.max(0, total - desconto)

  const adicionarItem = (produto) => {
    if (produto.estoque === 0) return alert('Produto sem estoque!')
    setItens(prev => {
      const existe = prev.find(i => i.produtoId === produto.id)
      if (existe) {
        if (existe.quantidade >= produto.estoque) return alert('Quantidade máxima atingida!') || prev
        return prev.map(i => i.produtoId === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      }
      return [...prev, { produtoId: produto.id, nome: produto.nome, precoVenda: produto.precoVenda, unidade: produto.unidade, quantidade: 1 }]
    })
  }

  const alterarQtd = (produtoId, delta) => {
    setItens(prev => prev.map(i => i.produtoId === produtoId ? { ...i, quantidade: Math.max(1, i.quantidade + delta) } : i))
  }

  const removerItem = (produtoId) => {
    setItens(prev => prev.filter(i => i.produtoId !== produtoId))
  }

  const finalizar = () => {
    if (itens.length === 0) return alert('Adicione pelo menos um item!')
    if (formaPagamento === 'Fiado' && !clienteId) return alert('Selecione um cliente para venda fiada!')
    const cliente = clientes.find(c => c.id === parseInt(clienteId))
    const venda = {
      itens,
      clienteId: cliente?.id || null,
      clienteNome: cliente?.nome || 'Cliente avulso',
      formaPagamento,
      parcelas: formaPagamento === 'Fiado' ? parcelas : 1,
      subtotal: total,
      desconto: parseFloat(desconto) || 0,
      total: totalComDesconto,
    }
    onRegistrarVenda(venda)
    setVendaFinalizada(venda)
    setItens([])
    setClienteId('')
    setFormaPagamento('Dinheiro')
    setDesconto(0)
    setParcelas(1)
  }

  if (vendaFinalizada) {
    return (
      <div style={{ padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '48px', maxWidth: '420px', width: '100%', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>✅</div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>Venda finalizada!</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            {vendaFinalizada.clienteNome} · {vendaFinalizada.formaPagamento}
          </p>
          <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)', padding: '16px', marginBottom: '24px' }}>
            <p style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>{fmt(vendaFinalizada.total)}</p>
            {vendaFinalizada.desconto > 0 && (
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Desconto: {fmt(vendaFinalizada.desconto)}</p>
            )}
          </div>
          <button onClick={() => setVendaFinalizada(null)}
            style={{ width: '100%', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', padding: '13px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            Nova venda
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>Nova venda</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>Busque produtos pelo nome ou código de barras</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '16px' }}>

        {/* Lado esquerdo — busca e itens */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Busca */}
          <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Adicionar produto</p>
            <BuscaProduto produtos={produtos} onAdicionar={adicionarItem} />
          </div>

          {/* Itens */}
          <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', flex: 1 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
              <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Itens ({itens.length})
              </p>
            </div>
            {itens.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🛒</div>
                <p style={{ fontSize: '13px' }}>Nenhum item adicionado</p>
              </div>
            ) : (
              itens.map((item, idx) => (
                <div key={item.produtoId} style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: idx < itens.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{item.nome}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>{fmt(item.precoVenda)} / {item.unidade}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <button onClick={() => alterarQtd(item.produtoId, -1)}
                      style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <span style={{ fontSize: '14px', fontWeight: '700', minWidth: '24px', textAlign: 'center' }}>{item.quantidade}</span>
                    <button onClick={() => alterarQtd(item.produtoId, 1)}
                      style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', background: 'var(--brand)', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '700', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', minWidth: '70px', textAlign: 'right', flexShrink: 0 }}>{fmt(item.quantidade * item.precoVenda)}</p>
                  <button onClick={() => removerItem(item.produtoId)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-placeholder)', fontSize: '14px', flexShrink: 0, opacity: 0.6 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}>✕</button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Lado direito — pagamento */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Cliente */}
          <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Cliente</p>
            <select value={clienteId} onChange={e => setClienteId(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', background: 'var(--bg-layer-01)', fontFamily: 'DM Sans, sans-serif' }}>
              <option value="">Cliente avulso</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          {/* Pagamento */}
          <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Forma de pagamento</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {formasPagamento.map(f => {
                const ativo = formaPagamento === f
                return (
                  <button key={f} onClick={() => setFormaPagamento(f)}
                    style={{ background: ativo ? 'var(--brand-light)' : 'var(--bg-primary)', border: `1.5px solid ${ativo ? 'var(--brand)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-md)', padding: '10px 14px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: ativo ? 'var(--brand)' : 'var(--border-strong)', flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', fontWeight: ativo ? '600' : '400', color: ativo ? 'var(--brand)' : 'var(--text-primary)' }}>{f}</span>
                    {ativo && <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--brand)', fontWeight: '700' }}>✓</span>}
                  </button>
                )
              })}
            </div>
            {formaPagamento === 'Fiado' && (
              <div style={{ marginTop: '12px' }}>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Parcelas</label>
                <select value={parcelas} onChange={e => setParcelas(parseInt(e.target.value))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '13px', outline: 'none', fontFamily: 'DM Sans, sans-serif' }}>
                  {[1,2,3,4,5,6,10,12].map(n => <option key={n} value={n}>{n}x de {fmt(totalComDesconto / n)}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Desconto */}
          <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Desconto (R$)</p>
            <input type="number" value={desconto} onChange={e => setDesconto(e.target.value)} placeholder="0,00" min="0"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '13px', outline: 'none', fontFamily: 'DM Sans, sans-serif', color: 'var(--text-primary)' }}
              onFocus={e => e.target.style.borderColor = 'var(--brand)'}
              onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'} />
          </div>

          {/* Total */}
          <div style={{ background: 'var(--text-primary)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
            {desconto > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Subtotal</span>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{fmt(total)}</span>
              </div>
            )}
            {desconto > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Desconto</span>
                <span style={{ fontSize: '12px', color: '#f87171' }}>- {fmt(desconto)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>Total</span>
              <span style={{ fontSize: '26px', fontWeight: '800', color: '#fff', letterSpacing: '-0.5px' }}>{fmt(totalComDesconto)}</span>
            </div>
            <button onClick={finalizar}
              style={{ width: '100%', background: '#2ecc71', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', padding: '13px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              ✓ Finalizar venda
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}