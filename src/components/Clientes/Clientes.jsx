import { useState } from 'react'
import { fmt } from '../../data/storage'

function FormCliente({ cliente, onSalvar, onCancelar }) {
  const [form, setForm] = useState({
    nome:     cliente?.nome     || '',
    telefone: cliente?.telefone || '',
    email:    cliente?.email    || '',
    cpf:      cliente?.cpf      || '',
    endereco: cliente?.endereco || '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '14px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle = { fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }
  const focus = (e) => e.target.style.borderColor = 'var(--brand)'
  const blur  = (e) => e.target.style.borderColor = 'var(--border-subtle)'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(22,22,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, backdropFilter: 'blur(2px)', padding: '24px' }}>
      <div style={{ background: 'var(--bg-layer-01)', borderRadius: 'var(--radius-xl)', padding: '32px', maxWidth: '480px', width: '100%', boxShadow: 'var(--shadow-lg)' }}>
        <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>{cliente ? 'Editar cliente' : 'Novo cliente'}</p>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>Preencha os dados do cliente</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '24px' }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Nome *</label>
            <input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome completo" autoFocus style={inputStyle} onFocus={focus} onBlur={blur} />
          </div>
          <div>
            <label style={labelStyle}>Telefone</label>
            <input value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(00) 00000-0000" style={inputStyle} onFocus={focus} onBlur={blur} />
          </div>
          <div>
            <label style={labelStyle}>CPF</label>
            <input value={form.cpf} onChange={e => set('cpf', e.target.value)} placeholder="000.000.000-00" style={inputStyle} onFocus={focus} onBlur={blur} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>E-mail</label>
            <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" style={inputStyle} onFocus={focus} onBlur={blur} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Endereço</label>
            <input value={form.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, número, bairro..." style={inputStyle} onFocus={focus} onBlur={blur} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onCancelar} style={{ flex: 1, background: 'var(--bg-layer-02)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '14px', cursor: 'pointer', color: 'var(--text-primary)' }}>Cancelar</button>
          <button onClick={() => { if (!form.nome) return alert('Informe o nome!'); onSalvar(form) }}
            style={{ flex: 1, background: 'var(--brand)', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', color: '#fff' }}>
            {cliente ? 'Salvar' : 'Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Clientes({ clientes, vendas, onAtualizar, onExcluir }) {
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState(null)

  const filtrados = clientes.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (c.telefone && c.telefone.includes(busca)) ||
    (c.cpf && c.cpf.includes(busca))
  )

  const salvar = (form) => {
    if (editando) {
      onAtualizar(clientes.map(c => c.id === editando.id ? { ...editando, ...form } : c))
    } else {
      onAtualizar([...clientes, { id: Date.now(), saldoDevedor: 0, ...form }])
    }
    setShowForm(false)
    setEditando(null)
  }

  const clienteVendas = selecionado ? vendas.filter(v => v.clienteId === selecionado.id) : []
  const totalComprado = clienteVendas.reduce((acc, v) => acc + v.total, 0)

  return (
    <div style={{ padding: '32px' }}>

      {(showForm || editando) && (
        <FormCliente cliente={editando} onSalvar={salvar} onCancelar={() => { setShowForm(false); setEditando(null) }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>Clientes</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>{clientes.length} cliente{clientes.length !== 1 ? 's' : ''} cadastrado{clientes.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setEditando(null); setShowForm(true) }}
          style={{ background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px 20px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
          + Novo cliente
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selecionado ? '1fr 360px' : '1fr', gap: '16px' }}>

        {/* Lista */}
        <div>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, telefone ou CPF..."
            style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '13px', outline: 'none', fontFamily: 'DM Sans, sans-serif', marginBottom: '12px', color: 'var(--text-primary)' }}
            onFocus={e => e.target.style.borderColor = 'var(--brand)'}
            onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'} />

          <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            {filtrados.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>👥</div>
                <p style={{ fontSize: '13px' }}>Nenhum cliente encontrado</p>
              </div>
            ) : (
              filtrados.map((c, idx) => {
                const ativo = selecionado?.id === c.id
                return (
                  <div key={c.id}
                    onClick={() => setSelecionado(ativo ? null : c)}
                    style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '14px', borderBottom: idx < filtrados.length - 1 ? '1px solid var(--border-subtle)' : 'none', cursor: 'pointer', background: ativo ? 'var(--brand-light)' : 'transparent', transition: 'background 0.15s' }}
                    onMouseEnter={e => { if (!ativo) e.currentTarget.style.background = 'var(--bg-primary)' }}
                    onMouseLeave={e => { if (!ativo) e.currentTarget.style.background = 'transparent' }}>

                    <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-full)', background: ativo ? 'var(--brand)' : 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: ativo ? '#fff' : 'var(--brand)', flexShrink: 0 }}>
                      {c.nome.charAt(0).toUpperCase()}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: '600', color: ativo ? 'var(--brand)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {[c.telefone, c.email].filter(Boolean).join(' · ') || 'Sem contato'}
                      </p>
                    </div>

                    {c.saldoDevedor > 0 && (
                      <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: 'var(--radius-full)', background: 'var(--pendente-bg)', color: 'var(--pendente)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        Deve {fmt(c.saldoDevedor)}
                      </span>
                    )}

                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); setEditando(c); setShowForm(true) }}
                        style={{ background: 'var(--bg-layer-02)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', cursor: 'pointer', fontSize: '12px' }}>✏️</button>
                      <button onClick={e => { e.stopPropagation(); onExcluir(c.id) }}
                        style={{ background: 'var(--despesa-bg)', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)', padding: '5px 8px', cursor: 'pointer', fontSize: '12px' }}>🗑️</button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Detalhe cliente */}
        {selecionado && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-full)', background: 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '700', color: 'var(--brand)' }}>
                  {selecionado.nome.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>{selecionado.nome}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{selecionado.telefone || 'Sem telefone'}</p>
                </div>
              </div>
              {[
                { label: 'E-mail',    valor: selecionado.email    || '—' },
                { label: 'CPF',       valor: selecionado.cpf      || '—' },
                { label: 'Endereço',  valor: selecionado.endereco || '—' },
              ].map(i => (
                <div key={i.label} style={{ marginBottom: '10px' }}>
                  <p style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-placeholder)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>{i.label}</p>
                  <p style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{i.valor}</p>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '16px' }}>
                <p style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Total comprado</p>
                <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>{fmt(totalComprado)}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{clienteVendas.length} venda{clienteVendas.length !== 1 ? 's' : ''}</p>
              </div>
              <div style={{ background: selecionado.saldoDevedor > 0 ? 'var(--pendente-bg)' : 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '16px' }}>
                <p style={{ fontSize: '10px', fontWeight: '700', color: selecionado.saldoDevedor > 0 ? 'var(--pendente)' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Saldo devedor</p>
                <p style={{ fontSize: '18px', fontWeight: '700', color: selecionado.saldoDevedor > 0 ? 'var(--pendente)' : 'var(--text-primary)' }}>{fmt(selecionado.saldoDevedor)}</p>
              </div>
            </div>

            {clienteVendas.length > 0 && (
              <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Últimas compras</p>
                </div>
                {clienteVendas.slice(0, 5).map((v, idx) => (
                  <div key={v.id} style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: idx < Math.min(clienteVendas.length, 5) - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <div>
                      <p style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-primary)' }}>{v.formaPagamento}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>{v.data} · {v.itens.length} item{v.itens.length !== 1 ? 's' : ''}</p>
                    </div>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{fmt(v.total)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}