'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, Pencil, Shield, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Button }       from '@/components/ui/button'
import { Input }        from '@/components/ui/input'
import { Label }        from '@/components/ui/label'
import { useToast }     from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

interface Props { tenantSlug: string }

const MODULOS_CONFIG = [
  {
    grupo: 'Acesso',
    itens: [
      { key: 'isAdmin',          label: 'Administrador (acesso total)',  bold: true },
      { key: 'acessoGerencial',  label: 'Acesso Gerencial' },
      { key: 'acessoPdv',        label: 'Acesso PDV' },
      { key: 'acessoComanda',    label: 'Acesso Comandas' },
      { key: 'acessoDelivery',   label: 'Acesso Delivery' },
    ],
  },
  {
    grupo: 'Módulos visíveis na sidebar',
    itens: [
      { key: 'moduloDashboard',  label: 'Dashboard' },
      { key: 'moduloCadastros',  label: 'Cadastros' },
      { key: 'moduloVendas',     label: 'Vendas' },
      { key: 'moduloFinanceiro', label: 'Financeiro' },
      { key: 'moduloEstoque',    label: 'Estoque' },
      { key: 'moduloProducao',   label: 'Produção' },
      { key: 'moduloPedidos',    label: 'Pedidos' },
      { key: 'moduloComandas',   label: 'Comandas' },
      { key: 'moduloConsultas',  label: 'Consultas' },
      { key: 'moduloFiscal',     label: 'Fiscal' },
      { key: 'moduloPlanoAcao',  label: 'Plano de Ação' },
      { key: 'moduloMetas',      label: 'Metas & Simulador' },
      { key: 'moduloUsuarios',   label: 'Usuários & Perfis' },
    ],
  },
]

const DEFAULT_FORM = {
  nome: '', descricao: '',
  isAdmin: false,
  acessoGerencial: false, acessoPdv: true, acessoComanda: false, acessoDelivery: false,
  moduloDashboard: true,  moduloCadastros: true, moduloVendas: true,
  moduloFinanceiro: false, moduloEstoque: false, moduloProducao: false,
  moduloPedidos: false,   moduloComandas: false, moduloConsultas: false,
  moduloFiscal: false,    moduloPlanoAcao: false, moduloMetas: false, moduloUsuarios: false,
  percDescontoMax: 0, valorDescontoMax: 0,
}

export default function PerfisView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/perfis`

  const [showModal, setShowModal]   = useState(false)
  const [editando, setEditando]     = useState<any>(null)
  const [confirmDel, setConfirmDel] = useState<any>(null)
  const [form, setForm]             = useState({ ...DEFAULT_FORM })
  const setF = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const { data: perfisRaw, isLoading } = useQuery({
    queryKey: ['perfis', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
  })

  const salvarMut = useMutation({
    mutationFn: async () => {
      const url    = editando ? `${api}/${editando.perfilId}` : api
      const method = editando ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          percDescontoMax:  Number(form.percDescontoMax),
          valorDescontoMax: Math.round(Number(form.valorDescontoMax) * 100),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao salvar')
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['perfis', tenantSlug] })
      setShowModal(false)
      setEditando(null)
      toast(editando ? 'Perfil atualizado!' : 'Perfil criado!')
    },
    onError: (e: any) => toast(e.message || 'Erro ao salvar.', 'error'),
  })

  const excluirMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${api}/${id}`, { method: 'DELETE' })
      const d   = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao excluir')
      return d
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['perfis', tenantSlug] }); toast('Perfil excluído.') },
    onError:   (e: any) => toast(e.message || 'Erro ao excluir.', 'error'),
  })

  function abrirNovo() {
    setEditando(null)
    setForm({ ...DEFAULT_FORM })
    setShowModal(true)
  }

  function abrirEditar(p: any) {
    setEditando(p)
    setForm({
      nome:             p.nome ?? '',
      descricao:        p.descricao ?? '',
      isAdmin:          p.isAdmin ?? false,
      acessoGerencial:  p.acessoGerencial ?? false,
      acessoPdv:        p.acessoPdv ?? true,
      acessoComanda:    p.acessoComanda ?? false,
      acessoDelivery:   p.acessoDelivery ?? false,
      moduloDashboard:  p.moduloDashboard ?? true,
      moduloCadastros:  p.moduloCadastros ?? true,
      moduloVendas:     p.moduloVendas ?? true,
      moduloFinanceiro: p.moduloFinanceiro ?? false,
      moduloEstoque:    p.moduloEstoque ?? false,
      moduloProducao:   p.moduloProducao ?? false,
      moduloPedidos:    p.moduloPedidos ?? false,
      moduloComandas:   p.moduloComandas ?? false,
      moduloConsultas:  p.moduloConsultas ?? false,
      moduloFiscal:     p.moduloFiscal ?? false,
      moduloPlanoAcao:  p.moduloPlanoAcao ?? false,
      moduloMetas:      p.moduloMetas ?? false,
      moduloUsuarios:   p.moduloUsuarios ?? false,
      percDescontoMax:  Number(p.percDescontoMax ?? 0),
      valorDescontoMax: Number(p.valorDescontoMax ?? 0) / 100,
    })
    setShowModal(true)
  }

  const perfis = Array.isArray(perfisRaw?.data) ? perfisRaw.data : []

  function TagModulo({ ativo, label }: { ativo: boolean; label: string }) {
    if (!ativo) return null
    return (
      <span className="text-[10px] bg-green-50 text-green-700 border border-green-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
        {label}
      </span>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Perfis de Acesso</h1>
          <p className="text-sm text-gray-400 mt-0.5">Defina quais módulos cada perfil pode acessar</p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus size={15} className="mr-1.5" /> Novo perfil
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-sm text-gray-400">Carregando...</div>
      ) : perfis.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Shield size={28} className="text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Nenhum perfil cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {perfis.map((p: any) => (
            <div key={p.perfilId} className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-semibold text-gray-900">{p.nome}</h3>
                    {p.isAdmin && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">Admin</span>
                    )}
                  </div>
                  {p.descricao && <p className="text-sm text-gray-400 mb-3">{p.descricao}</p>}

                  {/* Módulos visíveis */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <TagModulo ativo={p.acessoGerencial}  label="Gerencial" />
                    <TagModulo ativo={p.acessoPdv}        label="PDV" />
                    <TagModulo ativo={p.acessoComanda}    label="Comanda" />
                    <TagModulo ativo={p.acessoDelivery}   label="Delivery" />
                    <TagModulo ativo={p.moduloDashboard}  label="Dashboard" />
                    <TagModulo ativo={p.moduloCadastros}  label="Cadastros" />
                    <TagModulo ativo={p.moduloVendas}     label="Vendas" />
                    <TagModulo ativo={p.moduloFinanceiro} label="Financeiro" />
                    <TagModulo ativo={p.moduloEstoque}    label="Estoque" />
                    <TagModulo ativo={p.moduloProducao}   label="Produção" />
                    <TagModulo ativo={p.moduloPedidos}    label="Pedidos" />
                    <TagModulo ativo={p.moduloComandas}   label="Comandas" />
                    <TagModulo ativo={p.moduloFiscal}     label="Fiscal" />
                    <TagModulo ativo={p.moduloMetas}      label="Metas" />
                    <TagModulo ativo={p.moduloUsuarios}   label="Usuários" />
                  </div>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={() => abrirEditar(p)}>
                    <Pencil size={13} className="mr-1" /> Editar
                  </Button>
                  <button
                    onClick={() => setConfirmDel(p)}
                    className="p-2 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Criar/Editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold">{editando ? `Editar: ${editando.nome}` : 'Novo perfil'}</h2>
              <button onClick={() => { setShowModal(false); setEditando(null) }} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Nome e descrição */}
              <div>
                <Label>Nome do perfil *</Label>
                <Input value={form.nome} onChange={e => setF('nome', e.target.value)} className="mt-1" placeholder="Ex: Vendedor, Caixa, Supervisor" autoFocus />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={form.descricao} onChange={e => setF('descricao', e.target.value)} className="mt-1" placeholder="Opcional" />
              </div>

              {/* Permissões por grupo */}
              {MODULOS_CONFIG.map(grupo => (
                <div key={grupo.grupo}>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{grupo.grupo}</p>
                  <div className="space-y-2 pl-1">
                    {grupo.itens.map(item => (
                      <label key={item.key} className="flex items-center gap-3 cursor-pointer group">
                        <div
                          onClick={() => setF(item.key, !(form as any)[item.key])}
                          className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors cursor-pointer ${
                            (form as any)[item.key]
                              ? 'bg-green-500 border-green-500'
                              : 'border-gray-300 group-hover:border-green-400'
                          }`}
                        >
                          {(form as any)[item.key] && <Check size={12} color="white" strokeWidth={3} />}
                        </div>
                        <span className={`text-sm ${(item as any).bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                          {item.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {/* Desconto máximo */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Limites de Desconto</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Desconto máximo (%)</Label>
                    <Input type="number" min="0" max="100" value={form.percDescontoMax}
                      onChange={e => setF('percDescontoMax', Number(e.target.value))} className="mt-1" placeholder="0" />
                  </div>
                  <div>
                    <Label>Valor máximo de desconto (R$)</Label>
                    <Input type="number" min="0" step="0.01" value={form.valorDescontoMax}
                      onChange={e => setF('valorDescontoMax', Number(e.target.value))} className="mt-1" placeholder="0,00" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-100 flex-shrink-0">
              <Button variant="outline" onClick={() => { setShowModal(false); setEditando(null) }}>Cancelar</Button>
              <Button onClick={() => salvarMut.mutate()} disabled={!form.nome || salvarMut.isPending}>
                {salvarMut.isPending ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar perfil'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <ConfirmModal
          title="Excluir perfil"
          message={`Excluir o perfil "${confirmDel.nome}"? Usuários vinculados a este perfil perderão as configurações.`}
          confirmLabel="Excluir"
          danger
          onConfirm={() => { excluirMut.mutate(confirmDel.perfilId); setConfirmDel(null) }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  )
}