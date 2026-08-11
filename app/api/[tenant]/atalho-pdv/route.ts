// @ts-nocheck
// ESTE ARQUIVO VAI EM: app/api/[tenant]/atalho-pdv/route.ts
//
// GERA O INSTALADOR DO ATALHO DO PDV.
//
// Devolve um .bat que o cliente baixa e abre com dois cliques. Ele acha o
// navegador sozinho, cria o atalho na área de trabalho e some.
//
// ─── POR QUE UM ARQUIVO, E NÃO UM BOTÃO ─────────────────────────────────────
//
// Navegador nenhum imprime sem abrir a janela de impressão — é proteção do
// próprio navegador, e página web nenhuma contorna. A única exceção é o
// parâmetro `--kiosk-printing`, que só existe como argumento de atalho do
// sistema operacional.
//
// Ou seja: para o cupom sair direto, precisa existir um atalho com esse
// parâmetro. E criar atalho é coisa que a página não faz — mas um arquivo
// baixado faz.
//
// ─── POR QUE O ARQUIVO É GERADO AQUI, E NÃO ESTÁTICO ────────────────────────
//
// Ele carrega o slug do cliente e o domínio do ambiente. Um .bat fixo em
// /public serviria a um tenant só, e voltaria a quebrar no dia em que o
// domínio mudasse — que foi exatamente o que aconteceu com o manual escrito
// à mão.
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'

type Params = { params: { tenant: string } }

/** Nome de arquivo do Windows não aceita estes caracteres. */
function nomeSeguro(s: string) {
  return s.replace(/[<>:"/\\|?*]/g, '').trim() || 'PDV'
}

export async function GET(req: NextRequest, { params }: Params) {
  const tenant = await resolveTenant(params.tenant)

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.sistematizaoficial.com'
  const url  = `${base}/${tenant.slug}/pdv`
  const nome = nomeSeguro(`PDV ${tenant.name}`)

  // O .bat escreve um .ps1 temporário e o executa, em vez de tentar passar o
  // script inteiro por linha de comando. Aspas dentro de aspas em batch
  // chamando powershell é fonte inesgotável de erro silencioso; arquivo
  // intermediário elimina o problema.
  //
  // Tudo em CP-850 e sem acento: console do Windows não renderiza UTF-8 por
  // padrão, e "instalação" vira "instala‡Æo" na tela do cliente.
  const bat = [
    `@echo off`,
    `setlocal enabledelayedexpansion`,
    `title Instalar atalho do PDV - Sistematiza.ai`,
    `color 0A`,
    ``,
    `echo.`,
    `echo   ============================================`,
    `echo    Sistematiza.ai - Atalho do PDV`,
    `echo   ============================================`,
    `echo.`,
    `echo   Procurando o navegador...`,
    ``,
    `set "NAV="`,
    `if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "NAV=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"`,
    `if not defined NAV if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "NAV=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"`,
    `if not defined NAV if exist "%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe" set "NAV=%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe"`,
    `if not defined NAV if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" set "NAV=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"`,
    `if not defined NAV if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "NAV=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"`,
    ``,
    `if not defined NAV (`,
    `  echo.`,
    `  echo   Nao encontrei o Google Chrome nem o Microsoft Edge.`,
    `  echo   Instale o Google Chrome e abra este arquivo de novo.`,
    `  echo.`,
    `  pause`,
    `  exit /b 1`,
    `)`,
    ``,
    `echo   Encontrado: !NAV!`,
    `echo   Criando o atalho...`,
    ``,
    `set "PS=%TEMP%\\sistematiza-atalho.ps1"`,
    `> "%PS%" echo $ErrorActionPreference = 'Stop'`,
    `>>"%PS%" echo $alvo = '!NAV!'`,
    // --kiosk-printing só é respeitado quando o navegador ABRE um processo
    // novo. Se já existir uma janela do Chrome/Edge aberta no computador
    // (o balcão usa o navegador para outra coisa, por exemplo), o clique no
    // atalho só manda a URL para essa janela já existente, e os parâmetros
    // de linha de comando — inclusive --kiosk-printing — são ignorados: a
    // caixa de impressão volta a aparecer, exatamente o problema que o
    // atalho existe para evitar. --user-data-dir aponta para um perfil
    // isolado, então este atalho SEMPRE sobe um processo próprio, nunca
    // reaproveita uma janela existente.
    `>>"%PS%" echo $perfil = Join-Path $env:LOCALAPPDATA 'SistematizaPDV'`,
    `>>"%PS%" echo $args = '--kiosk-printing --no-first-run --no-default-browser-check --user-data-dir="' + $perfil + '" --app="${url}"'`,
    `>>"%PS%" echo $mesa = [Environment]::GetFolderPath('Desktop')`,
    // O ícone padrão do atalho vira o do navegador (Chrome/Edge), porque
    // $s.IconLocation = $alvo aponta pro .exe do navegador. Baixamos o
    // favicon do sistema pro mesmo perfil isolado e apontamos o atalho pra
    // ele — se o download falhar por qualquer motivo, cai de volta pro
    // ícone do navegador em vez de travar a criação do atalho inteiro.
    `>>"%PS%" echo if (-not (Test-Path $perfil)) { [void](New-Item -ItemType Directory -Path $perfil) }`,
    `>>"%PS%" echo $icone = Join-Path $perfil 'icone.ico'`,
    `>>"%PS%" echo try { Invoke-WebRequest -Uri '${base}/favicon.ico' -OutFile $icone -UseBasicParsing } catch { $icone = $alvo }`,
    `>>"%PS%" echo $w = New-Object -ComObject WScript.Shell`,
    `>>"%PS%" echo $s = $w.CreateShortcut((Join-Path $mesa '${nome}.lnk'))`,
    `>>"%PS%" echo $s.TargetPath = $alvo`,
    `>>"%PS%" echo $s.Arguments = $args`,
    `>>"%PS%" echo $s.IconLocation = $icone`,
    `>>"%PS%" echo $s.Description = 'PDV - Sistematiza.ai'`,
    `>>"%PS%" echo $s.Save()`,
    ``,
    `powershell -NoProfile -ExecutionPolicy Bypass -File "%PS%"`,
    `set ERRO=%ERRORLEVEL%`,
    `del "%PS%" >nul 2>&1`,
    ``,
    `if not "%ERRO%"=="0" (`,
    `  echo.`,
    `  echo   Nao consegui criar o atalho.`,
    `  echo   Clique com o botao direito neste arquivo e escolha`,
    `  echo   "Executar como administrador", depois tente de novo.`,
    `  echo.`,
    `  pause`,
    `  exit /b 1`,
    `)`,
    ``,
    `echo.`,
    `echo   ============================================`,
    `echo    Pronto^!`,
    `echo   ============================================`,
    `echo.`,
    `echo   O icone "${nome}" esta na area de trabalho.`,
    `echo.`,
    `echo   Antes de usar, confira se a impressora do cupom`,
    `echo   esta como impressora PADRAO do Windows -- e para`,
    `echo   ela que o cupom vai sair, sem perguntar nada.`,
    `echo.`,
    `pause`,
  ].join('\r\n')   // Windows exige CRLF; com LF puro o .bat executa torto.

  return new Response(bat, {
    headers: {
      // text/plain e não application/x-bat: alguns navegadores bloqueiam o
      // download de executáveis conhecidos, e o .bat chega mesmo assim pela
      // extensão do Content-Disposition.
      'Content-Type':        'text/plain; charset=iso-8859-1',
      'Content-Disposition': `attachment; filename="Instalar ${nome}.bat"`,
      'Cache-Control':       'no-store',
    },
  })
}
