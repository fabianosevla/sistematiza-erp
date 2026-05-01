import { useState } from 'react'

function FormFornecedor({ fornecedor, onSalvar, onCancelar }) {
  const [form, setForm] = useState({
    nome:     fornecedor?.nome     || '',
    telefone: fornecedor?.telefone || '',
    email:    fornecedor?.email    || '',
    cnpj:     fornecedor?.cnpj     || '',
    contato:  fornecedor?.contato  || '',
    endereco: fornecedor?.endereco || '',
    obs:      fornecedor?.obs      || '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '14px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'DM Sans, sans-serif' }
  const labelStyle = { fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }
  const focus = (e) => e.target.style.borderColor = 'var(--brand)'
  const blur  = (e) => e.target.style.borderColor = 'var(--border-subtle)'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(22,22,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, backdropFilter: 'blur(2px)', padding: '24px' }}>
      <div style={{ background: 'var(--bg-layer-01)', borderRadius: 'var(--radius-xl)', padding: '32px', maxWidth: '520px', width: '100%', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', overflowY: 'auto' }}>
        <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>{fornecedor ? 'Editar fornecedor' : 'Novo fornecedor'}</p>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>Preencha os dados do fornecedor</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '24px' }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Nome / Razão social *</label>
            <input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Distribuidora Central" autoFocus style={inputStyle} onFocus={focus} onBlur={blur} />
          </div>
          <div>
            <label style={labelStyle}>CNPJ</label>
            <input value={form.cnpj} onChange={e => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" style={inputStyle} onFocus={focus} onBlur={blur} />
          </div>
          <div>
            <label style={labelStyle}>Contato (pessoa)</label>
            <input value={form.contato} onChange={e => set('contato', e.target.value)} placeholder="Nome do vendedor" style={inputStyle} onFocus={focus} onBlur={blur} />
          </div>
          <div>
            <label style={labelStyle}>Telefone</label>
            <input value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(00) 00000-0000" style={inputStyle} onFocus={focus} onBlur={blur} />
          </div>
          <div>
            <label style={labelStyle}>E-mail</label>
            <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@fornecedor.com" style={inputStyle} onFocus={focus} onBlur={blur} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Endereço</label>
            <input value={form.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, número, cidade..." style={inputStyle} onFocus={focus} onBlur={blur} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Observações</label>
            <textarea value={form.obs} onChange={e => set('obs', e.target.value)} placeholder="Prazo de entrega, condições de pagamento..." rows={3}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} onFocus={focus} onBlur={blur} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onCancelar} style={{ flex: 1, background: 'var(--bg-layer-02)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '14px', cursor: 'pointer', color: 'var(--text-primary)' }}>Cancelar</button>
          <button onClick={() => { if (!form.nome) return alert('Informe o nome!'); onSalvar(form) }}
            style={{ flex: 1, background: 'var(--brand)', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', color: '#fff' }}>
            {fornecedor ? 'Salvar' : 'Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Fornecedores({ fornecedores, onAtualizar, onExcluir }) {
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState(null)

  const filtrados = fornecedores.filter(f =>
    f.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (f.cnpj && f.cnpj.includes(busca)) ||
    (f.contato && f.contato.toLowerCase().includes(busca.toLowerCase()))
  )

  const salvar = (form) => {
    if (editando) {
      onAtualizar(fornecedores.map(f => f.id === editando.id ? { ...editando, ...form } : f))
    } else {
      onAtualizar([...fornecedores, { id: Date.now(), ...form }])
    }
    setShowForm(false)
    setEditando(null)
  }

  return (
    <div style={{ padding: '32px' }}>

      {(showForm || editando) && (
        <FormFornecedor fornecedor={editando} onSalvar={salvar} onCancelar={() => { setShowForm(false); setEditando(null) }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>Fornecedores</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>{fornecedores.length} fornecedor{fornecedores.length !== 1 ? 'es' : ''} cadastrado{fornecedores.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setEditando(null); setShowForm(true) }}
          style={{ background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px 20px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
          + Novo fornecedor
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selecionado ? '1fr 340px' : '1fr', gap: '16px' }}>

        <div>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, CNPJ ou contato..."
            style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '13px', outline: 'none', fontFamily: 'DM Sans, sans-serif', marginBottom: '12px', color: 'var(--text-primary)' }}
            onFocus={e => e.target.style.borderColor = 'var(--brand)'}
            onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'} />

          <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            {filtrados.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🚚</div>
                <p style={{ fontSize: '13px' }}>Nenhum fornecedor encontrado</p>
              </div>
            ) : (
              filtrados.map((f, idx) => {
                const ativo = selecionado?.id === f.id
                return (
                  <div key={f.id} onClick={() => setSelecionado(ativo ? null : f)}
                    style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '14px', borderBottom: idx < filtrados.length - 1 ? '1px solid var(--border-subtle)' : 'none', cursor: 'pointer', background: ativo ? 'var(--brand-light)' : 'transparent', transition: 'background 0.15s' }}
                    onMouseEnter={e => { if (!ativo) e.currentTarget.style.background = 'var(--bg-primary)' }}
                    onMouseLeave={e => { if (!ativo) e.currentTarget.style.background = 'transparent' }}>

                    <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: ativo ? 'var(--brand)' : 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>🚚</div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: '600', color: ativo ? 'var(--brand)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nome}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {[f.contato, f.telefone].filter(Boolean).join(' · ') || 'Sem contato'}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); setEditando(f); setShowForm(true) }}
                        style={{ background: 'var(--bg-layer-02)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', cursor: 'pointer', fontSize: '12px' }}>✏️</button>
                      <button onClick={e => { e.stopPropagation(); onExcluir(f.id) }}
                        style={{ background: 'var(--despesa-bg)', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)', padding: '5px 8px', cursor: 'pointer', fontSize: '12px' }}>🗑️</button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Detalhe fornecedor */}
        {selecionado && (
          <div style={{ background: 'var(--bg-layer-01)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px', alignSelf: 'start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '14px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', background: 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>🚚</div>
              <div>
                <p style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>{selecionado.nome}</p>
                {selecionado.cnpj && <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{selecionado.cnpj}</p>}
              </div>
            </div>
            {[
              { label: 'Contato',   valor: selecionado.contato  || '—' },
              { label: 'Telefone',  valor: selecionado.telefone || '—' },
              { label: 'E-mail',    valor: selecionado.email    || '—' },
              { label: 'Endereço',  valor: selecionado.endereco || '—' },
              { label: 'Observações', valor: selecionado.obs    || '—' },
            ].map(i => (
              <div key={i.label}>
                <p style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-placeholder)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{i.label}</p>
                <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{i.valor}</p>
              </div>
            ))}
            <button onClick={() => { setEditando(selecionado); setShowForm(true) }}
              style={{ width: '100%', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', marginTop: '4px' }}>
              ✏️ Editar fornecedor
            </button>
          </div>
        )}
      </div>
    </div>
  )
}