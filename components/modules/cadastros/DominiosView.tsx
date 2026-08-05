'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, Database, ChevronRight, Pencil, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { InfoTip } from '@/components/ui/InfoTip'
import { PageHeader } from '@/components/ui/PageHeader'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { FormModal } from '@/components/ui/FormModal'

interface Props { tenantSlug: string }

export default function DominiosView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/dominios`

  const [selecionado, setSelecionado]         = useState<string | null>(null)
  const [novoValor, setNovoValor]             = useState('')
  const [editandoId, setEditandoId]           = useState<number | null>(null)
  const [editandoValor, setEditandoValor]     = useState('')
  const [confirmDelete, setConfirmDelete]     = useState<{ id: number; valor: string } | null>(null)
  const [showNovoDominio, setShowNovoDominio] = useState(false)
  const [novoCodigo, setNovoCodigo]           = useState('')
  const [novoNome, setNovoNome]               = useState('')
  const [novaDescricao, setNovaDescricao]     = useState('')

  const { data: listData, isLoading } = useQuery({
    queryKey: ['dominios-list', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
  })

  const { data: dominioData } = useQuery({
    queryKey: ['dominio-detalhe', tenantSlug, selecionado],
    queryFn:  async () => (await fetch(`${api}/${selecionado}`)).json(),
    enabled:  !!selecionado,
  })

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ['dominios-list', tenantSlug] })
    qc.invalidateQueries({ queryKey: ['dominio-detalhe', tenantSlug, selecionado] })
    qc.invalidateQueries({ queryKey: ['dominio', tenantSlug] })
  }

  const addValorMut = useMutation({
    mutationFn: () => fetch(`${api}/${selecionado}/valores`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor: novoValor.trim() }),
    }).then(r => r.json()),
    onSuccess: () => { invalidateAll(); setNovoValor(''); toast('Valor adicionado!') },
    onError:   () => toast('Erro ao adicionar.', 'error'),
  })

  const updateValorMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${selecionado}/valores/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor: editandoValor.trim() }),
    }).then(r => r.json()),
    onSuccess: () => { invalidateAll(); setEditandoId(null); toast('Valor atualizado!') },
    onError:   () => toast('Erro ao atualizar.', 'error'),
  })

  const deleteValorMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${selecionado}/valores/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { invalidateAll(); toast('Valor removido.') },
    onError:   () => toast('Erro ao remover.', 'error'),
  })

  const criarDominioMut = useMutation({
    mutationFn: () => fetch(api, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: novoCodigo, nome: novoNome.trim(), descricao: novaDescricao.trim() || undefined }),
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dominios-list', tenantSlug] })
      // O painel NÃO fecha ao salvar. Aqui a tabela recém-criada já vira a
      // selecionada, para você cadastrar os valores dela em seguida — que é
      // sempre o passo seguinte.
      setSelecionado(novoCodigo)
      setNovoCodigo(''); setNovoNome(''); setNovaDescricao('')
      toast('Tabela criada! Agora cadastre os valores dela.')
    },
    onError: () => toast('Erro ao criar tabela. O código pode já existir.', 'error'),
  })

  const dominios = Array.isArray(listData?.data) ? listData.data : []
  const dominio  = dominioData?.data ?? null

  return (
    <div>
      <PageHeader
        titulo="Domínios"
        acoes={
          <Button onClick={() => setShowNovoDominio(true)}>
            <Plus size={15} className="mr-1.5" /> Nova tabela
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lista lateral */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tabelas disponíveis</p>
          </div>
          {isLoading ? (
            <div className="p-6 text-center text-sm text-gray-400">Carregando...</div>
          ) : dominios.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">Nenhuma tabela. Execute a migration primeiro.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {dominios.map((dom: any) => (
                <button key={dom.dominioId} onClick={() => setSelecionado(dom.codigo)}
                  className={`w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors ${
                    selecionado === dom.codigo
                      ? 'bg-green-50 border-l-2 border-green-500 pl-[14px]'
                      : 'hover:bg-gray-50'
                  }`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{dom.nome}</p>
                      {dom.sistema && <Badge variant="outline" className="text-[9px] px-1 py-0">sistema</Badge>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {dom.totalValores} valores · <span className="font-mono">{dom.codigo}</span>
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 flex-shrink-0 ml-2" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Painel de valores */}
        <div className="lg:col-span-2">
          {!selecionado ? (
            <div className="bg-white rounded-xl border border-gray-100 flex flex-col items-center justify-center h-64 text-center px-4">
              <Database size={28} className="text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">Selecione uma tabela</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <p className="text-base font-semibold text-gray-900">{dominio?.nome ?? selecionado}</p>
                {dominio?.descricao && <p className="text-xs text-gray-400 mt-0.5">{dominio.descricao}</p>}
                <p className="text-xs text-gray-300 mt-1 font-mono">{dominio?.codigo}</p>
              </div>

              {/* Adicionar novo valor */}
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                <p className="text-xs font-medium text-gray-500 mb-2 inline-flex items-center gap-1">
                  Adicionar novo valor
                  <InfoTip titulo="Atalho">
                    Pressione Enter no campo para adicionar sem tirar a mão do teclado.
                  </InfoTip>
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Digite o novo valor..."
                    value={novoValor}
                    onChange={e => setNovoValor(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && novoValor.trim()) addValorMut.mutate() }}
                    className="h-9 text-sm"
                    autoFocus
                  />
                  <Button size="sm" onClick={() => addValorMut.mutate()}
                    disabled={!novoValor.trim() || addValorMut.isPending}>
                    <Plus size={14} className="mr-1" /> Adicionar
                  </Button>
                </div>
              </div>

              {/* Lista de valores */}
              {!dominio?.valores?.length ? (
                <div className="px-5 py-10 text-center text-sm text-gray-400">
                  Nenhum valor cadastrado. Adicione o primeiro acima.
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {dominio.valores.map((v: any, i: number) => (
                    <div key={v.valorId} className="group flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors">
                      <span className="text-xs text-gray-300 w-5 text-right flex-shrink-0">{i + 1}</span>

                      {editandoId === v.valorId ? (
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            value={editandoValor}
                            onChange={e => setEditandoValor(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') updateValorMut.mutate(v.valorId)
                              if (e.key === 'Escape') setEditandoId(null)
                            }}
                            className="h-7 text-sm py-0" autoFocus
                          />
                          <button onClick={() => updateValorMut.mutate(v.valorId)} className="text-green-500 hover:text-green-700">
                            <Check size={14} />
                          </button>
                          <button onClick={() => setEditandoId(null)} className="text-gray-400 hover:text-gray-600">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm font-medium text-gray-900 flex-1">{v.valor}</span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <BotaoIcone titulo="Editar valor" variante="info"
                              onClick={() => { setEditandoId(v.valorId); setEditandoValor(v.valor) }}>
                              <Pencil size={12} />
                            </BotaoIcone>
                            <BotaoIcone titulo="Remover valor" variante="perigo"
                              onClick={() => setConfirmDelete({ id: v.valorId, valor: v.valor })}>
                              <Trash2 size={13} />
                            </BotaoIcone>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/30">
                <p className="text-xs text-gray-400 inline-flex items-center gap-1">
                  {dominio?.valores?.length ?? 0} valor(es)
                  <InfoTip titulo="Onde estes valores aparecem">
                    Alimentam os campos de seleção do sistema. Qualquer alteração aqui
                    reflete imediatamente nos formulários que usam esta lista.
                  </InfoTip>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Painel nova tabela */}
      {showNovoDominio && (
        <FormModal
          titulo="Nova tabela de domínio"
          onClose={() => setShowNovoDominio(false)}
          largura="max-w-md"
        >
          <div className="p-6 space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input value={novoNome} onChange={e => setNovoNome(e.target.value)} className="mt-1"
                placeholder="Ex: Tipos de Pedido" autoFocus />
            </div>
            <div>
              <Label className="inline-flex items-center gap-1">
                Código interno *
                <InfoTip titulo="Código interno">
                  É como o sistema identifica esta lista no código. Aceita apenas letras
                  minúsculas, números e underline — e <strong>não pode ser alterado depois</strong>.
                </InfoTip>
              </Label>
              <Input
                value={novoCodigo}
                onChange={e => setNovoCodigo(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                className="mt-1 font-mono"
                placeholder="Ex: tipo_pedido" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={novaDescricao} onChange={e => setNovaDescricao(e.target.value)} className="mt-1"
                placeholder="Onde esta tabela é usada (opcional)" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowNovoDominio(false)}>Fechar</Button>
              <Button onClick={() => criarDominioMut.mutate()}
                disabled={!novoNome.trim() || !novoCodigo.trim() || criarDominioMut.isPending}>
                {criarDominioMut.isPending ? 'Criando...' : 'Criar tabela'}
              </Button>
            </div>
          </div>
        </FormModal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Remover valor"
          message={`Remover "${confirmDelete.valor}"? Registros que já usam este valor não serão afetados.`}
          confirmLabel="Remover" danger
          onConfirm={() => { deleteValorMut.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}