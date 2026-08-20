'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Image as ImageIcon, 
  Upload, 
  Trash2, 
  Save, 
  Clock, 
  Truck, 
  Palette, 
  MessageSquare, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Loader2
} from 'lucide-react';

interface CardapioConfig {
  layout_tipo?: string;
  banner_url?: string | null;
  cor_primaria?: string;
  mensagem_topo?: string;
  mensagem_rodape?: string;
  pedido_minimo?: number;
  taxa_entrega_padrao?: number;
  tempo_entrega_estimado?: string;
  horarios?: {
    dia: number; // 0 a 6 (Domingo a Sábado)
    dia_nome: string;
    aberto: boolean;
    abertura: string;
    fechamento: string;
  }[];
}

interface CardapioDigitalViewProps {
  tenant: string;
}

// ---------------------------------------------------------------------------
// Função Utilitária: Compressão e Redimensionamento de Imagem no Navegador
// ---------------------------------------------------------------------------
function comprimirImagem(file: File, maxDimensao = 1200, qualidade = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimensao) {
            height = Math.round((height * maxDimensao) / width);
            width = maxDimensao;
          }
        } else {
          if (height > maxDimensao) {
            width = Math.round((width * maxDimensao) / height);
            height = maxDimensao;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Falha ao processar canvas de imagem.'));
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Gera Base64 em formato JPEG comprimido
        resolve(canvas.toDataURL('image/jpeg', qualidade));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

export default function CardapioDigitalView({ tenant }: CardapioDigitalViewProps) {
  const [config, setConfig] = useState<CardapioConfig>({
    layout_tipo: 'cards',
    banner_url: null,
    cor_primaria: '#10b981',
    mensagem_topo: '',
    mensagem_rodape: '',
    pedido_minimo: 0,
    taxa_entrega_padrao: 0,
    tempo_entrega_estimado: '40-60 min',
    horarios: [
      { dia: 0, dia_nome: 'Domingo', aberto: false, abertura: '18:00', fechamento: '23:00' },
      { dia: 1, dia_nome: 'Segunda-feira', aberto: false, abertura: '18:00', fechamento: '23:00' },
      { dia: 2, dia_nome: 'Terça-feira', aberto: true, abertura: '18:00', fechamento: '23:00' },
      { dia: 3, dia_nome: 'Quarta-feira', aberto: true, abertura: '18:00', fechamento: '23:00' },
      { dia: 4, dia_nome: 'Quinta-feira', aberto: true, abertura: '18:00', fechamento: '23:00' },
      { dia: 5, dia_nome: 'Sexta-feira', aberto: true, abertura: '18:00', fechamento: '23:30' },
      { dia: 6, dia_nome: 'Sábado', aberto: true, abertura: '18:00', fechamento: '23:30' },
    ]
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<'visual' | 'horarios' | 'entrega' | 'mensagens'>('visual');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    carregarConfiguracoes();
  }, [tenant]);

  const mostrarFeedback = (tipo: 'sucesso' | 'erro', texto: string) => {
    setFeedback({ tipo, texto });
    setTimeout(() => setFeedback(null), 5000);
  };

  const carregarConfiguracoes = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/${tenant}/cardapio/config`);
      if (res.ok) {
        const data = await res.json();
        if (data && Object.keys(data).length > 0) {
          setConfig((prev) => ({
            ...prev,
            ...data,
            horarios: data.horarios && data.horarios.length > 0 ? data.horarios : prev.horarios,
          }));
        }
      }
    } catch (err) {
      console.error('Erro ao carregar configurações do cardápio:', err);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Upload Seguro com Compressão de Imagem
  // ---------------------------------------------------------------------------
  const handleUploadImagemFundo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validação básica de tipo
    if (!file.type.startsWith('image/')) {
      mostrarFeedback('erro', 'Por favor, selecione um arquivo de imagem válido (JPG, PNG, WebP).');
      return;
    }

    try {
      setUploadingImage(true);
      setFeedback(null);

      // 1. Redimensiona e comprime no cliente (máx 1200px, 75% de qualidade JPEG)
      const base64Comprimido = await comprimirImagem(file, 1200, 0.75);

      // 2. Envia para a API de banner / fundo
      const res = await fetch(`/api/${tenant}/cardapio/banner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banner_url: base64Comprimido }),
      });

      if (!res.ok) {
        let mensagemErro = 'Falha ao processar upload da imagem.';
        try {
          const dadosErro = await res.json();
          mensagemErro = dadosErro.error || dadosErro.message || mensagemErro;
        } catch {
          const texto = await res.text();
          if (texto) mensagemErro = texto;
        }
        throw new Error(mensagemErro);
      }

      const resData = await res.json().catch(() => ({}));
      const urlFinal = resData.banner_url || base64Comprimido;

      setConfig((prev) => ({ ...prev, banner_url: urlFinal }));
      mostrarFeedback('sucesso', 'Imagem de fundo enviada e aplicada com sucesso!');
    } catch (err: any) {
      console.error('Erro no upload de imagem de fundo:', err);
      mostrarFeedback('erro', err.message || 'Erro ao enviar imagem de fundo.');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoverImagemFundo = async () => {
    try {
      setUploadingImage(true);
      const res = await fetch(`/api/${tenant}/cardapio/banner`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const texto = await res.text();
        throw new Error(texto || 'Erro ao remover imagem.');
      }

      setConfig((prev) => ({ ...prev, banner_url: null }));
      mostrarFeedback('sucesso', 'Imagem de fundo removida.');
    } catch (err: any) {
      mostrarFeedback('erro', err.message || 'Erro ao remover imagem.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSalvarConfiguracoes = async () => {
    try {
      setSaving(true);
      setFeedback(null);

      const res = await fetch(`/api/${tenant}/cardapio/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        let mensagemErro = 'Erro ao salvar configurações.';
        try {
          const errData = await res.json();
          mensagemErro = errData.error || errData.message || mensagemErro;
        } catch {
          const txt = await res.text();
          if (txt) mensagemErro = txt;
        }
        throw new Error(mensagemErro);
      }

      mostrarFeedback('sucesso', 'Configurações do cardápio salvas com sucesso!');
    } catch (err: any) {
      mostrarFeedback('erro', err.message || 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Cardápio Digital</h1>
          <p className="text-sm text-zinc-400">
            Personalize a aparência, horários e regras do seu cardápio público online.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/cardapio/${tenant}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
          >
            <ExternalLink className="h-4 w-4" />
            Ver Cardápio Público
          </a>
          <button
            onClick={handleSalvarConfiguracoes}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Alterações
          </button>
        </div>
      </div>

      {/* Alertas de Feedback */}
      {feedback && (
        <div
          className={`flex items-center gap-3 rounded-lg border p-4 text-sm ${
            feedback.tipo === 'sucesso'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {feedback.tipo === 'sucesso' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <span>{feedback.texto}</span>
        </div>
      )}

      {/* Navegação de Abas */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setAbaAtiva('visual')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            abaAtiva === 'visual'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Palette className="h-4 w-4" />
          Aparência e Imagem de Fundo
        </button>
        <button
          onClick={() => setAbaAtiva('horarios')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            abaAtiva === 'horarios'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Clock className="h-4 w-4" />
          Horários de Funcionamento
        </button>
        <button
          onClick={() => setAbaAtiva('entrega')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            abaAtiva === 'entrega'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Truck className="h-4 w-4" />
          Entrega e Valores
        </button>
        <button
          onClick={() => setAbaAtiva('mensagens')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            abaAtiva === 'mensagens'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Mensagens e Avisos
        </button>
      </div>

      {/* Conteúdo da Aba: Aparência e Imagem de Fundo */}
      {abaAtiva === 'visual' && (
        <div className="space-y-6">
          {/* Seção: Imagem de Fundo / Banner */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="text-lg font-semibold text-zinc-200">Imagem de Fundo / Banner do Cardápio</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Esta imagem será exibida como cabeçalho ou fundo nos layouts visuais do seu cardápio.
            </p>

            <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-start">
              {/* Pré-visualização */}
              <div className="relative h-48 w-full max-w-md overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 flex items-center justify-center">
                {config.banner_url ? (
                  <img
                    src={config.banner_url}
                    alt="Fundo do Cardápio"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-zinc-500">
                    <ImageIcon className="h-10 w-10 stroke-1" />
                    <span className="text-xs">Nenhuma imagem de fundo configurada</span>
                  </div>
                )}

                {uploadingImage && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <Loader2 className="h-7 w-7 animate-spin text-emerald-400" />
                  </div>
                )}
              </div>

              {/* Botões de Ação */}
              <div className="flex flex-col gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleUploadImagemFundo}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-700 border border-zinc-700 transition-colors disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  {config.banner_url ? 'Trocar Imagem de Fundo' : 'Enviar Imagem de Fundo'}
                </button>

                {config.banner_url && (
                  <button
                    type="button"
                    onClick={handleRemoverImagemFundo}
                    disabled={uploadingImage}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-950/40 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-900/50 border border-red-900/50 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover Imagem
                  </button>
                )}

                <span className="text-xs text-zinc-500">
                  Formatos recomendados: JPG, PNG ou WebP. A imagem é otimizada automaticamente antes do envio.
                </span>
              </div>
            </div>
          </div>

          {/* Seção: Estilo do Layout */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="text-lg font-semibold text-zinc-200">Tipo de Layout</h2>
            <p className="mt-1 text-sm text-zinc-400">Escolha a disposição visual dos produtos no cardápio público.</p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { id: 'cards', nome: 'Cards com Foto', desc: 'Ideal para produtos com fotos grandes e destaque visual.' },
                { id: 'lista', nome: 'Lista Compacta', desc: 'Visualização rápida em formato de lista simples.' },
                { id: 'fundo-imagem', nome: 'Fundo com Imagem', desc: 'A imagem de fundo fica em destaque em toda a tela.' },
              ].map((layout) => (
                <label
                  key={layout.id}
                  className={`flex cursor-pointer flex-col justify-between rounded-lg border p-4 transition-all ${
                    config.layout_tipo === layout.id
                      ? 'border-emerald-500 bg-emerald-500/10 text-zinc-100'
                      : 'border-zinc-800 bg-zinc-950/50 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-200">{layout.nome}</span>
                    <input
                      type="radio"
                      name="layout_tipo"
                      value={layout.id}
                      checked={config.layout_tipo === layout.id}
                      onChange={(e) => setConfig((prev) => ({ ...prev, layout_tipo: e.target.value }))}
                      className="text-emerald-500 focus:ring-emerald-500"
                    />
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">{layout.desc}</p>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo da Aba: Horários */}
      {abaAtiva === 'horarios' && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h2 className="text-lg font-semibold text-zinc-200">Horários de Atendimento</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Defina quando o cardápio estará aberto para receber pedidos dos clientes.
          </p>

          <div className="mt-6 divide-y divide-zinc-800">
            {config.horarios?.map((h, index) => (
              <div key={h.dia} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 w-40">
                  <input
                    type="checkbox"
                    id={`dia-${h.dia}`}
                    checked={h.aberto}
                    onChange={(e) => {
                      const novos = [...(config.horarios || [])];
                      novos[index].aberto = e.target.checked;
                      setConfig((prev) => ({ ...prev, horarios: novos }));
                    }}
                    className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor={`dia-${h.dia}`} className="text-sm font-medium text-zinc-200">
                    {h.dia_nome}
                  </label>
                </div>

                {h.aberto ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={h.abertura}
                      onChange={(e) => {
                        const novos = [...(config.horarios || [])];
                        novos[index].abertura = e.target.value;
                        setConfig((prev) => ({ ...prev, horarios: novos }));
                      }}
                      className="rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none"
                    />
                    <span className="text-xs text-zinc-500">até</span>
                    <input
                      type="time"
                      value={h.fechamento}
                      onChange={(e) => {
                        const novos = [...(config.horarios || [])];
                        novos[index].fechamento = e.target.value;
                        setConfig((prev) => ({ ...prev, horarios: novos }));
                      }}
                      className="rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                ) : (
                  <span className="text-xs font-medium text-zinc-500">Fechado</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conteúdo da Aba: Entrega e Valores */}
      {abaAtiva === 'entrega' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-zinc-200">Taxa e Tempo de Entrega</h2>
            <div>
              <label className="text-xs font-medium text-zinc-400">Taxa Padrão de Entrega (R$)</label>
              <input
                type="number"
                step="0.50"
                min="0"
                value={config.taxa_entrega_padrao ?? 0}
                onChange={(e) => setConfig((prev) => ({ ...prev, taxa_entrega_padrao: parseFloat(e.target.value) || 0 }))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400">Tempo Estimado de Entrega</label>
              <input
                type="text"
                placeholder="Ex: 40-60 min"
                value={config.tempo_entrega_estimado || ''}
                onChange={(e) => setConfig((prev) => ({ ...prev, tempo_entrega_estimado: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-zinc-200">Regras de Pedido</h2>
            <div>
              <label className="text-xs font-medium text-zinc-400">Valor Mínimo do Pedido (R$)</label>
              <input
                type="number"
                step="1.00"
                min="0"
                value={config.pedido_minimo ?? 0}
                onChange={(e) => setConfig((prev) => ({ ...prev, pedido_minimo: parseFloat(e.target.value) || 0 }))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo da Aba: Mensagens e Avisos */}
      {abaAtiva === 'mensagens' && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-200">Mensagens e Avisos aos Clientes</h2>
          <div>
            <label className="text-xs font-medium text-zinc-400">Mensagem no Topo do Cardápio (Destaque)</label>
            <textarea
              rows={3}
              placeholder="Ex: Entregas hoje até às 22h. Faça seu pedido com antecedência!"
              value={config.mensagem_topo || ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, mensagem_topo: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400">Mensagem no Rodapé</label>
            <textarea
              rows={2}
              placeholder="Ex: Agradecemos a preferência! Dúvidas pelo WhatsApp."
              value={config.mensagem_rodape || ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, mensagem_rodape: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}