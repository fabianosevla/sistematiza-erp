# scripts/dump-auditoria.ps1
#
# Junta num arquivo só o conteúdo dos arquivos que preciso ver para o
# conserto de created_by / updated_by.
#
# Uso, a partir da raiz do projeto:
#
#   powershell -ExecutionPolicy Bypass -File scripts\dump-auditoria.ps1
#
# Gera _dump-auditoria.txt na raiz e já copia tudo para a área de
# transferência. Se o texto passar do limite do chat, o script avisa e diz
# como mandar em partes.
#
# -LiteralPath em tudo: os caminhos têm [tenant] entre colchetes, que o
# PowerShell interpretaria como curinga.

$ErrorActionPreference = 'Stop'

# Raiz do projeto = pasta acima desta (scripts\)
$raiz = Split-Path -Parent $PSScriptRoot
if (-not $raiz) { $raiz = (Get-Location).Path }
Set-Location -LiteralPath $raiz

$arquivos = @(
  # ── Bloco 1 — services de cadastro + uma rota de exemplo
  'lib\services\cadastros\ClienteService.ts',
  'lib\services\cadastros\ProdutoService.ts',
  'lib\services\cadastros\InsumoService.ts',
  'app\api\[tenant]\cadastros\produtos\route.ts',

  # ── Bloco 2 — o resto dos cadastros
  'lib\services\cadastros\FornecedorService.ts',
  'lib\services\cadastros\FormaPagamentoService.ts',
  'lib\services\cadastros\FichaTecnicaService.ts',
  'lib\services\cadastros\UsuarioService.ts',
  'lib\services\dominios\DominiosService.ts',
  'lib\services\perfis\PerfisService.ts',

  # ── Rotas que chamam esses services
  'app\api\[tenant]\cadastros\clientes\route.ts',
  'app\api\[tenant]\cadastros\clientes\[id]\route.ts',
  'app\api\[tenant]\cadastros\produtos\[id]\route.ts',
  'app\api\[tenant]\cadastros\insumos\[id]\route.ts',
  'app\api\[tenant]\cadastros\fornecedores\route.ts',
  'app\api\[tenant]\cadastros\fornecedores\[id]\route.ts',
  'app\api\[tenant]\cadastros\formas-pagamento\route.ts',
  'app\api\[tenant]\cadastros\formas-pagamento\[id]\route.ts',
  'app\api\[tenant]\dominios\route.ts',
  'app\api\[tenant]\perfis\route.ts',

  # ── Pendência separada: spinners dos campos do PDV
  'app\globals.css'
)

$saida    = Join-Path $raiz '_dump-auditoria.txt'
$blocos   = New-Object System.Collections.Generic.List[string]
$faltando = New-Object System.Collections.Generic.List[string]

foreach ($rel in $arquivos) {
  $abs = Join-Path $raiz $rel

  if (-not (Test-Path -LiteralPath $abs)) {
    $faltando.Add($rel) | Out-Null
    continue
  }

  $conteudo = Get-Content -LiteralPath $abs -Raw -Encoding UTF8
  $linhas   = ($conteudo -split "`n").Count

  $blocos.Add("===== ARQUIVO: $rel  ($linhas linhas) =====") | Out-Null
  $blocos.Add($conteudo)                                     | Out-Null
  $blocos.Add('')                                            | Out-Null
}

$texto = $blocos -join "`n"
Set-Content -LiteralPath $saida -Value $texto -Encoding UTF8

# Copiar para a área de transferência poupa abrir o arquivo à mão.
try { Set-Clipboard -Value $texto } catch { }

$kb = [math]::Round($texto.Length / 1024, 1)

Write-Host ''
Write-Host "Gerado: _dump-auditoria.txt  ($kb KB, $($arquivos.Count - $faltando.Count) arquivos)"
Write-Host 'Conteudo copiado para a area de transferencia — cole no chat.'

if ($faltando.Count -gt 0) {
  Write-Host ''
  Write-Host 'Nao encontrados (o caminho pode ser outro):'
  foreach ($f in $faltando) { Write-Host "  $f" }
}

if ($texto.Length -gt 180000) {
  Write-Host ''
  Write-Host 'ATENCAO: o dump ficou grande. Se o chat recusar, mande em duas partes:'
  Write-Host '  Get-Content -LiteralPath _dump-auditoria.txt | Select-Object -First 1500 | Set-Clipboard'
  Write-Host '  Get-Content -LiteralPath _dump-auditoria.txt | Select-Object -Skip  1500 | Set-Clipboard'
}

Write-Host ''