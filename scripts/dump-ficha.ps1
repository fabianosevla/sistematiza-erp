$raiz = "C:\Users\alves\OneDrive\Área de Trabalho\Fabiano Files\sistematiza\ERP\sistematiza-erp"
$arquivos = @(
  'app\api\[tenant]\cadastros\produtos\[id]\ficha\route.ts',
  'app\api\[tenant]\cadastros\produtos\[id]\ficha\[itemId]\route.ts',
  'app\api\[tenant]\cadastros\usuarios\[id]\route.ts',
  'app\api\[tenant]\cadastros\usuarios\[id]\perfil\route.ts'
)
$b = foreach ($rel in $arquivos) {
  $abs = Join-Path $raiz $rel
  if (Test-Path -LiteralPath $abs) {
    "===== ARQUIVO: $rel ====="
    Get-Content -LiteralPath $abs -Raw -Encoding UTF8
    ''
  } else { "===== NAO ENCONTRADO: $rel =====" ; '' }
}
$t = $b -join "`n"
Set-Content -LiteralPath (Join-Path $raiz '_dump-ficha.txt') -Value $t -Encoding UTF8
Set-Clipboard -Value $t
Write-Host "Copiado. $([math]::Round($t.Length/1024,1)) KB"