'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, X, Plus, Minus, Trash2, CheckCircle, Loader2, ShoppingCart, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Gift, Tag, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InfoTip } from '@/components/ui/InfoTip'
import { MarcaEndereco, enderecoDoCadastro } from '@/components/ui/MarcaEndereco'
import { SidePanel } from '@/components/ui/SidePanel'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import PainelCaixa, { useNumeroCaixa } from '@/components/modules/caixa/PainelCaixa'
import { fmtMoeda as fmt } from '@/lib/format'
import { TIPOS_PRECO } from '@/lib/constants'

// modo: 'balcao' = venda de balcão (retirada). 'delivery' = venda para entrega:
// mesma tela do balcão, mas com endereço em destaque/obrigatório e tipo de
// entrega já como "Entrega". O acréscimo (taxa de entrega) é o mesmo campo nos
// dois modos e entra embutido no total via "desconto líquido" — sem linha de
// frete separada e sem mexer no banco.
interface Props { tenantSlug: string; modo?: 'balcao' | 'delivery' }

interface ItemCarrinho {
  produtoId:     number
  nomeProduto:   string
  codigoBarras:  string
  unidade:       string
  quantidade:    number
  precoUnitario: number
  desconto:      number   // desconto do item em centavos
  subtotal:      number   // já líquido do desconto do item
}

// ── Tabela de preço ─────────────────────────────────────────────────────────
// Cada cliente tem uma tabela padrão (t_cliente.tabela_preco). Ao selecionar o
// cliente na venda, o PDV passa a usar a coluna de preço correspondente.
//
// A cadeia de fallback é a MESMA de VendaService.resolverPreco(): se a faixa de
// atacado escolhida estiver zerada no produto, cai no atacado legado e depois
// no varejo. Assim a tela nunca mostra R$ 0,00 num produto que tem preço.
const CAMPOS_PRECO: Record<string, string[]> = {
  varejo:    ['precoVarejo', 'preco_varejo'],
  atacado_a: ['precoAtacadoA', 'preco_atacado_a'],
  atacado_b: ['precoAtacadoB', 'preco_atacado_b'],
  atacado_c: ['precoAtacadoC', 'preco_atacado_c'],
  atacado_d: ['precoAtacadoD', 'preco_atacado_d'],
  atacado_e: ['precoAtacadoE', 'preco_atacado_e'],
}

function numeroDe(v: any): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

// Preço do produto em centavos, na tabela informada.
// A listagem pode chegar mapeada (precoVarejo), crua do Postgres (preco_varejo)
// ou com o número em texto — os três casos caem no mesmo lugar.
function precoDoProduto(p: any, tabela: string = 'varejo'): number {
  const campos = CAMPOS_PRECO[tabela] ?? CAMPOS_PRECO.varejo
  for (const campo of campos) {
    const v = numeroDe(p?.[campo])
    if (v > 0) return v
  }
  if (tabela !== 'varejo') {
    // Atacado legado, depois varejo — igual ao servidor
    const legado = numeroDe(p?.precoAtacado ?? p?.preco_atacado)
    if (legado > 0) return legado
    for (const campo of CAMPOS_PRECO.varejo) {
      const v = numeroDe(p?.[campo])
      if (v > 0) return v
    }
  }
  return numeroDe(p?.precoVenda ?? p?.preco_venda)
}

const TODAS = 'Todas'

// Densidade da tela: a mesma tela abre em notebooks diferentes e com escalas de
// Windows diferentes. Em vez de tamanho fixo, o operador escolhe aqui e a
// escolha fica salva naquele computador.
const DENSIDADES = {
  compacto: { card: 140, titulo: 'text-xs',   preco: 'text-sm',   tabela: 'text-xs' },
  normal:   { card: 180, titulo: 'text-sm',   preco: 'text-base', tabela: 'text-sm' },
  grande:   { card: 230, titulo: 'text-base', preco: 'text-lg',   tabela: 'text-base' },
} as const
type Densidade = keyof typeof DENSIDADES

// Verde da marca. Os botões usam o componente <Button> sem sobrescrever cor —
// é ele que define a identidade em todo o sistema, e o PDV não pode ser a
// exceção escura no meio de uma aplicação clara.
const VERDE = '#2ecc71'

// Etapa 1 = montar o carrinho na tela cheia. Etapa 2 = painel lateral, que por
// sua vez tem duas partes: conferir os itens e depois pagar.
type EtapaPainel = 'itens' | 'pagamento'

export default function PdvBalcao({ tenantSlug, modo = 'balcao' }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const searchRef   = useRef<HTMLInputElement>(null)
  const clienteRef  = useRef<HTMLInputElement>(null)
  const descontoRef = useRef<HTMLInputElement>(null)
  const pgtoRef     = useRef<HTMLSelectElement>(null)

  const isDelivery = modo === 'delivery'

  const [densidade, setDensidade]         = useState<Densidade>('normal')
  const [busca, setBusca]                 = useState('')
  const [categoria, setCategoria]         = useState(TODAS)
  const [carrinho, setCarrinho]           = useState<ItemCarrinho[]>([])
  const [desconto, setDesconto]           = useState('0')
  const [acrescimo, setAcrescimo]         = useState('0')
  const [formaPgto, setFormaPgto]         = useState('')
  const [parcelas, setParcelas]           = useState('2')
  const [valorRecebido, setValorRecebido] = useState('')
  const [confirmLimpar, setConfirmLimpar] = useState(false)
  const [vendaOk, setVendaOk]             = useState(false)

  // Painel de finalização (etapa 2)
  const [painelAberto, setPainelAberto]   = useState(false)
  const [etapa, setEtapa]                 = useState<EtapaPainel>('itens')

  // COM NOTA OU SEM NOTA.
  //
  // Registra a intenção no momento da venda. Não emite nada por si — a emissão
  // vive no módulo Fiscal e depende de parametrização e credenciamento. O que
  // isto faz é separar, no gerencial, o que foi faturado do que não foi.
  //
  // Nasce desligado de propósito: emitir é decisão consciente, e no balcão a
  // maioria das vendas ao consumidor sai sem nota pedida.
  // NOTA LIGADA POR PADRÃO.
  //
  // O certo é emitir; não emitir é a exceção, e exceção é que deve custar um
  // clique. Deixar desligado por padrão transformava o esquecimento em venda
  // sem nota — erro que só aparece na apuração do mês.
  const [comNota, setComNota]             = useState(true)
  // Impressão desligada: emitir é obrigação com o fisco, imprimir é papel para
  // o cliente, e a maioria não quer a via.
  const [imprimirNota, setImprimirNota]   = useState(false)

  const { data: cfgFiscalRaw } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/configuracoes`)).json(),
    staleTime: 5 * 60 * 1000,
  })
  const fiscalAtivo     = cfgFiscalRaw?.data?.fiscalAtivo === true
  const turnoObrigatorio = cfgFiscalRaw?.data?.turnoCaixaAtivo === true

  // Número desta máquina. Vive no navegador — dois PCs na mesma rede são
  // idênticos para o servidor, então não há como deduzir.
  const qtdCaixas = Number(cfgFiscalRaw?.data?.qtdCaixas ?? 1)
  const { numero: numeroCaixa } = useNumeroCaixa(qtdCaixas)

  // TURNO DE CAIXA.
  //
  // Só vale quando o cliente contratou o controle. Desligado — que é o padrão
  // — nada disto aparece e o PDV vende como sempre vendeu.
  const { data: turnoRaw } = useQuery({
    queryKey: ['caixa', tenantSlug, numeroCaixa],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/caixa?numeroCaixa=${numeroCaixa ?? ''}`)).json(),
    enabled:  turnoObrigatorio,
    refetchInterval: turnoObrigatorio ? 60000 : false,
  })
  const turnoAberto = turnoRaw?.data?.meu ?? null
  const caixaTravado = turnoObrigatorio && !turnoAberto

  // Fluxo de finalização: "Finalizar" abre "Deseja confirmar a venda?" (Sim/Não).
  // Após registrar, abre "Deseja imprimir cupom?" (Sim/Não) com os dados da
  // venda congelados em cupomVenda (o carrinho já foi resetado nesse ponto).
  const [confirmVenda, setConfirmVenda]   = useState(false)
  const [cupomVenda, setCupomVenda]       = useState<any>(null)
  const [showExtras, setShowExtras]       = useState(false)

  // Campos extras — iguais ao modal Nova Venda do gerencial
  const [clienteId, setClienteId]             = useState('')
  const [clienteNomeDisplay, setClienteNomeDisplay] = useState('')
  // Tabela de preço em vigor nesta venda. Sem cliente = varejo.
  const [tabelaPreco, setTabelaPreco]         = useState<string>('varejo')
  const [showCadastrarCliente, setShowCadastrarCliente] = useState(false)
  const CLI_VAZIO = {
    tipoPessoa: 'PF', documento: '', nomeCompleto: '', nomeFantasia: '',
    email: '', celular: '', telefone: '',
    // Endereço: o PDV vende para entrega, e cliente cadastrado aqui sem
    // endereço obriga a redigitar a rua na venda e em toda venda seguinte.
    cep: '', endereco: '', numero: '', complemento: '', bairro: '',
    cidade: '', uf: '', observacao: '',
  }
  const [novoCli, setNovoCli] = useState(CLI_VAZIO)
  const setCli = (k: string, v: string) => setNovoCli(p => ({ ...p, [k]: v }))
  const [buscaCliente, setBuscaCliente]       = useState('')
  // Nome digitado para quem não é cadastrado. Só vale enquanto nenhum cliente
  // foi selecionado — com cadastro, o cadastro manda.
  const [nomeAvulso, setNomeAvulso]           = useState('')
  const [vendedor, setVendedor]               = useState('')
  const [tipoEntrega, setTipoEntrega]         = useState(isDelivery ? 'Entrega' : 'Retirada')
  const [observacao, setObservacao]           = useState('')
  const [dataEntrega, setDataEntrega]         = useState('')
  const [enderecoEntrega, setEnderecoEntrega] = useState('')
  const [enderecoCadastro, setEnderecoCadastro] = useState('')

  // Reimpressão: painel das vendas de hoje. `linhaSel` é o índice destacado,
  // para o operador escolher com as setas e imprimir com Enter — no balcão a
  // mão está no teclado, não no mouse.
  const [showVendasDia, setShowVendasDia] = useState(false)
  const [linhaSel, setLinhaSel]           = useState(0)

  // Fidelidade / cashback
  const [usarCashback, setUsarCashback]       = useState(false)

  const dens = DENSIDADES[densidade]
  const rotuloTabela = (TIPOS_PRECO as any)[tabelaPreco] ?? 'Varejo'
  const ehAtacado    = tabelaPreco !== 'varejo'

  useEffect(() => { searchRef.current?.focus() }, [])

  // Densidade salva por computador
  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem('pdv-densidade') as Densidade | null
      if (salvo && salvo in DENSIDADES) setDensidade(salvo)
    } catch {}
  }, [])

  function mudarDensidade(d: Densidade) {
    setDensidade(d)
    try { window.localStorage.setItem('pdv-densidade', d) } catch {}
  }

  const { data: produtosRaw, isLoading: loadingProd } = useQuery({
    queryKey: ['pdv-balcao-catalogo', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/produtos?limit=300`)).json(),
    staleTime: 60000,
  })

  // Dados da empresa para o cabeçalho do cupom. Vêm de Configurações →
  // Dados da empresa; campo em branco simplesmente não é impresso.
  const { data: empresaRaw } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/configuracoes`)).json(),
    staleTime: 300000,
  })
  const empresa = empresaRaw?.data ?? {}

  const { data: formasRaw } = useQuery({
    queryKey: ['pdv-formas', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/formas-pagamento`)).json(),
    staleTime: 60000,
  })

  const { data: clientesRaw } = useQuery({
    queryKey: ['pdv-clientes', tenantSlug, buscaCliente],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/clientes?limit=8&search=${encodeURIComponent(buscaCliente)}`)).json(),
    enabled:  buscaCliente.length > 1,
    staleTime: 5000,
  })

  const { data: usuariosRaw } = useQuery({
    queryKey: ['pdv-usuarios', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/usuarios`)).json(),
    staleTime: 60000,
  })

  // Saldo de cashback do cliente selecionado
  const { data: cashbackRaw } = useQuery({
    queryKey: ['pdv-cashback', tenantSlug, clienteId],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/fidelidade/saldo?clienteId=${clienteId}`)).json(),
    enabled:  !!clienteId,
    staleTime: 5000,
  })
  const cashback = cashbackRaw?.data

  // Vendas de hoje, para reimprimir. Só busca com o painel aberto, e recarrega
  // ao abrir: a venda que o operador acabou de fazer tem que estar na lista.
  const hojeIso = new Date().toISOString().slice(0, 10)
  const { data: vendasDiaRaw, isFetching: carregandoVendas } = useQuery({
    queryKey: ['pdv-vendas-dia', tenantSlug, hojeIso],
    queryFn:  async () => (await fetch(
      `/api/${tenantSlug}/vendas?dataInicio=${hojeIso}&dataFim=${hojeIso}&limit=100`
    )).json(),
    enabled:  showVendasDia,
    staleTime: 0,
  })
  const vendasDia: any[] = vendasDiaRaw?.data?.data ?? vendasDiaRaw?.data ?? []

  const criarClienteMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/${tenantSlug}/cadastros/clientes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoPessoa:   novoCli.tipoPessoa,
          documento:    novoCli.documento.trim() || undefined,
          nomeCompleto: novoCli.nomeCompleto.trim(),
          nomeFantasia: novoCli.nomeFantasia.trim() || undefined,
          email:        novoCli.email.trim() || undefined,
          celular:      novoCli.celular.trim() || undefined,
          telefone:     novoCli.telefone.trim() || undefined,
          cep:          novoCli.cep.trim() || undefined,
          endereco:     novoCli.endereco.trim() || undefined,
          numero:       novoCli.numero.trim() || undefined,
          complemento:  novoCli.complemento.trim() || undefined,
          bairro:       novoCli.bairro.trim() || undefined,
          cidade:       novoCli.cidade.trim() || undefined,
          uf:           novoCli.uf.trim().toUpperCase().slice(0, 2) || undefined,
          observacao:   novoCli.observacao.trim() || undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao criar cliente')
      return d
    },
    onSuccess: (d) => {
      const cli = d?.data
      if (cli?.clienteId) {
        setClienteId(String(cli.clienteId))
        setClienteNomeDisplay(novoCli.nomeCompleto.trim())
        // Cliente criado aqui nasce em varejo. Para outra tabela, use o
        // cadastro completo em Cadastros → Clientes.
        setTabelaPreco('varejo')
        // Mesma montagem de selecionarCliente: quem acabou de digitar o
        // endereço não deve digitar de novo no campo de entrega.
        const doCadastro = enderecoDoCadastro({
          endereco: novoCli.endereco.trim(), numero: novoCli.numero.trim(),
          cidade:   novoCli.cidade.trim(),   uf:     novoCli.uf.trim().toUpperCase(),
        })
        setEnderecoCadastro(doCadastro)
        if (doCadastro) setEnderecoEntrega(doCadastro)
      }
      setShowCadastrarCliente(false)
      setNovoCli(CLI_VAZIO)
      qc.invalidateQueries({ queryKey: ['pdv-clientes', tenantSlug] })
    },
    onError: (e: any) => toast(e.message || 'Erro ao criar cliente.', 'error'),
  })

  const venderMut = useMutation({
    mutationFn: async () => {
      const descontoVal  = Math.round(parseFloat(desconto.replace(',', '.') || '0') * 100)
      const acrescimoVal = Math.round(parseFloat(acrescimo.replace(',', '.') || '0') * 100)
      const totalVal     = Math.max(0, subtotal - descontoVal + acrescimoVal)

      // Cashback a resgatar nesta venda
      const saldoCash   = cashback?.programaAtivo ? (cashback?.saldoCentavos ?? 0) : 0
      const elegivel    = saldoCash > 0 && saldoCash >= (cashback?.saldoMinimoUsoCentavos ?? 0)
      const limiteCash  = Math.floor(totalVal * ((cashback?.limiteUsoPctBp ?? 10000) / 10000))
      const cashUsar    = (usarCashback && elegivel) ? Math.max(0, Math.min(saldoCash, limiteCash, totalVal)) : 0
      const totalPagar  = Math.max(0, totalVal - cashUsar)

      const res = await fetch(`/api/${tenantSlug}/vendas`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId:      clienteId ? Number(clienteId) : undefined,
          nomeClienteAvulso: clienteId ? undefined : (nomeAvulso.trim() || undefined),
          tipoEntrega:    tipoEntrega || (isDelivery ? 'Entrega' : 'Retirada'),
          dataEntrega:    dataEntrega || undefined,
          enderecoEntrega: enderecoEntrega || undefined,
          vendedor:       vendedor || undefined,
          observacao:     observacao || undefined,
          documentoFiscal: comNota ? 'nfce' : 'nenhum',
          imprimirNota:    comNota && imprimirNota,
          numeroCaixa:     numeroCaixa ?? undefined,
          // O desconto de cada linha vai no próprio item; o servidor soma tudo
          // no desconto da venda. tipoPrecao diz ao VendaService qual coluna de
          // preço usar — e fica gravado em t_venda_item para o histórico.
          itens:      carrinho.map(i => ({
            produtoId:  i.produtoId,
            quantidade: i.quantidade,
            desconto:   i.desconto,
            tipoPrecao: tabelaPreco,
          })),
          // Acréscimo embutido no total via "desconto líquido": o servidor faz
          // total = subtotal - desconto, então enviamos (desconto - acréscimo).
          // Assim não há linha de frete tributável e o banco não muda.
          desconto:   descontoVal - acrescimoVal,
          usarCashback: cashUsar > 0 ? cashUsar : undefined,
          pagamentos: totalPagar > 0
            ? [{ forma: formaPgto || formasNomes[0] || 'PIX', valor: totalPagar }]
            : [],
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: (d) => {
      const usado = d?.data?.cashbackUsado ?? 0
      const ganho = d?.data?.cashbackCreditado ?? 0

      // Congela os dados da venda ANTES do reset, para o cupom
      const dVal = Math.round(parseFloat(desconto.replace(',', '.') || '0') * 100)
      const aVal = Math.round(parseFloat(acrescimo.replace(',', '.') || '0') * 100)
      const tot  = Math.max(0, Math.max(0, subtotal - dVal + aVal) - usado)
      const trocoVal = (formaPgto === 'Dinheiro' || formaPgto === 'dinheiro') && valorRecebido
        ? Math.max(0, Math.round(parseFloat(valorRecebido) * 100) - tot) : 0

      setCupomVenda({
        vendaId:   d?.data?.vendaId ?? d?.data?.id ?? null,
        itens:     [...carrinho],
        subtotal:  subtotalBruto, desconto: dVal + descontoItens, acrescimo: aVal,
        cashbackUsado: usado, total: tot,
        forma:     formaPgto || formasNomes[0] || 'PIX',
        troco:     trocoVal,
        // O cupom mostra quem comprou: cliente cadastrado ou o nome avulso.
        cliente:   clienteNomeDisplay || nomeAvulso.trim(),
        vendedor,
        tabela:    ehAtacado ? rotuloTabela : '',
        empresa,
        qtdItens:  carrinho.reduce((a, i) => a + i.quantidade, 0),
        // O QUE MANDA É TER ENDEREÇO, NÃO O MODO DA TELA.
        //
        // Antes só saía no cupom quando o PDV estava em Delivery. Mas o campo
        // de endereço também existe em Balcão, dentro de Dados adicionais, e a
        // venda grava o que for digitado ali. O cupom era o único que ignorava:
        // o entregador recebia a via sem o endereço que o operador tinha
        // acabado de preencher.
        enderecoEntrega: enderecoEntrega.trim(),
        dataHora:  new Date().toLocaleString('pt-BR'),
      })

      setCarrinho([])
      // Volta ao padrão: nota ligada, impressão desligada. A venda seguinte
      // começa emitindo, e quem não quer nota desmarca — é a exceção que paga
      // o clique, não a regra.
      setComNota(true)
      setImprimirNota(false)
      setDesconto('0')
      setAcrescimo('0')
      setValorRecebido('')
      setClienteId('')
      setClienteNomeDisplay('')
      setNomeAvulso('')
      setTabelaPreco('varejo')
      setBuscaCliente('')
      setVendedor('')
      setTipoEntrega(isDelivery ? 'Entrega' : 'Retirada')
      setObservacao('')
      setDataEntrega('')
      setEnderecoEntrega('')
      setEnderecoCadastro('')
      setUsarCashback(false)
      setShowExtras(false)
      setShowCadastrarCliente(false)
      // Venda fechada devolve o operador ao catálogo, pronto para a próxima.
      // É a única situação em que este painel fecha sozinho.
      setPainelAberto(false)
      setEtapa('itens')
      setVendaOk(true)
      setTimeout(() => { setVendaOk(false); searchRef.current?.focus() }, 2000)

      qc.invalidateQueries({ queryKey: ['vendas', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['vendas-kpis', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['estoque-produtos', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['estoque-insumos', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['pdv-cashback', tenantSlug] })

      if (usado > 0 || ganho > 0) {
        toast(`Venda registrada! ${usado > 0 ? `Cashback usado: ${fmt(usado)}. ` : ''}${ganho > 0 ? `Ganhou ${fmt(ganho)} de cashback.` : ''}`)
      } else {
        toast('Venda registrada!')
      }
    },
    onError: (e: any) => toast(e.message || 'Erro ao registrar venda.', 'error'),
  })

  // VENDA A PRAZO PARCELADA.
  //
  // Não inventa um caminho de receita novo: cria um Pedido de balcão já
  // entregue, na hora. Isso reaproveita 100% do fluxo que já existe e já
  // roda em produção — baixa de estoque na entrega, e "a venda nasce na
  // baixa da conta a receber", igual a qualquer pedido. A diferença é só a
  // origem (PDV em vez da tela de Pedidos) e o número de parcelas.
  //
  // Por isso não usa desconto/acréscimo do cabeçalho: o pedido não tem esses
  // campos, só valorEntrega. O desconto por item continua valendo, embutido
  // no preço unitário efetivo de cada linha.
  const venderAPrazoMut = useMutation({
    mutationFn: async () => {
      const hoje = new Date().toISOString().slice(0, 10)
      const resPedido = await fetch(`/api/${tenantSlug}/pedidos`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId:         clienteId ? Number(clienteId) : undefined,
          nomeClienteAvulso: clienteId ? undefined : (nomeAvulso.trim() || undefined),
          tipoVenda:  'balcao',
          dataPedido: hoje,
          observacao: observacao || undefined,
          itens: carrinho.map(i => ({
            produtoId:     i.produtoId,
            quantidade:    i.quantidade,
            // Preço unitário efetivo, já líquido do desconto do item — o
            // pedido não tem uma coluna de desconto por linha separada.
            precoUnitario: Math.round(i.subtotal / i.quantidade),
          })),
        }),
      })
      const dPedido = await resPedido.json()
      if (!resPedido.ok) throw new Error(dPedido.message || 'Erro ao criar o pedido da venda a prazo.')
      const pedidoId = dPedido?.data?.pedidoId ?? dPedido?.data?.id
      if (!pedidoId) throw new Error('Pedido criado sem id — não deu para confirmar a entrega.')

      const resEntrega = await fetch(`/api/${tenantSlug}/pedidos/${pedidoId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'entregue', totalParcelas: Math.max(1, Number(parcelas) || 1) }),
      })
      const dEntrega = await resEntrega.json()
      if (!resEntrega.ok) throw new Error(dEntrega.message || 'Pedido criado, mas a entrega/parcelamento falhou. Confira em Pedidos.')
      return dEntrega
    },
    onSuccess: (d) => {
      setCarrinho([])
      setDesconto('0')
      setAcrescimo('0')
      setClienteId('')
      setClienteNomeDisplay('')
      setNomeAvulso('')
      setTabelaPreco('varejo')
      setBuscaCliente('')
      setVendedor('')
      setObservacao('')
      setFormaPgto('')
      setParcelas('2')
      setShowExtras(false)
      setShowCadastrarCliente(false)
      setPainelAberto(false)
      setEtapa('itens')
      setVendaOk(true)
      setTimeout(() => { setVendaOk(false); searchRef.current?.focus() }, 2000)

      qc.invalidateQueries({ queryKey: ['estoque-produtos', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['estoque-insumos', tenantSlug] })

      toast(d?.data?.message || 'Venda a prazo registrada!')
    },
    onError: (e: any) => toast(e.message || 'Erro ao registrar venda a prazo.', 'error'),
  })

  // Recalcula o subtotal da linha respeitando o desconto do item
  function recalc(i: ItemCarrinho): ItemCarrinho {
    const bruto = i.quantidade * i.precoUnitario
    const desc  = Math.max(0, Math.min(i.desconto, bruto))
    return { ...i, desconto: desc, subtotal: bruto - desc }
  }

  function addProduto(produto: any) {
    const preco = precoDoProduto(produto, tabelaPreco)
    setCarrinho(prev => {
      const existing = prev.find(i => i.produtoId === produto.produtoId)
      if (existing) {
        return prev.map(i => i.produtoId === produto.produtoId
          ? recalc({ ...i, quantidade: i.quantidade + 1 })
          : i
        )
      }
      return [...prev, {
        produtoId: produto.produtoId, nomeProduto: produto.nome,
        codigoBarras: produto.codigoBarras ?? '', unidade: produto.unidade ?? 'un',
        quantidade: 1, precoUnitario: preco, desconto: 0, subtotal: preco,
      }]
    })
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  function alterarQtd(produtoId: number, delta: number) {
    setCarrinho(prev => prev
      .map(i => i.produtoId === produtoId ? recalc({ ...i, quantidade: i.quantidade + delta }) : i)
      .filter(i => i.quantidade > 0)
    )
  }

  function definirQtd(produtoId: number, valor: string) {
    const q = Math.max(0, Math.floor(Number(valor) || 0))
    setCarrinho(prev => prev
      .map(i => i.produtoId === produtoId ? recalc({ ...i, quantidade: q }) : i)
      .filter(i => i.quantidade > 0)
    )
  }

  function definirDescontoItem(produtoId: number, valor: string) {
    const d = Math.max(0, Math.round(parseFloat(String(valor).replace(',', '.') || '0') * 100))
    setCarrinho(prev => prev.map(i => i.produtoId === produtoId ? recalc({ ...i, desconto: d }) : i))
  }

  function removerItem(produtoId: number) {
    setCarrinho(prev => prev.filter(i => i.produtoId !== produtoId))
  }

  function selecionarCliente(c: any) {
    setClienteId(String(c.clienteId))
    // Mostra o nome pelo qual a loja conhece o cliente, igual à listagem
    // de Clientes e à lista de resultados aqui em cima.
    setClienteNomeDisplay(c.nomeFantasia?.trim() || c.nomeCompleto)
    // Escolher um cliente de verdade descarta o nome solto.
    setNomeAvulso('')
    // É aqui que a tabela de preço do cliente entra em vigor.
    setTabelaPreco(c.tabelaPreco ?? 'varejo')
    setBuscaCliente('')
    const doCadastro = enderecoDoCadastro(c)
    setEnderecoCadastro(doCadastro)
    if (doCadastro) setEnderecoEntrega(doCadastro)
    if (c.tabelaPreco && c.tabelaPreco !== 'varejo') {
      toast(`Preço de ${(TIPOS_PRECO as any)[c.tabelaPreco]} aplicado.`)
    }
  }

  function limparCliente() {
    setClienteId(''); setClienteNomeDisplay(''); setBuscaCliente(''); setUsarCashback(false)
    setNomeAvulso('')
    setTabelaPreco('varejo')
    setEnderecoCadastro('')
  }

  function handleBuscaKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const exato = todosProdutos.find((p: any) => p.codigoBarras === busca.trim())
    if (exato) { addProduto(exato); setBusca('') }
  }

  // Exclui produtos marcados como insumo (produto-insumo): eles NÃO são vendáveis,
  // só existem para compor a ficha técnica de outros produtos.
  const todosProdutos = (Array.isArray(produtosRaw?.data?.data) ? produtosRaw.data.data
    : Array.isArray(produtosRaw?.data) ? produtosRaw.data : [])
    .filter((p: any) => !p.insumoFlg)

  // Trocar a tabela de preço com itens já no carrinho recalcula todas as linhas.
  // Sem isto, escolher o cliente depois de montar o carrinho fecharia a venda no
  // preço de varejo para um cliente de atacado — erro caro e silencioso.
  useEffect(() => {
    setCarrinho(prev => {
      if (prev.length === 0) return prev
      let mudou = false
      const novo = prev.map(i => {
        const p = todosProdutos.find((x: any) => x.produtoId === i.produtoId)
        if (!p) return i
        const novoPreco = precoDoProduto(p, tabelaPreco)
        if (!novoPreco || novoPreco === i.precoUnitario) return i
        mudou = true
        return recalc({ ...i, precoUnitario: novoPreco })
      })
      return mudou ? novo : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabelaPreco])

  const clientes  = Array.isArray(clientesRaw?.data?.data) ? clientesRaw.data.data
    : Array.isArray(clientesRaw?.data) ? clientesRaw.data : []
  const usuarios  = Array.isArray(usuariosRaw?.data?.data) ? usuariosRaw.data.data
    : Array.isArray(usuariosRaw?.data) ? usuariosRaw.data : []

  const categorias = useMemo(() => {
    const set = new Set<string>()
    for (const p of todosProdutos) if (p.categoria) set.add(p.categoria)
    return [TODAS, ...Array.from(set)]
  }, [todosProdutos])

  const produtosFiltrados = useMemo(() => {
    return todosProdutos.filter((p: any) => {
      const passaCategoria = categoria === TODAS || p.categoria === categoria
      const buscaLower = busca.trim().toLowerCase()
      const passaBusca = !buscaLower || p.nome?.toLowerCase().includes(buscaLower) || p.codigoBarras === busca.trim()
      return passaCategoria && passaBusca
    })
  }, [todosProdutos, categoria, busca])

  const formas      = Array.isArray(formasRaw?.data) ? formasRaw.data : []
  const formasNomes = formas.map((f: any) => f.nome).filter(Boolean)

  // subtotal continua sendo a soma das linhas JÁ líquidas do desconto de item —
  // as contas de total, cashback e troco seguem exatamente como antes.
  const subtotal      = carrinho.reduce((a, i) => a + i.subtotal, 0)
  const subtotalBruto = carrinho.reduce((a, i) => a + i.quantidade * i.precoUnitario, 0)
  const descontoItens = carrinho.reduce((a, i) => a + i.desconto, 0)
  const descontoVal   = Math.round(parseFloat(desconto.replace(',', '.') || '0') * 100)
  const acrescimoVal  = Math.round(parseFloat(acrescimo.replace(',', '.') || '0') * 100)
  const total         = Math.max(0, subtotal - descontoVal + acrescimoVal)
  const descontoGeralExibido = descontoItens + descontoVal
  const descontoPct   = subtotalBruto > 0 ? (descontoGeralExibido / subtotalBruto) * 100 : 0

  // Cashback aplicável nesta venda (para exibição)
  const saldoCashback   = cashback?.programaAtivo ? (cashback?.saldoCentavos ?? 0) : 0
  const cashbackElegivel = saldoCashback > 0 && saldoCashback >= (cashback?.saldoMinimoUsoCentavos ?? 0)
  const limiteCashback  = Math.floor(total * ((cashback?.limiteUsoPctBp ?? 10000) / 10000))
  const cashbackAplicar = (usarCashback && cashbackElegivel) ? Math.max(0, Math.min(saldoCashback, limiteCashback, total)) : 0
  const totalAPagar     = Math.max(0, total - cashbackAplicar)

  const troco       = (formaPgto === 'Dinheiro' || formaPgto === 'dinheiro') && valorRecebido
    ? Math.max(0, Math.round(parseFloat(valorRecebido) * 100) - totalAPagar) : 0

  const enderecoOk = !isDelivery || enderecoEntrega.trim().length > 0
  // A prazo vira Pedido, e Pedido exige saber pra quem vende — cliente
  // cadastrado ou, no mínimo, um nome avulso. Sem isso a conta a receber
  // nasceria sem ninguém pra cobrar.
  const isAPrazo = formaPgto === 'A Prazo'
  const clienteObrigatorioOk = !isAPrazo || !!(clienteId || nomeAvulso.trim())
  // Caixa fechado bloqueia a venda — é o ponto do controle de turno. Sem esta
  // linha o turno seria enfeite: abriria, fecharia, e as vendas aconteceriam
  // do mesmo jeito, que era exatamente a situação de antes.
  const podeVender = carrinho.length > 0 && !venderMut.isPending && !venderAPrazoMut.isPending
    && enderecoOk && !caixaTravado && clienteObrigatorioOk
  const qtdItens = carrinho.reduce((a, i) => a + i.quantidade, 0)

  function abrirPainel(destino: EtapaPainel = 'itens') {
    if (carrinho.length === 0) return
    setEtapa(destino)
    setPainelAberto(true)
  }

  // Atalhos: F2 busca · F3 cliente · F6 desconto · F8 vai direto ao pagamento,
  // pulando a revisão · F10 avança uma etapa por vez · Ctrl+P reimprime
  // Ctrl+Delete limpa o carrinho · Esc volta uma etapa.
  //
  // O ouvinte roda na fase de captura e interrompe a propagação quando há um
  // modal de confirmação aberto. Sem isso, o Esc que fecha a confirmação
  // chegaria também ao SidePanel e fecharia o painel de finalização junto.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // ── Reimpressão: Ctrl+P ────────────────────────────────────────────────
      //
      // Toma o lugar do imprimir do navegador de propósito. Num PDV, Ctrl+P
      // significa cupom; a impressão da página inteira nunca serve para nada
      // aqui e só desperdiça bobina.
      //
      // Vem antes de tudo para funcionar mesmo com painel ou modal aberto: o
      // cliente pede a segunda via a qualquer momento.
      if (e.key.toLowerCase() === 'p' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        e.stopImmediatePropagation()
        setLinhaSel(0)
        setShowVendasDia(v => !v)
        return
      }

      // Dentro do painel de vendas o teclado manda: setas escolhem, Enter
      // imprime, Esc fecha. Sem isso o operador teria que largar o teclado.
      if (showVendasDia) {
        if (e.key === 'Escape')    { e.preventDefault(); e.stopImmediatePropagation(); setShowVendasDia(false); return }
        if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); setLinhaSel(i => Math.min(i + 1, Math.max(0, vendasDia.length - 1))); return }
        if (e.key === 'ArrowUp')   { e.preventDefault(); e.stopImmediatePropagation(); setLinhaSel(i => Math.max(0, i - 1)); return }
        if (e.key === 'Enter') {
          e.preventDefault(); e.stopImmediatePropagation()
          const v = vendasDia[linhaSel]
          if (v) reimprimir(v.vendaId)
          return
        }
        return
      }

      const algumModal = confirmVenda || !!cupomVenda || confirmLimpar
      if (e.key === 'Escape' && algumModal) {
        e.stopImmediatePropagation()
        if (confirmVenda) setConfirmVenda(false)
        else if (cupomVenda) setCupomVenda(null)
        else if (confirmLimpar) setConfirmLimpar(false)
        return
      }
      if (e.key === 'Escape' && painelAberto && etapa === 'pagamento') {
        e.stopImmediatePropagation()
        setEtapa('itens')
        return
      }
      if (algumModal) return
      if (e.key === 'F2')  { e.preventDefault(); setPainelAberto(false); setTimeout(() => { searchRef.current?.focus(); searchRef.current?.select() }, 60) }
      if (e.key === 'F3')  { e.preventDefault(); abrirPainel('pagamento'); setTimeout(() => clienteRef.current?.focus(), 120) }
      if (e.key === 'F6')  { e.preventDefault(); abrirPainel('pagamento'); setTimeout(() => { descontoRef.current?.focus(); descontoRef.current?.select() }, 120) }
      if (e.key === 'F8')  { e.preventDefault(); abrirPainel('pagamento'); setTimeout(() => pgtoRef.current?.focus(), 120) }
      if (e.key === 'F10') {
        e.preventDefault()
        if (carrinho.length === 0) return
        if (!painelAberto)        { abrirPainel('itens'); return }
        if (etapa === 'itens')    { setEtapa('pagamento'); return }
        if (podeVender)           { setConfirmVenda(true) }
      }
      if (e.key === 'Delete' && e.ctrlKey) { e.preventDefault(); if (carrinho.length > 0) setConfirmLimpar(true) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [podeVender, carrinho.length, confirmVenda, cupomVenda, confirmLimpar, painelAberto, etapa, showVendasDia, vendasDia, linhaSel])

  // Carrinho esvaziado com o painel aberto: não há o que conferir nem pagar.
  useEffect(() => {
    if (painelAberto && carrinho.length === 0) { setPainelAberto(false); setEtapa('itens') }
  }, [carrinho.length, painelAberto])

  // ── Cupom (NÃO FISCAL) ────────────────────────────────────────────────────
  // Formatado para bobina de 80mm. Traz cabeçalho da empresa, itens com
  // código/quantidade/unidade/valor unitário/total e o resumo de pagamento.
  //
  // O que NÃO existe aqui, e não pode existir: chave de acesso, protocolo de
  // autorização, QR code fiscal ou o texto "Documento Auxiliar da NFC-e".
  // Esses dados são emitidos pela SEFAZ e só aparecem quando a nota é
  // realmente transmitida. Imprimi-los num cupom não fiscal seria simular
  // documento fiscal.
  function imprimirCupom(v: any) {
    const win = window.open('', '_blank', 'width=380,height=640')
    if (!win) { toast('Habilite pop-ups para imprimir o cupom.', 'error'); return }

    const e = v.empresa ?? {}
    const esc = (t: any) => String(t ?? '').replace(/[&<>]/g, (c: string) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))

    // Cabeçalho: o NOME FANTASIA vem em destaque — é por ele que o cliente
    // conhece a loja. A razão social entra abaixo, menor, porque é exigência
    // de identificação, não de comunicação.
    const fantasia = esc(e.nomeFantasia || e.nomeEmpresa || tenantName(tenantSlug))
    const razao    = esc(e.nomeFantasia ? (e.nomeEmpresa || '') : '')
    const linhaEndereco = [
      esc(e.endereco), e.numero ? esc(e.numero) : '', esc(e.bairro),
    ].filter(Boolean).join(', ')
    const linhaCidade = [esc(e.cidade), esc(e.uf)].filter(Boolean).join('/')
    const linhaFone   = e.telefone ? `FONE: ${esc(e.telefone)}` : ''
    const linhaDoc    = [
      e.cnpj ? `CNPJ:${esc(e.cnpj)}` : '',
      e.inscricaoEstadual ? `IE:${esc(e.inscricaoEstadual)}` : '',
    ].filter(Boolean).join('   ')

    const linhas = (v.itens ?? []).map((i: any, idx: number) => {
      const cod  = esc(i.codigoBarras || i.produtoId)
      const qtd  = Number(i.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 3 })
      const un   = esc(i.unidade || 'UN')
      const unit = (i.precoUnitario / 100).toFixed(2).replace('.', ',')
      const tot  = (i.subtotal / 100).toFixed(2).replace('.', ',')
      const desc = i.desconto > 0
        ? `<tr><td colspan="4" class="desc">desconto -${(i.desconto / 100).toFixed(2).replace('.', ',')}</td></tr>`
        : ''
      return `
        <tr class="it"><td colspan="4">${String(idx + 1).padStart(3, '0')} ${cod} ${esc(i.nomeProduto)}</td></tr>
        <tr><td class="q">${qtd}</td><td class="u">${un}</td><td class="r">${unit}</td><td class="r">${tot}</td></tr>
        ${desc}`
    }).join('')

    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Cupom</title><style>
      /* LEGIBILIDADE EM IMPRESSORA TÉRMICA.
         O cupom saía claro e pequeno. Três coisas resolvem:
         - fonte maior (13px de base, contra 12) e entrelinha folgada;
         - peso 700 em quase tudo: térmica queima o papel por ponto, e o
           traço grosso sai visivelmente mais escuro que o fino;
         - print-color-adjust exact, para o navegador não "economizar" tinta.
         A fonte é a mesma família das impressoras fiscais — monospace com
         alinhamento previsível em coluna. */
      @page { size: 80mm auto; margin: 0; }
      * {
        font-family: 'Consolas', 'DejaVu Sans Mono', 'Courier New', monospace;
        color: #000;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body {
        width: 72mm; margin: 0; padding: 4mm 3mm;
        font-size: 13px; line-height: 1.35; font-weight: 700;
      }
      h1 {
        font-size: 19px; text-align: center; margin: 0 0 2px;
        font-weight: 900; letter-spacing: .5px;
      }
      p { margin: 1px 0; }
      .c { text-align: center; } .r { text-align: right; }
      .b { font-weight: 900; }
      .peq  { font-size: 12px; }
      .mini { font-size: 11px; font-weight: 400; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 0; vertical-align: top; }
      td.q { width: 24%; } td.u { width: 13%; }
      tr.it td { padding-top: 5px; font-size: 13px; }
      .desc { font-size: 11px; padding-left: 10px; font-weight: 400; }
      hr { border: none; border-top: 2px solid #000; margin: 5px 0; }
      hr.leve { border-top: 1px dashed #000; }
      .titulo { font-size: 15px; font-weight: 900; letter-spacing: 1px; }
      .tot { font-weight: 900; font-size: 20px; }
      .aviso { font-size: 11px; text-align: center; margin-top: 6px; font-weight: 400; }
    </style></head><body>

      <h1>${fantasia}</h1>
      ${razao ? `<p class="c mini">${razao}</p>` : ''}
      ${linhaEndereco ? `<p class="c peq">${linhaEndereco}</p>` : ''}
      ${linhaCidade || linhaFone ? `<p class="c peq">${[linhaCidade, linhaFone].filter(Boolean).join('   ')}</p>` : ''}
      ${linhaDoc ? `<p class="c peq">${linhaDoc}</p>` : ''}

      <hr/>
      <p class="c titulo">CUPOM NÃO FISCAL</p>
      <p class="c mini">Sem valor fiscal · não substitui a NFC-e</p>
      ${v.segundaVia ? `<p class="c titulo">** 2ª VIA — REIMPRESSÃO **</p>` : ''}
      <hr/>

      <table class="peq">
        <tr><td>${v.vendaId ? `VENDA Nº ${String(v.vendaId).padStart(6, '0')}` : ''}</td>
            <td class="r">${esc(v.dataHora)}</td></tr>
        ${v.vendedor ? `<tr><td colspan="2">OPERADOR: ${esc(v.vendedor)}</td></tr>` : ''}
      </table>

      <hr/>
      <table class="peq">
        <tr class="b"><td colspan="4">CÓDIGO  DESCRIÇÃO</td></tr>
        <tr class="b"><td class="q">QTDE</td><td class="u">UN</td><td class="r">VL UNIT</td><td class="r">VL TOTAL</td></tr>
      </table>
      <hr class="leve"/>
      <table>${linhas}</table>
      <hr/>

      <table>
        <tr><td>Qtde. total de itens</td><td class="r">${v.qtdItens ?? (v.itens ?? []).length}</td></tr>
        <tr><td>Subtotal</td><td class="r">${(v.subtotal / 100).toFixed(2).replace('.', ',')}</td></tr>
        ${v.desconto > 0 ? `<tr><td>Descontos</td><td class="r">-${(v.desconto / 100).toFixed(2).replace('.', ',')}</td></tr>` : ''}
        ${v.acrescimo > 0 ? `<tr><td>Acréscimo</td><td class="r">+${(v.acrescimo / 100).toFixed(2).replace('.', ',')}</td></tr>` : ''}
        ${v.cashbackUsado > 0 ? `<tr><td>Cashback</td><td class="r">-${(v.cashbackUsado / 100).toFixed(2).replace('.', ',')}</td></tr>` : ''}
      </table>
      <hr class="leve"/>
      <table>
        <tr><td class="tot">VALOR A PAGAR</td><td class="r tot">${(v.total / 100).toFixed(2).replace('.', ',')}</td></tr>
      </table>
      <hr/>

      <table class="peq">
        <tr><td>FORMA DE PAGAMENTO</td><td class="r">VALOR R$</td></tr>
        <tr class="b"><td>${esc(v.forma).toUpperCase()}</td><td class="r">${(v.total / 100).toFixed(2).replace('.', ',')}</td></tr>
        ${v.troco > 0 ? `<tr class="b"><td>TROCO</td><td class="r">${(v.troco / 100).toFixed(2).replace('.', ',')}</td></tr>` : ''}
      </table>

      <hr/>
      <p class="peq">CONSUMIDOR: ${v.cliente ? esc(v.cliente) : 'NÃO IDENTIFICADO'}</p>
      ${v.tabela ? `<p class="peq">TABELA DE PREÇO: ${esc(v.tabela)}</p>` : ''}
      ${v.enderecoEntrega ? `<p class="peq">ENTREGA: ${esc(v.enderecoEntrega)}</p>` : ''}

      <hr/>
      <p class="c peq">${esc(e.mensagemCupom || 'Obrigado pela preferência!')}</p>
      <p class="aviso">Este documento não é válido como comprovante fiscal.</p>

    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  // ── REIMPRESSÃO ───────────────────────────────────────────────────────────
  //
  // Busca a venda gravada e remonta o cupom. Não é o mesmo objeto do momento
  // da venda: o banco guarda o que aconteceu, não o que foi digitado.
  //
  // O que não volta, e por quê:
  //   troco     — nunca foi gravado; era conta de tela, do valor recebido
  //   acréscimo — entra somado ao desconto como "desconto líquido" na venda
  //   unidade e código de barras do item — t_venda_item guarda só o nome
  //
  // O resto — itens, quantidades, valores, forma de pagamento, cliente — sai
  // igual, porque isso está no banco.
  async function reimprimir(vendaId: number) {
    try {
      const r = await fetch(`/api/${tenantSlug}/vendas/${vendaId}`)
      const d = await r.json()
      const v = d?.data
      if (!r.ok || !v) { toast(d?.message ?? 'Venda não encontrada.', 'error'); return }

      const itens = (v.itens ?? []).map((i: any) => ({
        produtoId:     i.produtoId,
        nomeProduto:   i.nomeProduto,
        quantidade:    Number(i.quantidade),
        precoUnitario: Number(i.precoUnitario ?? 0),
        subtotal:      Number(i.subtotal ?? 0),
        desconto:      Number(i.desconto ?? 0),
        unidade:       'UN',
        codigoBarras:  '',
      }))

      const pgto = (v.pagamentos ?? [])[0]

      imprimirCupom({
        segundaVia: true,
        vendaId:    v.vendaId,
        itens,
        subtotal:   Number(v.subtotal ?? 0),
        desconto:   Number(v.desconto ?? 0),
        acrescimo:  0,
        cashbackUsado: 0,
        total:      Number(v.total ?? 0),
        forma:      pgto?.forma ?? '—',
        troco:      0,
        cliente:    v.clienteNome ?? '',
        vendedor:   v.vendedor ?? '',
        tabela:     '',
        empresa,
        qtdItens:   itens.reduce((a: number, i: any) => a + i.quantidade, 0),
        enderecoEntrega: v.enderecoEntrega ?? '',
        dataHora:   new Date(v.vendidaEm).toLocaleString('pt-BR'),
      })
    } catch {
      toast('Erro ao buscar a venda.', 'error')
    }
  }

  // Nome legível a partir do slug, só como último recurso de identificação
  function tenantName(slug: string) {
    return slug.replace(/-/g, ' ').toUpperCase()
  }

  // ── Resumo de valores — reaproveitado nas duas etapas do painel ────────────
  const resumoValores = (
    <div className="space-y-1.5">
      {ehAtacado && (
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Tabela aplicada</span>
          <span className="font-semibold text-gray-700">{rotuloTabela}</span>
        </div>
      )}
      <div className="flex justify-between text-sm">
        <span className="text-gray-500">Sub-total</span>
        <span className="font-medium text-gray-900">{fmt(subtotalBruto)}</span>
      </div>
      {descontoGeralExibido > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">
            Descontos <span className="text-xs text-gray-400">({descontoPct.toFixed(2)}%)</span>
          </span>
          <span className="font-medium text-red-600">-{fmt(descontoGeralExibido)}</span>
        </div>
      )}
      {acrescimoVal > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Acréscimo{isDelivery ? ' (entrega)' : ''}</span>
          <span className="font-medium text-gray-900">+{fmt(acrescimoVal)}</span>
        </div>
      )}
      {cashbackAplicar > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Cashback</span>
          <span className="font-medium text-red-600">-{fmt(cashbackAplicar)}</span>
        </div>
      )}
      <div className="flex justify-between items-baseline border-t border-gray-100 pt-2">
        <span className="text-sm font-bold text-gray-900">Total da venda</span>
        <span className="text-2xl font-semibold" style={{ color: VERDE }}>{fmt(totalAPagar)}</span>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col min-h-0 gap-3">

      {/* ── ETAPA 1 — CATÁLOGO EM TELA CHEIA ─────────────────────────────── */}

      <div className="flex items-start justify-between gap-3 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{isDelivery ? 'Delivery' : 'Pedido Balcão'}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{isDelivery ? 'Venda para entrega — informe o endereço do cliente' : 'Selecione uma categoria ou busque o produto'}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Tabela de preço em vigor — só aparece quando não é varejo */}
          {ehAtacado && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              <Tag size={12} /> {rotuloTabela}
            </span>
          )}
          {/* Tamanho da tela neste computador */}
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
            {([
              { k: 'compacto', l: 'A−' },
              { k: 'normal',   l: 'A'  },
              { k: 'grande',   l: 'A+' },
            ] as const).map(o => (
              <button key={o.k} onClick={() => mudarDensidade(o.k)}
                title="Tamanho da tela neste computador"
                className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  densidade === o.k ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}>
                {o.l}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => { setLinhaSel(0); setShowVendasDia(true) }}>
            <Printer size={14} className="mr-1.5" /> 2ª via <span className="ml-1.5 text-gray-400">(Ctrl+P)</span>
          </Button>
          <InfoTip titulo="Atalhos" ariaLabel="Atalhos de teclado">
            <span className="block">F2 — buscar produto</span>
            <span className="block">F3 — cliente</span>
            <span className="block">F6 — desconto</span>
            <span className="block">F8 — ir direto ao pagamento</span>
            <span className="block">F10 — avançar / finalizar</span>
            <span className="block">Ctrl + P — reimprimir cupom do dia</span>
            <span className="block">Ctrl + Delete — limpar carrinho</span>
            <span className="block">Esc — voltar</span>
          </InfoTip>
        </div>
      </div>

      {/* CONTROLE DE CAIXA — no topo, sempre visível.
          Estava dentro do drawer de fechamento da venda, e isso criava um beco
          sem saída: com o caixa fechado a venda fica bloqueada, então o
          operador não conseguia abrir o painel onde ficava o botão de abrir o
          caixa. Aqui ele é a primeira coisa da tela, como deve ser. */}
      {turnoObrigatorio && (
        <div className="flex-shrink-0">
          <PainelCaixa tenantSlug={tenantSlug} operador={vendedor} qtdCaixas={qtdCaixas} />
        </div>
      )}

      <div className="relative flex-shrink-0">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input ref={searchRef} value={busca} onChange={e => setBusca(e.target.value)}
          onKeyDown={handleBuscaKeyDown} placeholder="Digite o nome ou bipe o código de barras…   (F2)"
          className="pl-9 pr-9 h-12 text-base" />
        {busca && (
          <button onClick={() => { setBusca(''); searchRef.current?.focus() }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      {categorias.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 flex-shrink-0">
          {categorias.map(cat => (
            <button key={cat} onClick={() => setCategoria(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors border ${
                categoria === cat ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}>
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* A grade agora usa a largura inteira: o carrinho saiu da lateral e virou
          a barra de baixo + o painel de finalização. */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loadingProd ? (
          <div className="flex items-center justify-center h-32"><Loader2 size={18} className="text-gray-300 animate-spin" /></div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
            <ShoppingCart size={28} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">{busca ? `Nenhum produto para "${busca}"` : 'Nenhum produto nesta categoria'}</p>
          </div>
        ) : (
          // Colunas calculadas pela largura real da tela (auto-fill), não por
          // breakpoint fixo: o card nunca fica menor que o mínimo legível,
          // seja qual for o notebook ou a escala do Windows.
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${dens.card}px, 1fr))` }}>
            {produtosFiltrados.map((p: any) => {
              const precoCard = precoDoProduto(p, tabelaPreco)
              const noCarrinho = carrinho.find(i => i.produtoId === p.produtoId)
              return (
                <button key={p.produtoId} onClick={() => addProduto(p)}
                  className={`relative bg-white rounded-lg border p-3 text-left transition-all active:scale-95 hover:shadow-sm ${
                    noCarrinho ? 'border-green-300' : 'border-gray-100 hover:border-green-200'
                  }`}>
                  {noCarrinho && (
                    <span style={{ backgroundColor: VERDE }} className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-semibold flex items-center justify-center">
                      {noCarrinho.quantidade}
                    </span>
                  )}
                  <p className={`${dens.titulo} font-medium text-gray-900 leading-tight line-clamp-2 pr-5`}>{p.nome}</p>
                  <p className={`${dens.preco} font-semibold mt-1`} style={{ color: VERDE }}>{precoCard ? fmt(precoCard) : '—'}</p>
                  <p className="text-xs text-gray-400">{p.unidade}{p.codigoBarras ? ` · ${p.codigoBarras}` : ''}</p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── BARRA DO CARRINHO — sempre visível, fecha a etapa 1 ───────────── */}
      <div className="flex-shrink-0 bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4">
        {vendaOk ? (
          <div className="flex items-center gap-2 flex-1">
            <CheckCircle size={18} className="text-green-600" />
            <span className="text-sm font-semibold text-gray-900">Venda registrada.</span>
          </div>
        ) : (
          <>
            <button
              onClick={() => abrirPainel('itens')}
              disabled={carrinho.length === 0}
              className="flex items-center gap-3 min-w-0 text-left disabled:cursor-default group"
            >
              <div className="relative flex-shrink-0">
                <ShoppingCart size={22} className={carrinho.length > 0 ? 'text-green-600' : 'text-gray-300'} />
                {carrinho.length > 0 && (
                  <span style={{ backgroundColor: VERDE }} className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-semibold flex items-center justify-center">
                    {qtdItens}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate group-enabled:group-hover:underline">
                  {carrinho.length === 0 ? 'Carrinho vazio' : `${carrinho.length} produto(s) · ${qtdItens} un`}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {carrinho.length === 0
                    ? 'Clique num produto para começar'
                    : (clienteNomeDisplay || nomeAvulso.trim() || 'Consumidor não identificado')}
                </p>
              </div>
            </button>

            <div className="ml-auto flex items-center gap-4 flex-shrink-0">
              {carrinho.length > 0 && (
                <button onClick={() => setConfirmLimpar(true)}
                  className="text-xs text-gray-400 hover:text-red-600 transition-colors">
                  Limpar
                </button>
              )}
              <div className="text-right">
                <p className="text-[11px] text-gray-400 leading-none">Total</p>
                <p className="text-2xl font-semibold leading-tight" style={{ color: VERDE }}>{fmt(totalAPagar)}</p>
              </div>
              <Button
                onClick={() => abrirPainel('itens')}
                disabled={carrinho.length === 0}
                className="h-12 px-6 text-base"
              >
                Revisar e finalizar
                <span className="ml-2 text-xs font-normal opacity-70">(F10)</span>
                <ChevronRight size={16} className="ml-1" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* ── ETAPA 2 — PAINEL LATERAL ─────────────────────────────────────── */}
      {painelAberto && (
        <SidePanel
          titulo={etapa === 'itens' ? 'Conferir itens' : 'Pagamento'}
          subtitulo={etapa === 'itens'
            ? `${carrinho.length} produto(s) · ${qtdItens} un`
            : `Total ${fmt(totalAPagar)}${ehAtacado ? ` · ${rotuloTabela}` : ''}`}
          largura="w-[38vw] min-w-[640px]"
          onClose={() => setPainelAberto(false)}
          cabecalho={
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-400">
              <span className={etapa === 'itens' ? 'text-gray-900' : ''}>1 Itens</span>
              <ChevronRight size={11} />
              <span className={etapa === 'pagamento' ? 'text-gray-900' : ''}>2 Pagamento</span>
            </span>
          }
          rodape={
            etapa === 'itens' ? (
              <>
                <Button variant="outline" onClick={() => setPainelAberto(false)}>
                  <ChevronLeft size={15} className="mr-1" /> Voltar ao catálogo
                </Button>
                <Button
                  onClick={() => setEtapa('pagamento')}
                  disabled={carrinho.length === 0}
                  className="h-11 px-6"
                >
                  Ir para pagamento
                  <span className="ml-2 text-xs font-normal opacity-70">(F8)</span>
                  <ChevronRight size={16} className="ml-1" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setEtapa('itens')}>
                  <ChevronLeft size={15} className="mr-1" /> Itens
                </Button>
                <Button
                  onClick={() => setConfirmVenda(true)}
                  disabled={!podeVender}
                  className="h-11 px-6"
                >
                  {(venderMut.isPending || venderAPrazoMut.isPending)
                    ? <><Loader2 size={16} className="animate-spin mr-2" /> Finalizando...</>
                    : <><CheckCircle size={16} className="mr-2" /> Finalizar — {fmt(totalAPagar)} <span className="ml-2 text-xs font-normal opacity-70">(F10)</span></>
                  }
                </Button>
              </>
            )
          }
        >
          {/* ── PAINEL, PARTE 1: ITENS ───────────────────────────────────── */}
          {etapa === 'itens' && (
            <div className="p-6 space-y-4">
              {carrinho.length === 0 ? (
                <p className="text-sm text-gray-300 text-center py-12">Carrinho vazio</p>
              ) : (
                <>
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <div className="overflow-auto" style={{ maxHeight: '52vh' }}>
                      <table className={`w-full ${dens.tabela}`}>
                        <thead>
                          <tr>
                            <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left   text-xs font-medium text-gray-400 px-2 py-2 w-7">#</th>
                            <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left   text-xs font-medium text-gray-400 px-1 py-2">Descrição</th>
                            <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-center text-xs font-medium text-gray-400 px-1 py-2 w-24">Qtde</th>
                            <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-right  text-xs font-medium text-gray-400 px-1 py-2 w-20">Unit.</th>
                            <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-right  text-xs font-medium text-gray-400 px-1 py-2 w-20">Desconto</th>
                            <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-right  text-xs font-medium text-gray-400 px-2 py-2 w-24">Total</th>
                            <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] w-8" />
                          </tr>
                        </thead>
                        <tbody>
                          {carrinho.map((item, idx) => (
                            <tr key={item.produtoId} className="border-b border-gray-50 hover:bg-gray-50/60">
                              <td className="px-2 py-2 text-xs text-gray-300 align-top">{idx + 1}</td>
                              <td className="px-1 py-2">
                                <p className="font-medium text-gray-900 leading-tight">{item.nomeProduto}</p>
                                <p className="text-[11px] text-gray-400">
                                  {item.unidade}{item.codigoBarras ? ` · cód. ${item.codigoBarras}` : ''}
                                </p>
                              </td>
                              <td className="px-1 py-2">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={() => alterarQtd(item.produtoId, -1)}
                                    className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center flex-shrink-0"><Minus size={10} /></button>
                                  <input type="number" min="1" value={item.quantidade}
                                    onChange={e => definirQtd(item.produtoId, e.target.value)}
                                    className="sem-spinner w-10 h-6 text-center text-sm border border-gray-200 rounded focus:outline-none focus:border-gray-500" />
                                  <button onClick={() => alterarQtd(item.produtoId, 1)}
                                    className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center flex-shrink-0"><Plus size={10} /></button>
                                </div>
                              </td>
                              <td className="px-1 py-2 text-right text-gray-600 whitespace-nowrap">{fmt(item.precoUnitario)}</td>
                              <td className="px-1 py-2">
                                <input type="number" min="0" step="0.01" inputMode="decimal"
                                  value={item.desconto ? (item.desconto / 100).toFixed(2) : ''}
                                  onChange={e => definirDescontoItem(item.produtoId, e.target.value)}
                                  placeholder="0,00"
                                  className="sem-spinner w-16 h-6 text-right text-sm border border-gray-200 rounded px-1 focus:outline-none focus:border-gray-500" />
                              </td>
                              <td className="px-2 py-2 text-right font-semibold whitespace-nowrap" style={{ color: VERDE }}>{fmt(item.subtotal)}</td>
                              <td className="px-1 py-2 text-center align-top">
                                <button onClick={() => removerItem(item.produtoId)} className="text-gray-300 hover:text-red-600"><Trash2 size={12} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-100 px-4 py-3">
                    {resumoValores}
                  </div>

                  <button onClick={() => setConfirmLimpar(true)}
                    className="text-xs text-gray-400 hover:text-red-600 transition-colors">
                    Limpar carrinho <span className="text-gray-300">(Ctrl + Delete)</span>
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── PAINEL, PARTE 2: PAGAMENTO ───────────────────────────────── */}
          {etapa === 'pagamento' && (
            <div className="p-6 space-y-4">

              {/* Cliente — necessário para o cashback e para a tabela de preço */}
              <div>
                <Label className="text-xs inline-flex items-center gap-1">
                  Cliente <span className="text-gray-300">(F3)</span>
                  <InfoTip titulo="Tabela de preço">
                    O preço aplicado vem da tabela cadastrada no cliente. Ao selecionar,
                    os itens já no carrinho são recalculados.
                  </InfoTip>
                </Label>
                {clienteId && clienteNomeDisplay ? (
                  <div className="mt-1 flex items-center justify-between px-2 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {clienteNomeDisplay}
                      {ehAtacado && <span className="ml-1.5 text-[10px] font-semibold text-gray-500">· {rotuloTabela}</span>}
                    </span>
                    <button onClick={limparCliente} className="text-gray-400 hover:text-gray-700 ml-1 flex-shrink-0"><X size={12} /></button>
                  </div>
                ) : (
                  <div className="relative mt-1">
                    <Input ref={clienteRef} value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)}
                      placeholder="Nome ou CPF..." className="h-9 text-sm" />
                    {buscaCliente.length > 1 && clientes.length > 0 && (
                      <div className="absolute z-20 w-full mt-0.5 bg-white border border-gray-100 rounded-lg shadow-lg overflow-hidden">
                        {/* A busca do servidor procura em nome fantasia, razão
                            social E documento. Mostrar só a razão social fazia
                            o resultado parecer errado: quem digitava "za"
                            achava a "Zaghi Massas" e via na lista a razão
                            social, que não tem essas letras. Agora aparecem os
                            dois nomes, e dá para ver por que aquele registro
                            entrou no resultado. */}
                        {clientes.map((c: any) => {
                          const principal  = c.nomeFantasia?.trim() || c.nomeCompleto
                          const secundario = c.nomeFantasia?.trim() && c.nomeFantasia.trim() !== c.nomeCompleto
                            ? c.nomeCompleto
                            : (c.cpfCnpj ?? '')
                          return (
                            <button key={c.clienteId} onClick={() => selecionarCliente(c)}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left">
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-gray-900 truncate">{principal}</span>
                                {secundario && (
                                  <span className="block text-[10px] text-gray-400 truncate">{secundario}</span>
                                )}
                              </span>
                              {c.tabelaPreco && c.tabelaPreco !== 'varejo' && (
                                <span className="text-[10px] font-semibold text-gray-500 flex-shrink-0">
                                  {(TIPOS_PRECO as any)[c.tabelaPreco]}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {/* Cliente avulso: quem compra uma vez e não vale cadastrar.
                        Vai para a venda e sai no cupom. Sem cliente_id não há
                        cashback nem histórico. */}
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <Input value={nomeAvulso} onChange={e => setNomeAvulso(e.target.value)}
                        placeholder="Ou digite o nome (não cadastrado)"
                        className="h-8 text-xs flex-1" />
                      <InfoTip titulo="Cliente avulso">
                        Guarda só o nome na venda e no cupom. Não cria cliente: sem histórico,
                        sem tabela de preço e sem cashback, porque o programa de fidelidade
                        precisa de um cadastro. Para quem volta, use Cadastrar novo cliente.
                      </InfoTip>
                    </div>

                    <button
                      onClick={() => setShowCadastrarCliente(v => !v)}
                      className="mt-1.5 w-full text-xs text-gray-600 hover:text-gray-900 text-left flex items-center gap-1">
                      {showCadastrarCliente ? <ChevronUp size={11} /> : <Plus size={11} />} Cadastrar novo cliente
                    </button>
                  </div>
                )}
              </div>

              {/* Cadastro rápido de cliente — sem modal: abre aqui dentro */}
              {showCadastrarCliente && !clienteId && (
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-3">
                  <div>
                    <Label className="text-xs">Tipo de pessoa</Label>
                    <select value={novoCli.tipoPessoa} onChange={e => setCli('tipoPessoa', e.target.value)}
                      className="mt-1 w-full h-9 text-sm rounded-md border border-gray-200 px-2 bg-white">
                      <option value="PF">Pessoa Física</option>
                      <option value="PJ">Pessoa Jurídica</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Nome completo *</Label>
                      <Input value={novoCli.nomeCompleto} onChange={e => setCli('nomeCompleto', e.target.value)} className="mt-1 h-9 text-sm" placeholder="Nome do cliente" />
                    </div>
                    <div>
                      <Label className="text-xs">{novoCli.tipoPessoa === 'PJ' ? 'Nome fantasia' : 'Apelido'}</Label>
                      <Input value={novoCli.nomeFantasia} onChange={e => setCli('nomeFantasia', e.target.value)} className="mt-1 h-9 text-sm" placeholder="Opcional" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">{novoCli.tipoPessoa === 'PJ' ? 'CNPJ' : 'CPF'}</Label>
                      <Input value={novoCli.documento} onChange={e => setCli('documento', e.target.value)} className="mt-1 h-9 text-sm" placeholder="Somente números" />
                    </div>
                    <div>
                      {/* Obrigatório: a rota de clientes exige telefone ou celular no cadastro novo */}
                      <Label className="text-xs">Celular *</Label>
                      <Input value={novoCli.celular} onChange={e => setCli('celular', e.target.value)} className="mt-1 h-9 text-sm" placeholder="(00) 00000-0000" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      {/* O gerencial guarda fixo e celular em colunas separadas.
                          Com um campo só aqui, o fixo caía em `celular` e depois
                          ninguém achava o número no cadastro completo. */}
                      <Label className="text-xs">Telefone fixo</Label>
                      <Input value={novoCli.telefone} onChange={e => setCli('telefone', e.target.value)} className="mt-1 h-9 text-sm" placeholder="(00) 0000-0000" />
                    </div>
                    <div>
                      <Label className="text-xs">E-mail</Label>
                      <Input type="email" value={novoCli.email} onChange={e => setCli('email', e.target.value)} className="mt-1 h-9 text-sm" placeholder="email@exemplo.com" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">CEP</Label>
                      <Input value={novoCli.cep} onChange={e => setCli('cep', e.target.value)} className="mt-1 h-9 text-sm" placeholder="00000-000" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Endereço</Label>
                      <Input value={novoCli.endereco} onChange={e => setCli('endereco', e.target.value)} className="mt-1 h-9 text-sm" placeholder="Rua, avenida..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs">Número</Label>
                      <Input value={novoCli.numero} onChange={e => setCli('numero', e.target.value)} className="mt-1 h-9 text-sm" placeholder="Nº" />
                    </div>
                    <div>
                      <Label className="text-xs">Compl.</Label>
                      <Input value={novoCli.complemento} onChange={e => setCli('complemento', e.target.value)} className="mt-1 h-9 text-sm" placeholder="Apto" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Bairro</Label>
                      <Input value={novoCli.bairro} onChange={e => setCli('bairro', e.target.value)} className="mt-1 h-9 text-sm" placeholder="Bairro" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <Label className="text-xs">Cidade</Label>
                      <Input value={novoCli.cidade} onChange={e => setCli('cidade', e.target.value)} className="mt-1 h-9 text-sm" placeholder="Cidade" />
                    </div>
                    <div>
                      <Label className="text-xs">UF</Label>
                      <Input maxLength={2} value={novoCli.uf} onChange={e => setCli('uf', e.target.value.toUpperCase())} className="mt-1 h-9 text-sm" placeholder="UF" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Observação</Label>
                    <textarea value={novoCli.observacao} onChange={e => setCli('observacao', e.target.value)}
                      className="mt-1 w-full text-sm rounded-md border border-gray-200 px-2 py-1.5 resize-none" rows={2} placeholder="Opcional" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => { setShowCadastrarCliente(false); setNovoCli(CLI_VAZIO) }}>
                      Cancelar
                    </Button>
                    <Button className="flex-1"
                      onClick={() => criarClienteMut.mutate()}
                      disabled={!novoCli.nomeCompleto.trim() || !novoCli.celular.trim() || criarClienteMut.isPending}>
                      {criarClienteMut.isPending ? 'Salvando...' : 'Salvar e usar'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Entrega — em destaque no modo delivery */}
              {isDelivery && (
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Endereço de entrega *</Label>
                    <Input value={enderecoEntrega} onChange={e => setEnderecoEntrega(e.target.value)}
                      className="mt-1 h-9 text-sm" placeholder="Rua, número, bairro, cidade" />
                    <MarcaEndereco cadastro={enderecoCadastro} atual={enderecoEntrega} onRestaurar={setEnderecoEntrega} />
                  </div>
                  <div>
                    <Label className="text-xs">Data de entrega</Label>
                    <Input type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                </div>
              )}

              {/* Desconto */}
              <div>
                <Label className="text-xs">Desconto geral (R$) <span className="text-gray-300">(F6)</span></Label>
                <Input ref={descontoRef} type="number" min="0" step="0.01" inputMode="decimal" value={desconto} onChange={e => setDesconto(e.target.value)} className="sem-spinner mt-1 h-9 text-sm" placeholder="0,00" />
              </div>
              <div className="flex gap-1.5">
                {[0, 5, 10, 15].map(pct => (
                  <button key={pct} onClick={() => setDesconto(pct === 0 ? '0' : ((subtotal * pct / 100) / 100).toFixed(2))}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      descontoVal === Math.round(subtotal * pct / 100) && pct > 0
                        ? 'bg-green-50 border-green-300 text-green-700'
                        : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
                    }`}>
                    {pct === 0 ? 'Sem' : `${pct}%`}
                  </button>
                ))}
              </div>

              {/* Acréscimo (R$) — taxa de entrega embutida no total, sem linha de frete */}
              <div>
                <Label className="text-xs">Acréscimo{isDelivery ? ' — taxa de entrega' : ''} (R$)</Label>
                <Input type="number" min="0" step="0.01" inputMode="decimal" value={acrescimo} onChange={e => setAcrescimo(e.target.value)} className="sem-spinner mt-1 h-9 text-sm" placeholder="0,00" />
              </div>

              {/* Cashback / Fidelidade */}
              {clienteId && cashback?.programaAtivo && saldoCashback > 0 && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                      <Gift size={13} /> Cashback disponível
                    </span>
                    <span className="text-sm font-bold text-gray-900">{fmt(saldoCashback)}</span>
                  </div>
                  {cashbackElegivel ? (
                    <label className="mt-2 flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={usarCashback} onChange={e => setUsarCashback(e.target.checked)} className="w-4 h-4 rounded" />
                      <span className="text-xs text-gray-700">
                        Usar {fmt(Math.min(saldoCashback, limiteCashback, total))} nesta venda
                      </span>
                    </label>
                  ) : (
                    <p className="text-[11px] text-gray-400 mt-1">
                      Saldo mínimo para usar: {fmt(cashback?.saldoMinimoUsoCentavos ?? 0)}
                    </p>
                  )}
                </div>
              )}

              {/* Forma de pagamento */}
              <div>
                <Label className="text-xs">Forma de pagamento <span className="text-gray-300">(F8)</span></Label>
                <select ref={pgtoRef} value={formaPgto} onChange={e => setFormaPgto(e.target.value)}
                  className="mt-1.5 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                  <option value="">Selecionar...</option>
                  {(formasNomes.length > 0 ? formasNomes : ['Dinheiro', 'PIX', 'Crédito', 'Débito']).map((f: string) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                  <option value="A Prazo">A Prazo (parcelado)</option>
                </select>
              </div>

              {isAPrazo && (
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Parcelas</Label>
                    <select value={parcelas} onChange={e => setParcelas(e.target.value)}
                      className="mt-1.5 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                      {Array.from({ length: 11 }, (_, i) => i + 2).map(n => (
                        <option key={n} value={n}>{n}x de {fmt(Math.round(totalAPagar / n))}</option>
                      ))}
                    </select>
                  </div>
                  {!clienteObrigatorioOk && (
                    <p className="text-[11px] font-medium text-red-600">
                      Venda a prazo precisa de cliente — selecione um cadastrado ou informe o nome avulso.
                    </p>
                  )}
                </div>
              )}

              {(formaPgto === 'Dinheiro' || formaPgto === 'dinheiro') && (
                <div>
                  <Label className="text-xs">Valor recebido (R$)</Label>
                  <Input type="number" min="0" step="0.01" inputMode="decimal" value={valorRecebido} onChange={e => setValorRecebido(e.target.value)} className="sem-spinner mt-1 h-9 text-sm" placeholder="0,00" />
                  {troco > 0 && (
                    <div className="flex justify-between items-baseline mt-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                      <span className="text-sm font-semibold text-gray-700">Troco</span>
                      <span className="text-xl font-semibold text-gray-900">{fmt(troco)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Campos extras — recolhíveis */}
              <button onClick={() => setShowExtras(v => !v)}
                className="w-full flex items-center justify-between py-2 text-xs text-gray-400 hover:text-gray-600 border-t border-gray-100 pt-3">
                <span>Dados adicionais (vendedor{isDelivery ? '' : ', entrega'}...)</span>
                {showExtras ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {showExtras && (
                <div className="space-y-2 pt-1">
                  <div>
                    <Label className="text-xs">Vendedor</Label>
                    <select value={vendedor} onChange={e => setVendedor(e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                      <option value="">Selecionar...</option>
                      {usuarios.map((u: any) => <option key={u.usuarioId} value={u.nome}>{u.nome}</option>)}
                    </select>
                  </div>
                  {/* No modo delivery, tipo/data/endereço de entrega já aparecem em destaque acima. */}
                  {!isDelivery && (
                    <>
                      <div>
                        <Label className="text-xs">Tipo de entrega</Label>
                        <select value={tipoEntrega} onChange={e => setTipoEntrega(e.target.value)}
                          className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                          {['Retirada', 'Entrega', 'Transportadora'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs">Data de entrega</Label>
                        <Input type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} className="mt-1 h-9 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Endereço de entrega</Label>
                        <Input value={enderecoEntrega} onChange={e => setEnderecoEntrega(e.target.value)} className="mt-1 h-9 text-sm" />
                        <MarcaEndereco cadastro={enderecoCadastro} atual={enderecoEntrega} onRestaurar={setEnderecoEntrega} />
                      </div>
                    </>
                  )}
                  <div>
                    <Label className="text-xs">Observação</Label>
                    <Input value={observacao} onChange={e => setObservacao(e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                </div>
              )}

              {/* Emitir nota — só aparece com o módulo fiscal contratado.
                  Registra a intenção; a emissão acontece no módulo Fiscal. */}
              {fiscalAtivo && (
                <div className="rounded-xl border border-gray-100 px-4 py-3 space-y-2.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={comNota}
                      onChange={e => {
                        setComNota(e.target.checked)
                        // Desmarcar a nota derruba a impressão junto: não há
                        // documento para imprimir.
                        if (!e.target.checked) setImprimirNota(false)
                      }}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-gray-700">Emitir nota fiscal</span>
                  </label>

                  {/* EMITIR E IMPRIMIR SÃO DECISÕES DIFERENTES.
                      Emitir é obrigação com o fisco; imprimir é papel entregue
                      ao cliente. Boa parte quer a nota emitida e não quer a via
                      impressa — e bobina custa. */}
                  <label className={`flex items-center gap-2 pl-6 ${comNota ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
                    <input
                      type="checkbox"
                      checked={imprimirNota}
                      disabled={!comNota}
                      onChange={e => setImprimirNota(e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-gray-700 inline-flex items-center gap-1.5">
                      Imprimir a nota
                      <InfoTip titulo="Imprimir a nota">
                        Sem marcar, a nota é emitida e fica guardada no módulo Fiscal — só não sai na impressora.
                      </InfoTip>
                    </span>
                  </label>
                </div>
              )}

              {/* Impedimento real: sem endereço a venda de delivery não fecha. */}
              {isDelivery && !enderecoOk && (
                <p className="text-[11px] font-medium text-red-600">Informe o endereço de entrega para finalizar.</p>
              )}

              <div className="rounded-xl border border-gray-100 px-4 py-3">
                {resumoValores}
              </div>
            </div>
          )}
        </SidePanel>
      )}

      {/* VENDAS DO DIA — REIMPRESSÃO.
          Painel próprio, e não um item do menu gerencial: o cliente que volta
          pedindo a segunda via está no balcão, e quem atende é o operador. */}
      {showVendasDia && (
        <SidePanel
          titulo="Vendas de hoje"
          subtitulo="Setas para escolher · Enter imprime · Esc fecha"
          onClose={() => setShowVendasDia(false)}
          largura="w-[34vw] min-w-[480px]"
        >
          <div className="p-4">
            {carregandoVendas ? (
              <p className="text-center text-sm text-gray-400 py-10">Carregando...</p>
            ) : vendasDia.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-10">Nenhuma venda registrada hoje.</p>
            ) : (
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                {vendasDia.map((v: any, i: number) => (
                  <div
                    key={v.vendaId}
                    onMouseEnter={() => setLinhaSel(i)}
                    className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 last:border-0 ${
                      i === linhaSel ? 'bg-green-50/70' : ''
                    }`}>
                    <span className="text-xs text-gray-400 w-14 flex-shrink-0">
                      #{String(v.vendaId).padStart(4, '0')}
                    </span>
                    <span className="text-xs text-gray-500 w-12 flex-shrink-0">
                      {new Date(v.vendidaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-sm text-gray-900 flex-1 min-w-0 truncate" title={v.clienteNome}>
                      {v.clienteNome}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 w-24 text-right flex-shrink-0">
                      {fmt(Number(v.total ?? 0))}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => reimprimir(v.vendaId)}>
                      <Printer size={13} className="mr-1" /> 2ª via
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11px] text-gray-400">
              A reimpressão sai marcada como 2ª via. Troco e acréscimo não constam: não ficam gravados na venda.
            </p>
          </div>
        </SidePanel>
      )}

      {confirmLimpar && (
        <ConfirmModal title="Limpar carrinho" message="Remover todos os itens do carrinho?"
          confirmLabel="Limpar" danger
          onConfirm={() => { setCarrinho([]); setConfirmLimpar(false) }}
          onCancel={() => setConfirmLimpar(false)} />
      )}

      {/* Confirmação da venda (Sim/Não) */}
      {confirmVenda && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 text-center">
            <p className="text-base font-semibold text-gray-900 mb-1">Deseja confirmar a venda?</p>
            <p className="text-sm text-gray-500">Total: <span className="font-bold text-gray-900">{fmt(totalAPagar)}</span></p>
            {ehAtacado && (
              <p className="text-xs text-gray-500 mt-1">
                Preço de {rotuloTabela}{clienteNomeDisplay ? ` — ${clienteNomeDisplay}` : ''}
              </p>
            )}
            <div className="flex justify-center gap-3 mt-5">
              <Button variant="outline" className="w-24" onClick={() => setConfirmVenda(false)}>Não</Button>
              <Button className="w-24" onClick={() => { setConfirmVenda(false); isAPrazo ? venderAPrazoMut.mutate() : venderMut.mutate() }}>Sim</Button>
            </div>
          </div>
        </div>
      )}

      {/* Impressão do cupom (Sim/Não) — aparece depois que a venda foi registrada */}
      {cupomVenda && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 text-center">
            <CheckCircle size={28} className="mx-auto text-green-500 mb-2" />
            <p className="text-base font-semibold text-gray-900 mb-1">Venda registrada!</p>
            <p className="text-sm text-gray-500 mb-5">Deseja imprimir cupom?</p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" className="w-24" onClick={() => setCupomVenda(null)}>Não</Button>
              <Button className="w-24" onClick={() => { imprimirCupom(cupomVenda); setCupomVenda(null) }}>Sim</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
