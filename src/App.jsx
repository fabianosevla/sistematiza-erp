import { useState, useRef, useEffect } from 'react'
import { getConfig, saveConfig, getProdutos, saveProdutos, getClientes, saveClientes, getFornecedores, saveFornecedores, getVendas, saveVendas, getMovimentos, saveMovimentos, getContas, saveContas, fmt, hoje } from './data/storage'
import Dashboard from './components/Dashboard/Dashboard'
import Produtos from './components/Produtos/Produtos'
import Estoque from './components/Estoque/Estoque'
import Vendas from './components/Vendas/Vendas'
import Clientes from './components/Clientes/Clientes'
import Fornecedores from './components/Fornecedores/Fornecedores'
import Financeiro from './components/Financeiro/Financeiro'
import Relatorios from './components/Relatorios/Relatorios'

function Setup({ onConcluir }) {
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('mercado')

  const tipos = [
    { key: 'mercado',    label: 'Mercado',     emoji: '🛒' },
    { key: 'farmacia',   label: 'Farmácia',    emoji: '💊' },
    { key: 'papelaria',  label: 'Papelaria',   emoji: '📚' },
    { key: 'pet',        label: 'Pet Shop',    emoji: '🐾' },
    { key: 'outros',     label: 'Outro',       emoji: '🏪' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: 'var(--bg-layer-01)', borderRadius: 'var(--radius-xl)', padding: '48px', maxWidth: '480px', width: '100%', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-subtle)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '32px' }}>
          <svg width="28" height="28" viewBox="0 0 100 100" fill="none">
            <g transform="rotate(90,50,50)">
              <path d="M25 22L8 50L25 78" stroke="#2ecc71" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M75 22L92 50L75 78" stroke="#2ecc71" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M63 10L37 90" stroke="#2ecc71" strokeWidth="11" strokeLinecap="round"/>
            </g>
          </svg>
          <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-primary)' }}>
            sistematiza<span style={{ color: 'var(--brand)' }}>.ai</span>
          </span>
        </div>

        <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px', marginBottom: '8px' }}>
          Bem-vindo ao ERP! 👋
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '32px', lineHeight: 1.6 }}>
          Configure seu estabelecimento para começar a usar.
        </p>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tipo de negócio</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
            {tipos.map(t => {
              const ativo = tipo === t.key
              return (
                <button key={t.key} onClick={() => setTipo(t.key)}
                  style={{ background: ativo ? 'var(--brand-light)' : 'var(--bg-primary)', border: `1.5px solid ${ativo ? 'var(--brand)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-lg)', padding: '12px 6px', cursor: 'pointer', textAlign: 'center' }}>
                  <span style={{ fontSize: '20px', display: 'block', marginBottom: '4px' }}>{t.emoji}</span>
                  <span style={{ fontSize: '10px', fontWeight: ativo ? '600' : '400', color: ativo ? 'var(--brand)' : 'var(--text-secondary)' }}>{t.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Nome do estabelecimento *</label>
          <input value={nome} onChange={e => setNome(e.target.value)} onKeyDown={e => e.key === 'Enter' && nome.trim() && onConcluir({ nome: nome.trim(), tipo })}
            placeholder="Ex: Mercado do João" autoFocus
            style={{ width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '15px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'DM Sans, sans-serif' }}
            onFocus={e => e.target.style.borderColor = 'var(--brand)'}
            onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'} />
        </div>

        <button onClick={() => nome.trim() && onConcluir({ nome: nome.trim(), tipo })}
          style={{ width: '100%', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', padding: '14px', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
          Começar a usar →
        </button>
        <p style={{ fontSize: '12px', color: 'var(--text-placeholder)', textAlign: 'center', marginTop: '16px' }}>Powered by <strong>sistematiza.ai</strong></p>
      </div>
    </div>
  )
}

function Modal({ mensagem, onConfirmar, onCancelar }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(22,22,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--bg-layer-01)', borderRadius: 'var(--radius-xl)', padding: '32px', maxWidth: '380px', width: '90%', boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⚠️</div>
        <p style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>Confirmar ação</p>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.5 }}>{mensagem}</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onCancelar} style={{ flex: 1, background: 'var(--bg-layer-02)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '14px', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={onConfirmar} style={{ flex: 1, background: '#DC2626', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', color: '#fff' }}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}

const navItems = [
  { key: 'dashboard',    label: 'Dashboard',    emoji: '📊' },
  { key: 'vendas',       label: 'Vendas',       emoji: '🛒' },
  { key: 'produtos',     label: 'Produtos',     emoji: '📦' },
  { key: 'estoque',      label: 'Estoque',      emoji: '🏭' },
  { key: 'clientes',     label: 'Clientes',     emoji: '👥' },
  { key: 'fornecedores', label: 'Fornecedores', emoji: '🚚' },
  { key: 'financeiro',   label: 'Financeiro',   emoji: '💰' },
  { key: 'relatorios',   label: 'Relatórios',   emoji: '📈' },
]

export default function App() {
  const [config, setConfig]             = useState(getConfig)
  const [tela, setTela]                 = useState('dashboard')
  const [produtos, setProdutos]         = useState(getProdutos)
  const [clientes, setClientes]         = useState(getClientes)
  const [fornecedores, setFornecedores] = useState(getFornecedores)
  const [vendas, setVendas]             = useState(getVendas)
  const [movimentos, setMovimentos]     = useState(getMovimentos)
  const [contas, setContas]             = useState(getContas)
  const [modal, setModal]               = useState(null)

  if (!config) {
    return <Setup onConcluir={(dados) => { saveConfig(dados); setConfig(dados) }} />
  }

  // helpers
  const atualizarProdutos = (novos) => { setProdutos(novos); saveProdutos(novos) }
  const atualizarClientes = (novos) => { setClientes(novos); saveClientes(novos) }
  const atualizarFornecedores = (novos) => { setFornecedores(novos); saveFornecedores(novos) }
  const atualizarVendas = (novas) => { setVendas(novas); saveVendas(novas) }
  const atualizarMovimentos = (novos) => { setMovimentos(novos); saveMovimentos(novos) }
  const atualizarContas = (novas) => { setContas(novas); saveContas(novas) }

  const confirmarExclusao = (mensagem, onConfirmar) => setModal({ mensagem, onConfirmar: () => { onConfirmar(); setModal(null) } })

  const registrarVenda = (venda) => {
    // desconta estoque
    const novosProdutos = produtos.map(p => {
      const item = venda.itens.find(i => i.produtoId === p.id)
      if (!item) return p
      return { ...p, estoque: Math.max(0, p.estoque - item.quantidade) }
    })
    atualizarProdutos(novosProdutos)

    // salva venda
    const novaVenda = { id: Date.now(), ...venda, data: hoje(), hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
    atualizarVendas([novaVenda, ...vendas])

    // se fiado, gera conta a receber
    if (venda.formaPagamento === 'Fiado' && venda.clienteId) {
      const parcelas = venda.parcelas || 1
      const valorParcela = venda.total / parcelas
      const novasContas = []
      for (let i = 0; i < parcelas; i++) {
        const venc = new Date()
        venc.setDate(venc.getDate() + (i + 1) * 30)
        novasContas.push({ id: Date.now() + i, vendaId: novaVenda.id, clienteId: venda.clienteId, clienteNome: venda.clienteNome, valor: valorParcela, vencimento: venc.toLocaleDateString('pt-BR'), status: 'pendente', parcela: `${i + 1}/${parcelas}` })
      }
      atualizarContas([...novasContas, ...contas])
      // atualiza saldo devedor do cliente
      const novosClientes = clientes.map(c => c.id === venda.clienteId ? { ...c, saldoDevedor: (c.saldoDevedor || 0) + venda.total } : c)
      atualizarClientes(novosClientes)
    }
  }

  const registrarMovimento = (movimento) => {
    const novosProdutos = produtos.map(p => {
      if (p.id !== movimento.produtoId) return p
      const delta = movimento.tipo === 'entrada' ? movimento.quantidade : -movimento.quantidade
      return { ...p, estoque: Math.max(0, p.estoque + delta) }
    })
    atualizarProdutos(novosProdutos)
    atualizarMovimentos([{ id: Date.now(), ...movimento, data: hoje() }, ...movimentos])
  }

  const quitarConta = (contaId) => {
    const conta = contas.find(c => c.id === contaId)
    if (!conta) return
    const novasContas = contas.map(c => c.id === contaId ? { ...c, status: 'pago', pagoEm: hoje() } : c)
    atualizarContas(novasContas)
    const novosClientes = clientes.map(c => c.id === conta.clienteId ? { ...c, saldoDevedor: Math.max(0, (c.saldoDevedor || 0) - conta.valor) } : c)
    atualizarClientes(novosClientes)
  }

  const alertasEstoque = produtos.filter(p => p.estoque <= p.estoqueMinimo).length

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>

      {/* Sidebar */}
      <div style={{ width: '220px', background: 'var(--bg-layer-01)', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 50 }}>

        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="22" height="22" viewBox="0 0 100 100" fill="none">
              <g transform="rotate(90,50,50)">
                <path d="M25 22L8 50L25 78" stroke="#2ecc71" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M75 22L92 50L75 78" stroke="#2ecc71" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M63 10L37 90" stroke="#2ecc71" strokeWidth="11" strokeLinecap="round"/>
              </g>
            </svg>
            <div>
              <p style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1 }}>
                sistematiza<span style={{ color: 'var(--brand)' }}>.ai</span>
              </p>
              <p style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>ERP</p>
            </div>
          </div>
          <div style={{ marginTop: '10px', padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
            <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{config.nome}</p>
            <p style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '1px' }}>
              {config.tipo === 'mercado' ? '🛒' : config.tipo === 'farmacia' ? '💊' : config.tipo === 'papelaria' ? '📚' : config.tipo === 'pet' ? '🐾' : '🏪'} {config.tipo.charAt(0).toUpperCase() + config.tipo.slice(1)}
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
          {navItems.map(item => {
            const ativo = tela === item.key
            const badge = item.key === 'estoque' && alertasEstoque > 0 ? alertasEstoque : null
            return (
              <button key={item.key} onClick={() => setTela(item.key)}
                style={{ width: '100%', background: ativo ? 'var(--brand-light)' : 'transparent', border: 'none', borderRadius: 'var(--radius-md)', padding: '9px 12px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px', transition: 'background 0.15s' }}
                onMouseEnter={e => { if (!ativo) e.currentTarget.style.background = 'var(--bg-layer-02)' }}
                onMouseLeave={e => { if (!ativo) e.currentTarget.style.background = 'transparent' }}>
                <span style={{ fontSize: '15px' }}>{item.emoji}</span>
                <span style={{ fontSize: '13px', fontWeight: ativo ? '600' : '400', color: ativo ? 'var(--brand)' : 'var(--text-primary)', flex: 1 }}>{item.label}</span>
                {badge && (
                  <span style={{ background: '#DC2626', color: '#fff', fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: 'var(--radius-full)', minWidth: '18px', textAlign: 'center' }}>{badge}</span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Footer sidebar */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid var(--border-subtle)' }}>
          <p style={{ fontSize: '10px', color: 'var(--text-placeholder)', textAlign: 'center' }}>Powered by sistematiza.ai</p>
        </div>
      </div>

      {/* Main content */}
      <div style={{ marginLeft: '220px', flex: 1, minHeight: '100vh' }}>
        {modal && <Modal mensagem={modal.mensagem} onConfirmar={modal.onConfirmar} onCancelar={() => setModal(null)} />}

        {tela === 'dashboard' && (
          <Dashboard produtos={produtos} vendas={vendas} contas={contas} clientes={clientes} onNavegar={setTela} />
        )}
        {tela === 'vendas' && (
          <Vendas produtos={produtos} clientes={clientes} onRegistrarVenda={registrarVenda} />
        )}
        {tela === 'produtos' && (
          <Produtos produtos={produtos} onAtualizar={atualizarProdutos} onExcluir={(id) => confirmarExclusao('Deseja excluir este produto?', () => atualizarProdutos(produtos.filter(p => p.id !== id)))} />
        )}
        {tela === 'estoque' && (
          <Estoque produtos={produtos} movimentos={movimentos} onRegistrarMovimento={registrarMovimento} />
        )}
        {tela === 'clientes' && (
          <Clientes clientes={clientes} vendas={vendas} onAtualizar={atualizarClientes} onExcluir={(id) => confirmarExclusao('Deseja excluir este cliente?', () => atualizarClientes(clientes.filter(c => c.id !== id)))} />
        )}
        {tela === 'fornecedores' && (
          <Fornecedores fornecedores={fornecedores} onAtualizar={atualizarFornecedores} onExcluir={(id) => confirmarExclusao('Deseja excluir este fornecedor?', () => atualizarFornecedores(fornecedores.filter(f => f.id !== id)))} />
        )}
        {tela === 'financeiro' && (
          <Financeiro contas={contas} clientes={clientes} onQuitar={quitarConta} />
        )}
        {tela === 'relatorios' && (
          <Relatorios vendas={vendas} produtos={produtos} contas={contas} />
        )}
      </div>
    </div>
  )
}