'use client'
// ESTE ARQUIVO VAI EM: components/modules/fiscal/PerfisTributariosTab.tsx
//
// PARAMETRIZAÇÃO FISCAL — a tela onde o contador digita.
//
// Duas partes: em cima, o que ainda falta para a empresa emitir; embaixo, os
// perfis tributários.
//
// O painel de pendências fica no topo porque é a pergunta que quem implanta faz
// primeiro — "por que a nota não sai?" — e porque, sem ele, a resposta exigiria
// abrir cinco telas e conferir campo por campo.
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InfoTip } from '@/components/ui/InfoTip'
import { SidePanel } from '@/components/ui/SidePanel'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { useToast } from '@/components/ui/Toast'

interface Props { tenantSlug: string }

const VAZIO = {
  nome: '', descricao: '',
  cfopInterno: '', cfopInterestadual: '',
  csosn: '', cstIcms: '', aliqIcms: '0', redBaseIcms: '0',
  temSt: false, mva: '0', aliqIcmsSt: '0',
  cstPis: '', aliqPis: '0', cstCofins: '', aliqCofins: '0',
  cstIpi: '', aliqIpi: '0', infoAdicional: '',
}

export default function PerfisTributariosTab({ tenantSlug }: Props) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const api = `/api/${tenantSlug}/fiscal/perfis`

  const [painel, setPainel]   = useState(false)
  const [editando, setEdit]   = useState<any | null>(null)
  const [form, setForm]       = useState({ ...VAZIO })
  const [confirmDel, setDel]  = useState<any | null>(null)
  const setF = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const { data, isLoading } = useQuery({
    queryKey: ['perfis-tributarios', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
  })
  const perfis: any[] = data?.data?.perfis ?? []
  const uso: Record<number, number> = data?.data?.uso ?? {}

  const { data: prontRaw } = useQuery({
    queryKey: ['fiscal-prontidao', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/fiscal/prontidao`)).json(),
  })
  const pront = prontRaw?.data

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['perfis-tributarios', tenantSlug] })
    qc.invalidateQueries({ queryKey: ['fiscal-prontidao', tenantSlug] })
  }

  function abrirNovo() { setEdit(null); setForm({ ...VAZIO }); setPainel(true) }
  function abrirEdicao(p: any) {
    setEdit(p)
    setForm({
      nome: p.nome ?? '', descricao: p.descricao ?? '',
      cfopInterno: p.cfopInterno ?? '', cfopInterestadual: p.cfopInterestadual ?? '',
      csosn: p.csosn ?? '', cstIcms: p.cstIcms ?? '',
      aliqIcms: String(p.aliqIcms ?? 0), redBaseIcms: String(p.redBaseIcms ?? 0),
      temSt: !!p.temSt, mva: String(p.mva ?? 0), aliqIcmsSt: String(p.aliqIcmsSt ?? 0),
      cstPis: p.cstPis ?? '', aliqPis: String(p.aliqPis ?? 0),
      cstCofins: p.cstCofins ?? '', aliqCofins: String(p.aliqCofins ?? 0),
      cstIpi: p.cstIpi ?? '', aliqIpi: String(p.aliqIpi ?? 0),
      infoAdicional: p.infoAdicional ?? '',
    })
    setPainel(true)
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const url = editando ? `${api}/${editando.perfilTribId}` : api
      const res = await fetch(url, {
        method: editando ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao salvar')
      return d
    },
    // O painel continua aberto quando é cadastro novo, limpando os campos:
    // o contador cadastra vários perfis de uma vez.
    onSuccess: () => {
      inv()
      if (editando) { setPainel(false); setEdit(null) }
      setForm({ ...VAZIO })
      toast('Perfil salvo.')
    },
    onError: (e: any) => toast(e?.message ?? 'Erro ao salvar', 'error'),
  })

  const excluir = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${api}/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao excluir')
      return d
    },
    onSuccess: () => { inv(); toast('Perfil excluído.') },
    onError: (e: any) => toast(e?.message ?? 'Erro ao excluir', 'error'),
  })

  const colunas: Coluna[] = [
    { chave: 'nome', titulo: 'Perfil', render: (p: any) => (
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{p.nome}</p>
        {p.descricao && <p className="text-xs text-gray-400 truncate">{p.descricao}</p>}
      </div>
    )},
    { chave: 'cfopInterno', titulo: 'CFOP', render: (p: any) => (
      <span className="text-sm text-gray-600">
        {p.cfopInterno || <span className="text-red-500">—</span>}
        {p.cfopInterestadual ? ` / ${p.cfopInterestadual}` : ''}
      </span>
    )},
    { chave: 'csosn', titulo: 'CSOSN / CST', render: (p: any) => (
      <span className="text-sm text-gray-600">
        {p.csosn || p.cstIcms || <span className="text-red-500">—</span>}
      </span>
    )},
    { chave: 'cstPis', titulo: 'PIS / COFINS', esconderAte: 'lg', render: (p: any) => (
      <span className="text-sm text-gray-600">
        {p.cstPis || '—'} / {p.cstCofins || '—'}
      </span>
    )},
    { chave: 'temSt', titulo: 'ST', esconderAte: 'lg', render: (p: any) => (
      <span className="text-sm text-gray-600">{p.temSt ? `${p.mva}%` : '—'}</span>
    )},
    { chave: 'produtos', titulo: 'Produtos', render: (p: any) => (
      <span className="text-sm text-gray-600">{uso[p.perfilTribId] ?? 0}</span>
    )},
  ]

  return (
    <div className="space-y-4">

      {/* ── PRONTIDÃO ───────────────────────────────────────────────────── */}
      {pront && (
        <div className={`rounded-xl border px-5 py-4 ${
          pront.pronto ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex items-start gap-3">
            {pront.pronto
              ? <CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0" />
              : <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${pront.pronto ? 'text-green-800' : 'text-amber-800'}`}>
                {pront.pronto
                  ? 'Parametrização fiscal completa'
                  : `${pront.pendencias.length} pendência(s) antes de emitir`}
              </p>
              {!pront.pronto && (
                <ul className="mt-2 space-y-1">
                  {pront.pendencias.map((p: any, i: number) => (
                    <li key={i} className="text-sm text-amber-900">
                      <span className="text-amber-600/70 uppercase text-[10px] tracking-wide mr-1.5">{p.onde}</span>
                      {p.item} — {p.falta}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-gray-500 mt-2">
                {pront.resumo.produtos} produto(s) · {pront.resumo.produtosSemNcm} sem NCM · {pront.resumo.produtosSemPerfil} sem perfil
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── PERFIS ──────────────────────────────────────────────────────── */}
      <DataTable
        colunas={colunas}
        itens={perfis}
        chave={(p: any) => p.perfilTribId}
        carregando={isLoading}
        vazio="Nenhum perfil tributário. O contador define quais existem."
        ferramentas={
          <Button size="sm" onClick={abrirNovo}>
            <Plus size={14} className="mr-1" /> Novo perfil
          </Button>
        }
        acoes={(p: any) => (
          <>
            <BotaoIcone titulo="Editar" onClick={() => abrirEdicao(p)}>
              <Pencil size={14} />
            </BotaoIcone>
            <BotaoIcone titulo="Excluir" variante="perigo" onClick={() => setDel(p)}>
              <Trash2 size={14} />
            </BotaoIcone>
          </>
        )}
      />

      {painel && (
        <SidePanel
          titulo={editando ? `Editar ${editando.nome}` : 'Novo perfil tributário'}
          largura="w-[34vw] min-w-[560px]"
          onClose={() => { setPainel(false); setEdit(null) }}
          rodape={
            <>
              <Button variant="outline" onClick={() => { setPainel(false); setEdit(null) }}>Fechar</Button>
              <Button onClick={() => salvar.mutate()} disabled={!form.nome.trim() || salvar.isPending}>
                {salvar.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </>
          }
        >
          <div className="p-6 space-y-4">
            <div>
              <Label className="flex items-center gap-1">
                Nome do perfil *
                <InfoTip titulo="Perfil tributário">Agrupa produtos com a mesma tributação, para não classificar um a um.</InfoTip>
              </Label>
              <Input value={form.nome} onChange={e => setF('nome', e.target.value)}
                placeholder="Ex: Produção própria" className="mt-1" autoFocus />
            </div>

            <div>
              <Label>Descrição</Label>
              <Input value={form.descricao} onChange={e => setF('descricao', e.target.value)}
                placeholder="Quais produtos usam este perfil" className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="flex items-center gap-1">
                  CFOP dentro do estado
                  <InfoTip titulo="CFOP">Descreve a operação, não o produto — muda conforme o destino.</InfoTip>
                </Label>
                <Input value={form.cfopInterno} onChange={e => setF('cfopInterno', e.target.value)}
                  placeholder="5102" maxLength={4} className="mt-1" />
              </div>
              <div>
                <Label>CFOP fora do estado</Label>
                <Input value={form.cfopInterestadual} onChange={e => setF('cfopInterestadual', e.target.value)}
                  placeholder="6102" maxLength={4} className="mt-1" />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1">
                ICMS
                <InfoTip titulo="Qual campo vale">Simples Nacional usa CSOSN; Lucro Presumido e Real usam CST.</InfoTip>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>CSOSN — Simples</Label>
                  <Input value={form.csosn} onChange={e => setF('csosn', e.target.value)}
                    placeholder="102" maxLength={4} className="mt-1" />
                </div>
                <div>
                  <Label>CST — regime normal</Label>
                  <Input value={form.cstIcms} onChange={e => setF('cstIcms', e.target.value)}
                    placeholder="00" maxLength={3} className="mt-1" />
                </div>
                <div>
                  <Label>Alíquota ICMS (%)</Label>
                  <Input type="number" step="0.01" inputMode="decimal" value={form.aliqIcms}
                    onChange={e => setF('aliqIcms', e.target.value)} className="sem-spinner mt-1" />
                </div>
                <div>
                  <Label>Redução de base (%)</Label>
                  <Input type="number" step="0.01" inputMode="decimal" value={form.redBaseIcms}
                    onChange={e => setF('redBaseIcms', e.target.value)} className="sem-spinner mt-1" />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.temSt}
                  onChange={e => setF('temSt', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300" />
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                  Substituição tributária
                  <InfoTip titulo="Substituição tributária">O imposto já foi recolhido antes na cadeia — comum em bebida.</InfoTip>
                </span>
              </label>
              {form.temSt && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <Label>MVA (%)</Label>
                    <Input type="number" step="0.01" inputMode="decimal" value={form.mva}
                      onChange={e => setF('mva', e.target.value)} className="sem-spinner mt-1" />
                  </div>
                  <div>
                    <Label>Alíquota ICMS ST (%)</Label>
                    <Input type="number" step="0.01" inputMode="decimal" value={form.aliqIcmsSt}
                      onChange={e => setF('aliqIcmsSt', e.target.value)} className="sem-spinner mt-1" />
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1">
                PIS e COFINS
                <InfoTip titulo="Alimentos">Parte da cesta básica tem alíquota zero — confirme com o contador.</InfoTip>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>CST PIS</Label>
                  <Input value={form.cstPis} onChange={e => setF('cstPis', e.target.value)}
                    placeholder="07" maxLength={2} className="mt-1" />
                </div>
                <div>
                  <Label>Alíquota PIS (%)</Label>
                  <Input type="number" step="0.0001" inputMode="decimal" value={form.aliqPis}
                    onChange={e => setF('aliqPis', e.target.value)} className="sem-spinner mt-1" />
                </div>
                <div>
                  <Label>CST COFINS</Label>
                  <Input value={form.cstCofins} onChange={e => setF('cstCofins', e.target.value)}
                    placeholder="07" maxLength={2} className="mt-1" />
                </div>
                <div>
                  <Label>Alíquota COFINS (%)</Label>
                  <Input type="number" step="0.0001" inputMode="decimal" value={form.aliqCofins}
                    onChange={e => setF('aliqCofins', e.target.value)} className="sem-spinner mt-1" />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1">
                IPI
                <InfoTip titulo="IPI">Indústria costuma ter; comércio que só revende, não.</InfoTip>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>CST IPI</Label>
                  <Input value={form.cstIpi} onChange={e => setF('cstIpi', e.target.value)}
                    maxLength={2} className="mt-1" />
                </div>
                <div>
                  <Label>Alíquota IPI (%)</Label>
                  <Input type="number" step="0.01" inputMode="decimal" value={form.aliqIpi}
                    onChange={e => setF('aliqIpi', e.target.value)} className="sem-spinner mt-1" />
                </div>
              </div>
            </div>

            <div>
              <Label>Informação adicional do item</Label>
              <Input value={form.infoAdicional} onChange={e => setF('infoAdicional', e.target.value)}
                className="mt-1" />
            </div>
          </div>
        </SidePanel>
      )}

      {confirmDel && (
        <ConfirmModal
          title="Excluir perfil"
          message={`Excluir "${confirmDel.nome}"? Produtos ligados a ele ficariam sem classificação fiscal.`}
          confirmLabel="Excluir"
          cancelLabel="Voltar"
          danger
          onConfirm={() => { excluir.mutate(confirmDel.perfilTribId); setDel(null) }}
          onCancel={() => setDel(null)}
        />
      )}
    </div>
  )
}
