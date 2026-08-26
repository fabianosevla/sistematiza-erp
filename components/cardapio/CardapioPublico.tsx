'use client'
// ESTE ARQUIVO VAI EM: components/cardapio/CardapioPublico.tsx
//
// TELA PÚBLICA — abre sem login, no celular do cliente, via link ou QR Code.
// Carrinho é local (useState). Ao confirmar, o cliente NÃO cria um pedido no
// sistema — o POST /api/[tenant]/cardapio/mensagem recalcula o preço no
// servidor e devolve uma mensagem pronta, que abre no WhatsApp da loja pro
// cliente mandar. É a loja quem confirma e registra no sistema depois,
// do jeito que fizer sentido (pedido, PDV, delivery).
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Plus, Minus, ShoppingCart, X, MessageCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/Toast'
import { fmtMoeda as fmt } from '@/lib/format'

interface Props { tenantSlug: string }

interface ItemCarrinho { produtoId: number; nome: string; precoVarejo: number; quantidade: number }

// A empresa escolhe a cor de destaque livremente (inclusive vermelho, branco,
// qualquer coisa). Texto branco fixo — como estava antes — fica ilegível numa
// cor clara (branco em cima de branco) e o botão "Adicionar" nem chegava a
// usar essa cor: o componente Button aplicava verde no texto por padrão,
// deixando fundo vermelho com escrito verde. Uma cor de texto só, calculada
// pelo contraste da cor de fundo, resolve os dois — vale pra todo botão que
// usa `cor` como fundo (QA #100).
function corParaTexto(hex: string): string {
  const h = hex.replace('#', '')
  const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminancia > 0.6 ? '#111827' : '#ffffff'
}

export default function CardapioPublico({ tenantSlug }: Props) {
  const { toast } = useToast()
  const api = `/api/${tenantSlug}/cardapio`

  const { data: raw, isLoading, isError } = useQuery({
    queryKey: ['cardapio-publico', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
    retry: false,
  })

  const [carrinho, setCarrinho]         = useState<ItemCarrinho[]>([])
  const [showCarrinho, setShowCarrinho] = useState(false)

  const [nome, setNome]               = useState('')
  const [tipoVenda, setTipoVenda]     = useState<'balcao' | 'entrega'>('entrega')
  const [endereco, setEndereco]       = useState('')
  const [formaPagamentoId, setFormaPagamentoId] = useState('')
  const [observacao, setObservacao]   = useState('')

  const empresa: any   = raw?.data?.empresa ?? {}
  const layout: any    = raw?.data?.layout ?? {}
  const produtos: any[] = raw?.data?.produtos ?? []
  const formasPagamento: any[] = raw?.data?.formasPagamento ?? []
  const permiteEntrega: boolean = raw?.data?.permiteEntrega ?? true
  const permiteBalcao:  boolean = raw?.data?.permiteBalcao  ?? true
  const cor = layout.corDestaque || '#2ecc71'
  const corTexto = corParaTexto(cor)
  // Horário de atendimento (QA #102) — o servidor já calcula se está aberto
  // agora, com o fuso de São Paulo; aqui só exibe e trava o pedido.
  const abertoAgora: boolean = raw?.data?.aberto ?? true
  const proximaAbertura: string | undefined = raw?.data?.proximaAbertura
  const horario: Record<string, { aberto: boolean; abre: string; fecha: string }> | null = raw?.data?.horario ?? null
  const [showHorario, setShowHorario] = useState(false)

  // Se só um dos dois tipos é permitido, usa ele direto — o toggle só
  // aparece quando o cliente realmente tem escolha.
  const tipoVendaEfetivo: 'balcao' | 'entrega' =
    !permiteEntrega && permiteBalcao ? 'balcao' :
    permiteEntrega && !permiteBalcao ? 'entrega' :
    tipoVenda

  const categorias = [...new Set(produtos.map(p => p.categoria || 'Cardápio'))]

  function adicionar(p: any) {
    if (!abertoAgora) return
    setCarrinho(prev => {
      const existe = prev.find(i => i.produtoId === p.produtoId)
      if (existe) return prev.map(i => i.produtoId === p.produtoId ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { produtoId: p.produtoId, nome: p.nome, precoVarejo: p.precoVarejo, quantidade: 1 }]
    })
  }
  function remover(produtoId: number) {
    setCarrinho(prev => prev
      .map(i => i.produtoId === produtoId ? { ...i, quantidade: i.quantidade - 1 } : i)
      .filter(i => i.quantidade > 0))
  }

  const totalItens = carrinho.reduce((a, i) => a + i.quantidade, 0)
  const totalCarrinho = carrinho.reduce((a, i) => a + i.quantidade * i.precoVarejo, 0)
  // Taxa de entrega (QA #101): valor fixo cadastrado pela empresa, somado só
  // quando o cliente escolhe entrega — não entra na retirada no balcão.
  const taxaEntrega = Number(raw?.data?.taxaEntrega ?? 0)
  const taxaAplicada = tipoVendaEfetivo === 'entrega' ? taxaEntrega : 0
  const totalComTaxa = totalCarrinho + taxaAplicada

  const enviarMut = useMutation({
    mutationFn: async () => {
      const formaNome = formasPagamento.find((f: any) => String(f.formaId) === formaPagamentoId)?.nome ?? null
      const res = await fetch(`${api}/mensagem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome, tipoVenda: tipoVendaEfetivo,
          enderecoEntrega: tipoVendaEfetivo === 'entrega' ? endereco : null,
          observacao: observacao || null,
          formaPagamentoNome: formaNome,
          itens: carrinho.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Não foi possível montar o pedido')
      return d
    },
    onSuccess: (d: any) => {
      const link = d?.data?.linkWhatsapp
      if (link) window.location.href = link
    },
    onError: (e: any) => toast(e?.message ?? 'Erro ao montar o pedido', 'error'),
  })

  const podeConfirmar = nome.trim().length >= 2
    && (tipoVendaEfetivo === 'balcao' || endereco.trim().length > 0)
    && carrinho.length > 0

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Carregando cardápio...</div>
  }
  if (isError || !raw?.data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-6">
        <p className="text-gray-500">Cardápio não disponível no momento.</p>
      </div>
    )
  }

  const tipoLayout: string = layout.tipo || 'classico'

  function Quantidade({ p }: { p: any }) {
    const noCarrinho = carrinho.find(i => i.produtoId === p.produtoId)
    if (noCarrinho) {
      return (
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => remover(p.produtoId)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"><Minus size={14} /></button>
          <span className="text-sm font-semibold w-5 text-center">{noCarrinho.quantidade}</span>
          <button onClick={() => adicionar(p)} disabled={!abertoAgora} className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-40" style={{ backgroundColor: cor, color: corTexto }}><Plus size={14} /></button>
        </div>
      )
    }
    return (
      <Button size="sm" onClick={() => adicionar(p)} disabled={!abertoAgora} className="flex-shrink-0 disabled:opacity-40" style={{ backgroundColor: cor, color: corTexto }}>
        {abertoAgora ? 'Adicionar' : 'Fechado'}
      </Button>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* CABEÇALHO — a foto de fundo (quando tem) aparece nos 4 layouts; só o
          tamanho muda: bem grande na "Capa", mais discreta nos outros três.
          Sem foto de fundo, cai no cabeçalho branco simples de sempre. */}
      {layout.bannerUrl ? (
        <header className={`relative text-center px-4 ${tipoLayout === 'capa' ? 'py-10' : 'py-6'}`} style={{ backgroundColor: '#111' }}>
          <img src={layout.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
          <div className="relative">
            {empresa.logoUrl && <img src={empresa.logoUrl} alt="" className={`mx-auto mb-2 object-contain bg-white rounded-lg p-1 ${tipoLayout === 'capa' ? 'h-14' : 'h-11'}`} />}
            <h1 className={`font-bold text-white drop-shadow ${tipoLayout === 'capa' ? 'text-xl' : 'text-lg'}`}>{empresa.nome}</h1>
            {layout.mensagemBoasVindas && <p className="text-sm text-white/90 mt-1 drop-shadow">{layout.mensagemBoasVindas}</p>}
            {empresa.telefone && <p className="text-xs text-white/70 mt-1">{empresa.telefone}</p>}
          </div>
        </header>
      ) : (
        <header className="bg-white border-b border-gray-100 px-4 py-5 text-center">
          {empresa.logoUrl && <img src={empresa.logoUrl} alt="" className="h-12 mx-auto mb-2 object-contain" />}
          <h1 className="text-lg font-bold text-gray-900">{empresa.nome}</h1>
          {layout.mensagemBoasVindas && <p className="text-sm text-gray-500 mt-1">{layout.mensagemBoasVindas}</p>}
          {empresa.telefone && <p className="text-xs text-gray-400 mt-1">{empresa.telefone}</p>}
        </header>
      )}

      {horario && (
        <button
          onClick={() => setShowHorario(true)}
          className={`w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b ${
            abertoAgora ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'
          }`}
        >
          <Clock size={14} />
          {abertoAgora ? 'Aberto agora' : `Fechado no momento${proximaAbertura ? ` — abre às ${proximaAbertura}` : ''}`}
          <span className="underline underline-offset-2 ml-0.5">ver horário</span>
        </button>
      )}

      {showHorario && horario && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setShowHorario(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">Horário de atendimento</p>
              <button onClick={() => setShowHorario(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-1.5">
              {[['dom', 'Domingo'], ['seg', 'Segunda'], ['ter', 'Terça'], ['qua', 'Quarta'], ['qui', 'Quinta'], ['sex', 'Sexta'], ['sab', 'Sábado']]
                .map(([chave, label]) => {
                  const dia = horario[chave]
                  const hoje = chave === ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDay()]
                  return (
                    <div key={chave} className={`flex justify-between text-sm px-2 py-1 rounded-lg ${hoje ? 'bg-gray-50 font-semibold text-gray-900' : 'text-gray-600'}`}>
                      <span>{label}</span>
                      <span>{dia?.aberto ? `${dia.abre} – ${dia.fecha}` : 'Fechado'}</span>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-6">
        {produtos.length === 0 && (
          <p className="text-center text-gray-400 py-12">Nenhum produto disponível no momento.</p>
        )}
        {categorias.map(cat => (
          <div key={cat}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{cat}</p>

            {/* GRADE — cards em 2 colunas, foto grande em cima */}
            {tipoLayout === 'grade' ? (
              <div className="grid grid-cols-2 gap-3">
                {produtos.filter(p => (p.categoria || 'Cardápio') === cat).map(p => (
                  <div key={p.produtoId} className="bg-white rounded-xl border border-gray-100 overflow-hidden flex flex-col">
                    {p.fotoUrl ? (
                      <img src={p.fotoUrl} alt="" className="w-full h-24 object-cover" />
                    ) : (
                      <div className="w-full h-24 bg-gray-100" />
                    )}
                    <div className="p-2.5 flex-1 flex flex-col">
                      <p className="text-sm font-medium text-gray-900 line-clamp-2">{p.nome}</p>
                      <p className="text-sm font-semibold mt-1" style={{ color: cor }}>{fmt(p.precoVarejo)}</p>
                      <div className="mt-2"><Quantidade p={p} /></div>
                    </div>
                  </div>
                ))}
              </div>

            /* COMPACTO — lista densa, sem foto */
            ) : tipoLayout === 'compacto' ? (
              <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
                {produtos.filter(p => (p.categoria || 'Cardápio') === cat).map(p => (
                  <div key={p.produtoId} className="px-3 py-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{p.nome}</p>
                      <p className="text-xs font-semibold" style={{ color: cor }}>{fmt(p.precoVarejo)}</p>
                    </div>
                    <Quantidade p={p} />
                  </div>
                ))}
              </div>

            /* CAPA — cards grandes, uma coluna, foto larga em cima. É o layout
               mais visual dos quatro, condizente com o banner grande do topo. */
            ) : tipoLayout === 'capa' ? (
              <div className="space-y-3">
                {produtos.filter(p => (p.categoria || 'Cardápio') === cat).map(p => (
                  <div key={p.produtoId} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    {p.fotoUrl ? (
                      <img src={p.fotoUrl} alt="" className="w-full h-36 object-cover" />
                    ) : (
                      <div className="w-full h-36 bg-gray-100" />
                    )}
                    <div className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{p.nome}</p>
                        {p.descricao && <p className="text-xs text-gray-400 line-clamp-2">{p.descricao}</p>}
                        <p className="text-sm font-semibold mt-1" style={{ color: cor }}>{fmt(p.precoVarejo)}</p>
                      </div>
                      <Quantidade p={p} />
                    </div>
                  </div>
                ))}
              </div>

            /* CLÁSSICO — lista com foto pequena ao lado */
            ) : (
              <div className="space-y-2">
                {produtos.filter(p => (p.categoria || 'Cardápio') === cat).map(p => (
                  <div key={p.produtoId} className="bg-white rounded-xl border border-gray-100 p-3 flex gap-3 items-center">
                    {p.fotoUrl ? (
                      <img src={p.fotoUrl} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-gray-100 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{p.nome}</p>
                      {p.descricao && <p className="text-xs text-gray-400 line-clamp-2">{p.descricao}</p>}
                      <p className="text-sm font-semibold mt-1" style={{ color: cor }}>{fmt(p.precoVarejo)}</p>
                    </div>
                    <Quantidade p={p} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Sempre existe, mesmo com carrinho vazio — desabilitado nesse caso.
          Sem isso, a base da tela ficava vazia até o primeiro item ser
          escolhido, o que parecia tela quebrada. */}
      {!showCarrinho && (
        <button
          onClick={() => totalItens > 0 && setShowCarrinho(true)}
          disabled={totalItens === 0}
          className="fixed bottom-4 left-4 right-4 max-w-2xl mx-auto h-12 rounded-xl font-medium flex items-center justify-between px-5 shadow-lg disabled:cursor-not-allowed"
          style={{ backgroundColor: totalItens > 0 ? cor : '#9ca3af', color: totalItens > 0 ? corTexto : '#ffffff' }}
        >
          <span className="inline-flex items-center gap-2"><ShoppingCart size={16} /> {totalItens > 0 ? `${totalItens} item(ns)` : 'Seu carrinho está vazio'}</span>
          {totalItens > 0 && <span>{fmt(totalComTaxa)}</span>}
        </button>
      )}

      {showCarrinho && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">Finalizar pedido</p>
              <button onClick={() => setShowCarrinho(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1">
                {carrinho.map(i => (
                  <div key={i.produtoId} className="flex justify-between text-sm">
                    <span className="text-gray-600">{i.quantidade}x {i.nome}</span>
                    <span className="text-gray-900">{fmt(i.quantidade * i.precoVarejo)}</span>
                  </div>
                ))}
                {taxaAplicada > 0 && (
                  <div className="flex justify-between text-sm pt-1">
                    <span className="text-gray-600">Taxa de entrega</span>
                    <span className="text-gray-900">{fmt(taxaAplicada)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold pt-2 border-t border-gray-100">
                  <span>Total</span>
                  <span>{fmt(totalComTaxa)}</span>
                </div>
              </div>

              <div>
                <Label>Nome *</Label>
                <Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1" />
              </div>

              {permiteEntrega && permiteBalcao ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setTipoVenda('entrega')}
                    className="h-9 rounded-lg text-sm font-medium border"
                    style={tipoVenda === 'entrega' ? { backgroundColor: `${cor}1a`, borderColor: cor, color: cor } : { borderColor: '#e5e7eb', color: '#6b7280' }}
                  >Entrega</button>
                  <button
                    onClick={() => setTipoVenda('balcao')}
                    className="h-9 rounded-lg text-sm font-medium border"
                    style={tipoVenda === 'balcao' ? { backgroundColor: `${cor}1a`, borderColor: cor, color: cor } : { borderColor: '#e5e7eb', color: '#6b7280' }}
                  >Retirar no balcão</button>
                </div>
              ) : null}

              {tipoVendaEfetivo === 'entrega' && permiteEntrega && (
                <div>
                  <Label>Endereço de entrega *</Label>
                  <Input value={endereco} onChange={e => setEndereco(e.target.value)} className="mt-1" placeholder="Rua, número, bairro" />
                </div>
              )}

              {formasPagamento.length > 0 && (
                <div>
                  <Label>Forma de pagamento (opcional)</Label>
                  <select value={formaPagamentoId} onChange={e => setFormaPagamentoId(e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white">
                    <option value="">Selecione...</option>
                    {formasPagamento.map((f: any) => <option key={f.formaId} value={f.formaId}>{f.nome}</option>)}
                  </select>
                </div>
              )}

              <div>
                <Label>Observação</Label>
                <Input value={observacao} onChange={e => setObservacao(e.target.value)} className="mt-1" />
              </div>

              <Button
                className="w-full h-11"
                style={{ backgroundColor: cor, color: corTexto }}
                disabled={!podeConfirmar || enviarMut.isPending}
                onClick={() => enviarMut.mutate()}
              >
                <MessageCircle size={16} className="mr-2" />
                {enviarMut.isPending ? 'Preparando...' : `Enviar pedido pelo WhatsApp — ${fmt(totalComTaxa)}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
