# Leonida Field Notes

Diário fotográfico pessoal de GTA VI (PS5). O usuário faz roleplay como fotógrafo em Leonida.
Responder ao usuário em **português do Brasil**.

## Duas partes
- **Estúdio** (local, só PC, desktop): `app.py` — servidor HTTP da biblioteca padrão + SQLite em
  `~/LeonidaFieldNotes` (`LEONIDA_DATA_DIR` sobrescreve). Abre como janela de app do Chromium (`desktop.py`).
  Front-end: `web/index.html`, `web/app.js`, `web/onboarding.js` (assistente de primeiros passos em tela cheia, Guia do
  fotógrafo e aba Aparência), `web/style.css` (+ `web/vendor/studio-mono.css`). Visual padrão preto e branco "CODE".
- **Temas**: `web/vendor/lfn-themes.js` (Estúdio e galeria). O tema "codigo" não escreve variáveis = visual original;
  os outros sobrescrevem variáveis de cor (`--bg`, `--ink*`, `--hi`, `--accent`, `--accent-2`, `--bg-rgb`…). Nada de
  `#fff`/`#000` literal novo em `studio-mono.css`/`gallery-mono.css`: use as variáveis. Na galeria, o que fica sobre a
  foto/mapa é sempre escuro (regra "sala de projeção" no topo de `gallery-mono.css`). Configurações `theme_*`/`accent_*`;
  o tema da galeria vai no catálogo (`/api/catalog` e `catalog.json`).
- **Galeria pública** (estática, Cloudflare Pages): `web/galeria/` — `app.js` é ES module; módulos extras em
  `web/galeria/*.js|css` (servidos e publicados automaticamente). Precisa funcionar **no computador e no celular**
  (`web/vendor/gallery-mobile.css`). `publisher.py` gera `~/LeonidaFieldNotes/site` e publica com wrangler.

## Regras do projeto (não negociáveis)
- Nada de contas, login, curtidas, comentários, banco de dados no servidor ou API externa para visitantes.
- O Estúdio é só desktop. A galeria tem que funcionar em desktop e celular — conferir os dois após mudanças nela.
- No Estúdio, **sem rolagem** exceto a grade de miniaturas e listas longas: separar em abas (`pageTabs()` em `web/app.js`).
- Capturas de PS5 não têm local/hora/clima: isso é digitado na ficha de campo.
- Bibliotecas de terceiros ficam copiadas em `web/vendor/` (nada de CDN em produção), com a licença ao lado.

## Mapa
- Coordenadas em "unidades de mapa" 0..1024 (espaço do Open GTA 6 Map), usadas por todos os pinos e por
  `web/vendor/leonida-places.json`.
- Imagem: pôster oficial da Rockstar (`mapa_oficial.jpg`), posicionado por `mapa_calibracao.json`.
  `map_official.py` gera os tiles em `<dados>/map_official` ao iniciar o Estúdio (sem imagem → volta aos tiles de fã).
- `web/vendor/leonida-map.js` é compartilhado por Estúdio e galeria (`LeonidaMap.create`).

## Comandos
```
python app.py                         # Estúdio real (dados reais!)
python tools/sandbox.py               # Estúdio com CÓPIA da biblioteca em .sandbox/ (porta 8799) — use para testar
python tools/sandbox.py --fresh       # recopia a biblioteca
python tools/run_tests.py             # todos os testes + checagem de sintaxe JS
python tools/build_installer.py        # instalador Windows de um arquivo -> dist/ (versão em version.py)
node tools/browser.mjs shot http://127.0.0.1:8799/galeria/#/mapa mapa [--mobile]
node tools/browser.mjs run  http://127.0.0.1:8799/ passos.json      # roteiro de cliques/teclas/capturas
```
Capturas vão para `.sandbox/shots/`. O robô também imprime erros do console da página.

## Como trabalhar
- **Nunca testar contra os dados reais**: usar `tools/sandbox.py` (ele apaga as configurações de publicação e
  não copia o token da Sony, então não publica nem acessa a PSN).
- Após mudar a galeria: capturas em desktop e `--mobile`. Após mudar o Estúdio: captura em 1600x900 e checar rolagem.
- Git: trabalhar em branch; agentes em paralelo podem usar worktrees (`isolation: "worktree"`).
- Testes em `tests/` são scripts unittest independentes (`python tests/test_x.py`).
