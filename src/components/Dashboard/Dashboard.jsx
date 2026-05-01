import { fmt, hoje, getEstoqueStatus } from '../../data/storage'

export default function Dashboard({ produtos, vendas, contas, clientes, onNavegar }) {
  const dataHoje = hoje()

  const vendasHoje = vendas.filter(v => v.data === dataHoje)
  const faturadoHoje = vendasHoje.reduce((acc, v) => acc + v.total, 0)
  const ticketMedio = vendasHoje.length > 0 ? faturadoHoje / vendasHoje.length : 0

  const contasPendentes = contas.filter(c => c.status === 'pendente')
  const totalPendente = contasPendentes.reduce((acc, c) => acc + c.valor, 0)

  const alertasEstoque = produtos.filter(p => getEstoqueStatus(p) !== 'ok')
  const produtosZerados = produtos.filter(p => p.estoque === 0).length
  const produtosBaixos = produtos.filter(p => p.estoque > 0 && p.estoque <= p.estoqueMinimo).length

  const clientesDevedores = clientes.filter(c => c.saldoDevedor > 0).length

  const card = (bg, border) => ({
    background: bg, border: `1px solid ${border}`, borderRadius: 'var(--radius-lg)', padding: '20px'
  })

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>Dashboard</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Cards principais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        <div style={card('var(--bg-layer-01)', 'var(--border-subtle)')}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Faturado hoje</p>
          <p style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px', lineHeight: 1 }}>{fmt(faturadoHoje)}</p>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>{vendasHoje.length} venda{vendasHoje.length !== 1 ? 's' : ''} hoje</p>
        </div>
        <div style={card('var(--receita-bg)', 'var(--receita-bg)')}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--receita)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Ticket médio</p>
          <p style={{ fontSize: '24px', fontWeight: '800', color: 'var(--receita)', letterSpacing: '-0.5px', lineHeight: 1 }}>{fmt(ticketMedio)}</p>
          <p style={{ fontSize: '11px', color: 'var(--receita)', marginTop: '6px', opacity: 0.8 }}>por venda hoje</p>
        </div>
        <div style={card(totalPendente > 0 ? 'var(--pendente-bg)' : 'var(--bg-layer-01)', totalPendente > 0 ? 'var(--pendente-bg)' : 'var(--border-subtle)')}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: totalPendente > 0 ? 'var(--pendente)' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>A receber</p>
          <p style={{ fontSize: '24px', fontWeight: '800', color: totalPendente > 0 ? 'var(--pendente)' : 'var(--text-primary)', letterSpacing: '-0.5px', lineHeight: 1 }}>{fmt(totalPendente)}</p>
          <p style={{ fontSize: '11px', color: totalPendente > 0 ? 'var(--pendente)' : 'var(--text-secondary)', marginTop: '6px', opacity: 0.8 }}>{contasPendentes.length} parcela{contasPendentes.length !== 1 ? 's' : ''} pendente{contasPendentes.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={card(alertasEstoque.length > 0 ? 'var(--despesa-bg)' : 'var(--bg-layer-01)', alertasEstoque.length > 0 ? 'var(--despesa-bg)' : 'var(--border-subtle)')}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: alertasEstoque.length > 0 ? 'var(--despesa)' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Alertas estoque</p>
          <p style={{ fontSize: '24px', fontWeight: '800', color: alertasEstoque.length > 0 ? 'var(--despesa)' : 'var(--text-primary)', letterSpacing: '-0.5px', lineHeight: 1 }}>{alertasEstoque.length}</p>
          <p style={{ fontSize: '11px', color: alertasEstoque.length > 0 ? 'var(--despesa)' : 'var(--text-secondary)', marginTop: '6px', opacity: 0.8 }}>{produtosZerados} zerado{produtosZerados !== 1 ? 's' : ''}, {produtosBaixos} baixo{produtosBaixos !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

        {/* Atalhos */}
        <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px' }}>
          <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Ações rápidas</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {[
              { label: 'Nova venda',      emoji: '🛒', tela: 'vendas',       bg: 'var(--brand-light)',    cor: 'var(--brand)' },
              { label: 'Entrada estoque', emoji: '📦', tela: 'estoque',      bg: 'var(--receita-bg)',     cor: 'var(--receita)' },
              { label: 'Novo produto',    emoji: '➕', tela: 'produtos',     bg: 'var(--bg-primary)',     cor: 'var(--text-primary)' },
              { label: 'Financeiro',      emoji: '💰', tela: 'financeiro',   bg: 'var(--pendente-bg)',    cor: 'var(--pendente)' },
            ].map(a => (
              <button key={a.label} onClick={() => onNavegar(a.tela)}
                style={{ background: a.bg, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '14px', textAlign: 'left', cursor: 'pointer', transition: 'filter 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.filter = 'brightness(0.96)'}
                onMouseLeave={e => e.currentTarget.style.filter = 'none'}>
                <span style={{ fontSize: '18px', display: 'block', marginBottom: '6px' }}>{a.emoji}</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: a.cor }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Alertas de estoque */}
        <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Alertas de estoque</p>
            <button onClick={() => onNavegar('estoque')} style={{ fontSize: '12px', color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>Ver todos →</button>
          </div>
          {alertasEstoque.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>✅</div>
              <p style={{ fontSize: '13px' }}>Estoque em dia!</p>
            </div>
          ) : (
            alertasEstoque.slice(0, 5).map((p, idx) => {
              const zerado = p.estoque === 0
              return (
                <div key={p.id} style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: idx < Math.min(alertasEstoque.length, 5) - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: zerado ? 'var(--despesa)' : 'var(--pendente)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</p>
                    <p style={{ fontSize: '11px', color: zerado ? 'var(--despesa)' : 'var(--pendente)', marginTop: '1px' }}>
                      {zerado ? 'Sem estoque' : `${p.estoque} ${p.unidade} (mín: ${p.estoqueMinimo})`}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Vendas recentes */}
      <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Vendas recentes</p>
          <button onClick={() => onNavegar('vendas')} style={{ fontSize: '12px', color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>Ver todas →</button>
        </div>
        {vendas.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>🛒</div>
            <p style={{ fontSize: '13px' }}>Nenhuma venda registrada ainda.</p>
          </div>
        ) : (
          vendas.slice(0, 5).map((v, idx) => (
            <div key={v.id} style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', gap: '14px', borderBottom: idx < Math.min(vendas.length, 5) - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', background: 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>🛒</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{v.clienteNome || 'Cliente avulso'}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>{v.itens.length} item{v.itens.length !== 1 ? 's' : ''} · {v.formaPagamento} · {v.hora}</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{fmt(v.total)}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>{v.data}</p>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  )
}