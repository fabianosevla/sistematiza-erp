'use client'
// components/modules/perfis/PerfisView.tsx

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, Shield, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'

interface Props { tenantSlug: string }

// ── Configurações dos campos ──────────────────────────────────────────────────

const AMBIENTES = [
  { key: 'acessoGerencial', label: 'Gerencial',   desc: 'Acesso ao ERP completo' },
  { key: 'acessoPdv',       label: 'PDV',          desc: 'Ponto de venda' },
  { key: 'acessoComanda',   label: 'Comanda',      desc: 'Comanda eletrônica mobile' },
  { key: 'acessoDelivery',  label: 'Delivery',     desc: 'Gestão de entregas' },
] as const

const MODULOS = [
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
  { key: 'moduloMetas',      label: 'Metas' },
  { key: 'moduloUsuarios',   label: 'Usuários' },
] as const

// ── Estado inicial do form ────────────────────────────────────────────────────

function estadoInicial() {
  return {
    nome: '', descricao: '',
    isAdmin: false,
    acessoGerencial: false, acessoPdv: false, acessoComanda: false, acessoDelivery: false,
    moduloDashboard: true, moduloCadastros: true, moduloVendas: true,
    moduloFinanceiro: false, moduloEstoque: false, moduloProducao: false,
    moduloPedidos: false, moduloComandas: false, moduloConsultas: false,
    moduloFiscal: false, moduloPlanoAcao: false, moduloMetas: false, moduloUsuarios: false,
    percDescontoMax: 0, valorDescontoMax: 0,
  }
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function PerfisView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/perfis`

  const [showModal, setShowModal]         = useState(false)
  const [editando, setEditando]           = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; nome: string } | null>(null)
  const [form, setForm]                   = useState(estadoInicial())

  const invalidate = () => qc.invalidateQueries({ queryKey: ['perfis', tenantSlug] })

  const { data: raw, isLoading } = useQuery({
    queryKey: ['perfis', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
  })

  const salvarMut = useMutation({
    mutationFn: async () => {
      const url    = editando ? `${api}/${editando.perfilId}` : api
      const method = editando ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: () => { invalidate(); fecharModal(); toast(editando ? 'Perfil atualizado!' : 'Perfil criado!') },
    onError:   (e: any) => toast(e.message || 'Erro ao salvar.', 'error'),
  })

  const excluirMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { invalidate(); toast('Perfil excluído.') },
    onError:   (e: any) => toast(e.message || 'Erro ao excluir.', 'error'),
  })

  function abrirModal(item?: any) {
    if (item) {
      setEditando(item)
      setForm({
        nome: item.nome, descricao: item.descricao ?? '',
        isAdmin: item.isAdmin,
        acessoGerencial: item.acessoGerencial, acessoPdv: item.acessoPdv,
        acessoComanda: item.acessoComanda, acessoDelivery: item.acessoDelivery,
        moduloDashboard: item.moduloDashboard, moduloCadastros: item.moduloCadastros,
        moduloVendas: item.moduloVendas, moduloFinanceiro: item.moduloFinanceiro,
        moduloEstoque: item.moduloEstoque, moduloProducao: item.moduloProducao,
        moduloPedidos: item.moduloPedidos, moduloComandas: item.moduloComandas,
        moduloConsultas: item.moduloConsultas, moduloFiscal: item.moduloFiscal,
        moduloPlanoAcao: item.moduloPlanoAcao, moduloMetas: item.moduloMetas,
        moduloUsuarios: item.moduloUsuarios,
        percDescontoMax: parseFloat(item.percDescontoMax ?? '0'),
        valorDescontoMax: item.valorDescontoMax ?? 0,
      })
    } else {
      setEditando(null)
      setForm(estadoInicial())
    }
    setShowModal(true)
  }

  function fecharModal() { setShowModal(false); setEditando(null); setForm(estadoInicial()) }

  function toggle(key: string) {
    setForm(prev => ({ ...prev, [key]: !(prev as any)[key] }))
  }

  // Quando isAdmin muda, sincroniza tudo
  function toggleAdmin() {
    const novoAdmin = !form.isAdmin
    if (novoAdmin) {
      setForm(prev => ({
        ...prev, isAdmin: true,
        acessoGerencial: true, acessoPdv: true, acessoComanda: true, acessoDelivery: true,
        moduloDashboard: true, moduloCadastros: true, moduloVendas: true,
        moduloFinanceiro: true, moduloEstoque: true, moduloProducao: true,
        moduloPedidos: true, moduloComandas: true, moduloConsultas: true,
        moduloFiscal: true, moduloPlanoAcao: true, moduloMetas: true, moduloUsuarios: true,
        percDescontoMax: 100,
      }))
    } else {
      setForm(prev => ({ ...prev, isAdmin: false }))
    }
  }

  const perfis = Array.isArray(raw?.data) ? raw.data : []

  function fmt(c: number) {
    return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Perfis de Acesso</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Defina quais ambientes e módulos cada tipo de usuário pode acessar
          </p>
        </div>
        <Button onClick={() => abrirModal()}>
          <Plus size={15} className="mr-1.5" /> Novo perfil
        </Button>
      </div>

      {/* Lista */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? (
          <p className="text-sm text-gray-400 col-span-3 text-center py-12">Carregando...</p>
        ) : perfis.length === 0 ? (
          <p className="text-sm text-gray-400 col-span-3 text-center py-12">
            Nenhum perfil cadastrado. Execute a migration primeiro.
          </p>
        ) : perfis.map((p: any) => {
          const ambientesAtivos = AMBIENTES.filter(a => p[a.key])
          const modulosAtivos   = MODULOS.filter(m => p[m.key])
          return (
            <div
              key={p.perfilId}
              className="bg-white rounded-xl border border-gray-100 p-5 hover:border-green-200 transition-colors group"
            >
              {/* Nome + badges */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${p.isAdmin ? 'bg-green-100' : 'bg-gray-100'}`}>
                    <Shield size={14} className={p.isAdmin ? 'text-green-600' : 'text-gray-400'} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{p.nome}</p>
                    {p.isAdmin && (
                      <span className="text-[10px] text-green-600 font-medium">Acesso completo</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => abrirModal(p)}
                    className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                  >
                    <Shield size={13} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete({ id: p.perfilId, nome: p.nome })}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {p.descricao && (
                <p className="text-xs text-gray-400 mb-3">{p.descricao}</p>
              )}

              {/* Ambientes */}
              <div className="mb-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Ambientes
                </p>
                <div className="flex flex-wrap gap-1">
                  {ambientesAtivos.length === 0 ? (
                    <span className="text-xs text-gray-300">Nenhum</span>
                  ) : ambientesAtivos.map(a => (
                    <span key={a.key} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded-full">
                      <Check size={9} /> {a.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Módulos */}
              {!p.isAdmin && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    Módulos no Gerencial
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {modulosAtivos.length === 0 ? (
                      <span className="text-xs text-gray-300">Nenhum</span>
                    ) : modulosAtivos.map(m => (
                      <span key={m.key} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded">
                        {m.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Limites */}
              {(parseFloat(p.percDescontoMax) > 0 || p.valorDescontoMax > 0) && (
                <div className="pt-3 border-t border-gray-50">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    Limite de desconto
                  </p>
                  <p className="text-xs text-gray-600">
                    {parseFloat(p.percDescontoMax) > 0 && `${p.percDescontoMax}%`}
                    {parseFloat(p.percDescontoMax) > 0 && p.valorDescontoMax > 0 && ' · '}
                    {p.valorDescontoMax > 0 && fmt(p.valorDescontoMax)}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Modal criar/editar ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl mx-4 max-h-[90vh] flex flex-col">

            <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold">{editando ? 'Editar perfil' : 'Novo perfil'}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Configure os acessos deste perfil</p>
              </div>
              <button onClick={fecharModal} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* Nome */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nome do perfil *</Label>
                  <Input
                    value={form.nome}
                    onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))}
                    className="mt-1" placeholder="Ex: Operador de Caixa" autoFocus
                  />
                </div>
                <div className="col-span-2">
                  <Label>Descrição</Label>
                  <Input
                    value={form.descricao}
                    onChange={e => setForm(prev => ({ ...prev, descricao: e.target.value }))}
                    className="mt-1" placeholder="Descreva o perfil..."
                  />
                </div>
              </div>

              {/* Admin toggle */}
              <div
                onClick={toggleAdmin}
                className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${
                  form.isAdmin ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100 hover:border-gray-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Shield size={18} className={form.isAdmin ? 'text-green-600' : 'text-gray-400'} />
                  <div>
                    <p className={`text-sm font-semibold ${form.isAdmin ? 'text-green-700' : 'text-gray-700'}`}>
                      Acesso total (Gerencial completo)
                    </p>
                    <p className="text-xs text-gray-400">Libera todos os ambientes e módulos automaticamente</p>
                  </div>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${form.isAdmin ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${form.isAdmin ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
              </div>

              {!form.isAdmin && (
                <>
                  {/* Ambientes */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Ambientes disponíveis na tela de seleção
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {AMBIENTES.map(a => (
                        <div
                          key={a.key}
                          onClick={() => toggle(a.key)}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            (form as any)[a.key]
                              ? 'bg-green-50 border-green-200'
                              : 'bg-gray-50 border-gray-100 hover:border-gray-200'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
                            (form as any)[a.key] ? 'bg-green-500' : 'bg-gray-200'
                          }`}>
                            {(form as any)[a.key] && <Check size={10} className="text-white" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-800">{a.label}</p>
                            <p className="text-xs text-gray-400">{a.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Módulos no Gerencial */}
                  {form.acessoGerencial && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Módulos visíveis no Gerencial
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {MODULOS.map(m => (
                          <div
                            key={m.key}
                            onClick={() => toggle(m.key)}
                            className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm ${
                              (form as any)[m.key]
                                ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium'
                                : 'bg-gray-50 border-gray-100 text-gray-500 hover:border-gray-200'
                            }`}
                          >
                            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 ${
                              (form as any)[m.key] ? 'bg-blue-500' : 'bg-gray-200'
                            }`}>
                              {(form as any)[m.key] && <Check size={9} className="text-white" />}
                            </div>
                            {m.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Limites de desconto */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Limites operacionais
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Desconto máximo (%)</Label>
                        <Input
                          type="number" min="0" max="100" step="0.5"
                          value={form.percDescontoMax}
                          onChange={e => setForm(prev => ({ ...prev, percDescontoMax: parseFloat(e.target.value) || 0 }))}
                          className="mt-1"
                        />
                        <p className="text-xs text-gray-400 mt-1">0 = sem desconto permitido</p>
                      </div>
                      <div>
                        <Label>Desconto máximo (R$)</Label>
                        <Input
                          type="number" min="0" step="0.01"
                          value={form.valorDescontoMax > 0 ? (form.valorDescontoMax / 100).toFixed(2) : ''}
                          onChange={e => setForm(prev => ({ ...prev, valorDescontoMax: Math.round(parseFloat(e.target.value || '0') * 100) }))}
                          className="mt-1" placeholder="0,00"
                        />
                        <p className="text-xs text-gray-400 mt-1">0 = sem limite por valor</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-100 flex-shrink-0">
              <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
              <Button
                onClick={() => salvarMut.mutate()}
                disabled={!form.nome || salvarMut.isPending}
              >
                {salvarMut.isPending ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar perfil'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Excluir perfil"
          message={`Excluir "${confirmDelete.nome}"? Usuários vinculados a este perfil perderão o acesso.`}
          confirmLabel="Excluir" danger
          onConfirm={() => { excluirMut.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}