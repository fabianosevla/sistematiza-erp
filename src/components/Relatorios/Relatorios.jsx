import { fmt } from '../../data/storage'

export default function Relatorios({ vendas, produtos, contas }) {
  const hoje = new Date().toLocaleDateString('pt-BR')
  const mesAtual = new Date().toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' }).replace('/', '/')

  const vendasHoje = vendas.filter(v => v.data === hoje)
  const vendasMes  = vendas.filter(v => v.data?.endsWith(mesAtual.slice(-7)))

  const faturadoHoje = vendasHoje.reduce((acc, v) => acc + v.total, 0)
  const faturadoMes  = vendasMes.reduce((acc, v) => acc + v.total, 0)
  const faturadoTotal = vendas.reduce((acc, v) => acc + v.total, 0)

  // Lucro estimado
  const lucroVendas = vendas.reduce((acc, v) => {
    return acc + v.itens.reduce((s, item) => {
      const produto = produtos.find(p => p.id === item.produtoId)
      if (!produto) return s
      return s + (item.precoVenda - produto.precoCusto) * item.quantidade
    }, 0)
  }, 0)

  // Produtos mais vendidos
  const produtosMapa = {}
  vendas.forEach(v => {
    v.itens.forEach(i => {
      if (!produtosMapa[i.produtoId]) produtosMapa[i.produtoId] = { nome: i.nome, quantidade: 0, total: 0 }
      produtosMapa[i.produtoId].quantidade += i.quantidade
      produtosMapa[i.produtoId].total += i.quantidade * i.precoVenda
    })
  })
  const maisVendidos = Object.values(produtosMapa).sort((a, b) => b.quantidade - a.quantidade).slice(0, 8)

  // Formas de pagamento
  const pgMapa = {}
  vendas.forEach(v => {
    if (!pgMapa[v.formaPagamento]) pgMapa[v.formaPagamento] = { count: 0, total: 0 }
    pgMapa[v.formaPagamento].count++
    pgMapa[v.formaPagamento].total += v.total
  })

  // Estoque valorizado
  const estoqueValor = produtos.reduce((acc, p) => acc + p.estoque * p.precoCusto, 0)
  const estoqueVenda = produtos.reduce((acc, p) => acc + p.estoque * p.precoVenda, 0)

  return (
    <div style={{ padding: '32px' }}>

      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>Relatórios</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>Visão geral do negócio</p>
      </div>

      {/* Faturamento */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Faturado hoje', valor: fmt(faturadoHoje), sub: `${vendasHoje.length} venda${vendasHoje.length !== 1 ? 's' : ''}`, bg: 'var(--bg-layer-01)', cor: 'var(--text-primary)', border: 'var(--border-subtle)' },
          { label: 'Faturado no mês', valor: fmt(faturadoMes), sub: `${vendasMes.length} venda${vendasMes.length !== 1 ? 's' : ''}`, bg: 'var(--brand-light)', cor: 'var(--brand)', border: 'var(--brand-light)' },
          { label: 'Total histórico', valor: fmt(faturadoTotal), sub: `${vendas.length} venda${vendas.length !== 1 ? 's' : ''}`, bg: 'var(--bg-layer-01)', cor: 'var(--text-primary)', border: 'var(--border-subtle)' },
          { label: 'Lucro estimado', valor: fmt(lucroVendas), sub: 'baseado no custo', bg: 'var(--receita-bg)', cor: 'var(--receita)', border: 'var(--receita-bg)' },
        ].map(c => (
          <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 'var(--radius-lg)', padding: '20px' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: c.cor, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', opacity: 0.8 }}>{c.label}</p>
            <p style={{ fontSize: '22px', fontWeight: '800', color: c.cor, letterSpacing: '-0.5px', lineHeight: 1 }}>{c.valor}</p>
            <p style={{ fontSize: '11px', color: c.cor, marginTop: '6px', opacity: 0.7 }}>{c.sub}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

        {/* Mais vendidos */}
        <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Produtos mais vendidos</p>
          </div>
          {maisVendidos.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <p style={{ fontSize: '13px' }}>Nenhuma venda registrada.</p>
            </div>
          ) : (
            maisVendidos.map((p, idx) => (
              <div key={idx} style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: idx < maisVendidos.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', background: 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: 'var(--brand)', flexShrink: 0 }}>
                  {idx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>{p.quantidade} unidade{p.quantidade !== 1 ? 's' : ''}</p>
                </div>
                <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', flexShrink: 0 }}>{fmt(p.total)}</p>
              </div>
            ))
          )}
        </div>

        {/* Formas de pagamento */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
              <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Formas de pagamento</p>
            </div>
            {Object.keys(pgMapa).length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <p style={{ fontSize: '13px' }}>Nenhuma venda registrada.</p>
              </div>
            ) : (
              Object.entries(pgMapa).sort((a, b) => b[1].total - a[1].total).map(([forma, dados], idx, arr) => (
                <div key={forma} style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: idx < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>{forma}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>{dados.count} venda{dados.count !== 1 ? 's' : ''}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{fmt(dados.total)}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                      {vendas.length > 0 ? ((dados.total / faturadoTotal) * 100).toFixed(0) : 0}%
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Estoque valorizado */}
          <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Estoque valorizado</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Valor de custo</p>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>{fmt(estoqueValor)}</p>
                </div>
                <span style={{ fontSize: '20px' }}>📦</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--receita-bg)', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--receita)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Valor de venda</p>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--receita)', marginTop: '2px' }}>{fmt(estoqueVenda)}</p>
                </div>
                <span style={{ fontSize: '20px' }}>💰</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Histórico de vendas */}
      {vendas.length > 0 && (
        <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Últimas vendas</p>
          </div>
          {vendas.slice(0, 10).map((v, idx) => (
            <div key={v.id} style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '14px', borderBottom: idx < Math.min(vendas.length, 10) - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{v.clienteNome || 'Cliente avulso'}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>{v.itens.length} item{v.itens.length !== 1 ? 's' : ''} · {v.formaPagamento} · {v.data} {v.hora}</p>
              </div>
              {v.desconto > 0 && (
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>-{fmt(v.desconto)}</span>
              )}
              <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', flexShrink: 0 }}>{fmt(v.total)}</p>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}