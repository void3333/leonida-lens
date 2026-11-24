@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Leonida Lens
echo.
echo  LEONIDA LENS - seu estudio de fotografia em Leonida
echo.

where py >nul 2>nul
if errorlevel 1 goto NOPY

py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul
if errorlevel 1 goto OLDPY

rem Componente de imagens (miniaturas, previas e icone). Instala so na primeira vez.
py -3 -c "import PIL" >nul 2>nul
if errorlevel 1 (
  echo  Preparando o app pela primeira vez, aguarde um instante...
  py -3 -m pip install --user --quiet --disable-pip-version-check pillow
)

rem Abre o app numa janela propria em tela cheia, sem janela de terminal.
rem (F11 sai da tela cheia. Um atalho e criado na Area de Trabalho na primeira vez.)
where pyw >nul 2>nul
if not errorlevel 1 (
  start "" pyw -3 app.py
) else (
  start "" py -3 app.py
)
exit /b 0

:NOPY
echo  O Python 3 nao foi encontrado neste computador.
echo.
echo  1. Abra https://www.python.org/downloads/ e baixe a versao mais recente.
echo  2. Na instalacao, MARQUE a opcao "Add python.exe to PATH".
echo  3. Depois, de dois cliques neste arquivo de novo.
echo.
start "" https://www.python.org/downloads/
pause
exit /b 1

:OLDPY
echo  Sua versao do Python e antiga. Instale a 3.10 ou mais nova em https://www.python.org/downloads/
pause
exit /b 1
