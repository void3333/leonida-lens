# Leonida Field Notes — seu estúdio de fotografia em Leonida

Um app **pessoal** para quem faz RP de fotógrafo no GTA VI (PS5): guarde suas capturas, veja em **qualidade máxima e tela cheia** com zoom, organize em ensaios, anote **onde, quando e com que clima** cada foto foi feita e veja tudo num **mapa de Leonida**.

- Roda **só no seu computador**. Sem conta, sem servidor, sem mensalidade.
- Cada pessoa usa com o **próprio** acervo e, se quiser, a **própria** conta PlayStation.
- Seus dados ficam numa pasta sua e podem ser copiados (backup) a qualquer momento.

---

## 1. Instalar (só na primeira vez, ~3 minutos)

1. **Instale o Python** (gratuito): https://www.python.org/downloads/
   Na primeira tela do instalador, **marque "Add python.exe to PATH"** e clique em *Install Now*.
2. **Extraia o ZIP inteiro** do Leonida Field Notes numa pasta fixa, por exemplo `Documentos\Leonida Field Notes`.
   *Não rode de dentro do ZIP e não apague essa pasta depois.*
3. Dê **dois cliques em `INICIAR_WINDOWS.bat`**.
   Na primeira vez ele prepara um componente de imagens (leva alguns segundos).

Pronto: o app abre **numa janela própria, em tela cheia**, e cria o atalho **"Leonida Field Notes"** na Área de Trabalho e no Menu Iniciar. Das próximas vezes, é só usar o atalho.

> **Dica:** `F11` sai e volta da tela cheia. Fechar a janela (`Alt+F4`) encerra o app.
> É preciso ter Microsoft Edge, Google Chrome ou Brave instalado; o Windows 11 já vem com o Edge.

## 2. Primeiros passos (o app te guia)

Na primeira abertura aparece um assistente com 3 passos:

1. **Seu estúdio:** dê um nome à sua agência ou estúdio de fotos (ex.: *Vice Lens Photography*) e, se quiser, o nome do seu fotógrafo no RP. O nome aparece no app e na Galeria.
2. **Trazer as fotos:** escolha um dos caminhos da seção 3.
3. **Proteger seus dados:** escolha uma pasta de backup (recomendado, ver a seção 6).

Dá para rever o guia quando quiser em **Meu estúdio → Primeiros passos**.

## 3. Como as fotos chegam ao app

No PS5, tire as fotos com o botão **Criar** do controle → *Capturar tela*. Depois escolha um caminho:

### A) Nuvem PlayStation, automático (experimental)
1. No PS5: `Configurações → Capturas e transmissões → Capturas → Upload automático` (ligado).
2. No app: **Sincronização** → **Entrar no site da Sony** e faça login normalmente, no site oficial.
3. Clique em **Abrir página de sessão Sony**. Vai aparecer um texto com `"npsso":"..."`.
   Copie **só o valor** entre aspas, que é o seu token.
4. Cole no campo do app e clique em **Conectar**. Depois, em **Buscar fotos na nuvem**.

**Segurança:** o token é como uma senha. **Nunca** mande para ninguém. O app usa o token uma vez, guarda apenas a sessão **criptografada pelo Windows** no seu usuário e **nunca** coloca isso em backups. Esta integração não é oficial da Sony e pode parar de funcionar. Nesse caso, use o caminho B.

> A nuvem da Sony guarda as capturas por cerca de 14 dias. Importe com frequência.

### B) Pendrive ou pasta
No PS5: **Galeria de mídia** → selecione as fotos → **Copiar para unidade USB**. No PC, copie as fotos para uma pasta (ex.: `Imagens\Leonida Inbox`). No app, vá em **Sincronização → Escolher pasta**. O app vigia a pasta e importa as fotos novas sozinho.

### C) Arrastar
Arraste arquivos JPG, PNG ou WEBP para a janela do app, ou use **Importar fotografias**.

Fotos repetidas são ignoradas automaticamente.

## 4. Organizar suas fotos (Estúdio)

Clique numa foto no **Acervo** para editar:

| Campo | Para quê |
|---|---|
| **Título** | Nome da foto |
| **Lugar / bairro** | Digite e escolha entre ~650 lugares de Leonida. O pino vai sozinho para o mapa |
| **Ponto no mapa** | Clique no mapa onde a foto foi feita. O pino pode ser arrastado |
| **Hora no jogo / Clima** | Ex.: `06:12`, *Neblina* |
| **Ensaio** | Agrupe fotos numa série (crie em **Ensaios**) |
| **Notas** | A história por trás da foto (aparece como legenda na Galeria) |
| **Estrelas / Favorita** | A favorita mais recente vira a capa da Galeria |

> O PS5 **não grava** a localização, a hora do jogo nem o clima dentro da foto. Esses dados são preenchidos por você, que é justamente parte do RP de fotógrafo.

## 5. Ver suas fotos (Galeria)

Clique em **Galeria** no menu do Estúdio.

- **Acervo:** suas fotos em grade, com filtros por ensaio e favoritas.
- **Visualizador:** clique numa foto para abrir em tela cheia.
  - Roda do mouse ou clique: **zoom até 100% real** (cada pixel do 4K).
  - Arrastar: mover a imagem. Setas `←` `→`: foto anterior / próxima.
  - `F`: tela cheia. `I`: mostra ou esconde as informações. `Esc`: fecha.
  - Botões no topo: **baixar o original**, **editar no Estúdio**.
- **Ensaios:** cada série em formato de revista.
- **Mapa:** todas as fotos marcadas, em versão noite ou dia. Clique numa foto no mapa para abrir.

O mapa baixa as partes que você visualiza **uma única vez** e guarda no PC. Depois disso funciona offline.

## 6. Galeria online (opcional): para outras pessoas visitarem

Você pode publicar a Galeria na internet. Os visitantes **só veem as fotos** (sem login, sem comentários) e não têm acesso ao Estúdio, ao caderno de campo, aos backups nem ao seu token.

1. Instale o **Node.js** (gratuito, versão LTS): https://nodejs.org. Ele é usado só pela ferramenta oficial da Cloudflare.
2. No app: **Meu estúdio → Galeria online → Conectar Cloudflare e publicar**.
3. O navegador abre a Cloudflare: entre ou crie uma conta grátis (não pede cartão) e clique em **Allow**. É só uma vez.
4. Em cerca de 1 minuto o endereço do seu site aparece, algo como `https://lfn-seu-estudio.pages.dev`.

**Sincronização automática:** quando entra foto nova (nuvem PlayStation, pasta ou arrastar) ou você edita uma ficha, o app atualiza o site sozinho em seguida (enquanto o app estiver aberto).

**Escolher o que aparece:** toda foto é publicada por padrão. Para esconder uma, abra a ficha e desmarque **"Publicar na galeria online"**. O título, o local, a hora, o clima, a série e as **notas** de cada foto publicada ficam visíveis no site. Os números de tombo são os mesmos do seu acervo.

Botões em Galeria online: **Abrir site**, **Atualizar agora** e **Pausar** (para de sincronizar; o site continua no ar com a última versão).

## Ensaios-pauta, textos automáticos e Jornada (v2.4)

**Ensaios-pauta.** Em **Ensaios** existem 10 projetos prontos (documental de rua, forense, esportes, vida selvagem, retrato noturno, arquitetura vazia, praia, estrada, vida noturna e tempestades), cada um com manifesto, regras de fotografia e **20 pautas** (título, local, hora, clima e frase de campo).
- Clique numa vaga **+** e escolha a foto: ela herda os dados da pauta só nos campos vazios, inclusive o ponto no mapa quando o local é conhecido.
- **editar pauta** muda o texto; **tirar foto** libera a vaga; **+ adicionar pauta** cria vagas extras.
- O ensaio começa como **rascunho**. Clique em **Publicar no site** quando quiser mostrá-lo e depois em **Sincronizar e publicar**.
- **+ pautas** recria os ensaios-pauta que você tiver apagado.

**Sem tempo de escrever?** Foto sem título ou sem frase recebe um texto automático de uma biblioteca com 350 títulos e 283 frases. É sempre o mesmo para cada foto e não se repete entre fotos. Na ficha, **sugerir** sorteia outro para você salvar.

**Local secreto.** Foto sem ponto no mapa aparece como *Local secreto*. Hora e clima só aparecem quando preenchidos.

**Jornada.** Na Galeria, **Jornada** (tecla `J`) mostra seu arquivo desde a primeira foto, mês a mês, como capítulos. **Projetar desde o início** passa por tudo em ordem, com o "dia" da jornada em cada foto.

**Trilha contemplativa.** A Galeria pergunta se o visitante quer som. A trilha é gerada ao vivo pelo navegador (original, sem arquivos). A escolha fica salva; o botão de alto-falante no topo liga e desliga (tecla `S`), e passar o mouse mostra o volume.

**Prévia.** No Estúdio, **Prévia da galeria** mostra o site como o visitante vê, ou tudo, incluindo rascunhos.

## 7. Backup: não perca nada

Em **Meu estúdio**:

| Proteção | Como funciona |
|---|---|
| **Cópias automáticas do banco** | A cada 6 horas e ao fechar o app, guarda as últimas 14 versões. Automático |
| **Backup em pasta** | Escolha um **HD externo, pendrive ou pasta do OneDrive/Google Drive**. A cada 30 minutos o app copia as fotos novas e o banco para lá. Nunca apaga nada do backup |
| **Backup completo (.zip)** | Um arquivo com o banco + todas as fotos originais. Baixe quando quiser e guarde onde preferir |
| **Só o catálogo (JSON)** | Títulos, lugares, notas etc. em texto, sem as fotos |

**Restaurar ou mudar de computador:** instale o app no PC novo, abra **Meu estúdio → Restaurar backup** e escolha o `.zip`. Antes de restaurar, o app guarda uma cópia do estado atual, por segurança. As configurações do computador atual, como pastas, são mantidas.

### Onde ficam os arquivos
`C:\Users\<você>\LeonidaFieldNotes\`

| Pasta / arquivo | Conteúdo |
|---|---|
| `originals\` | suas fotos originais, intactas |
| `library.sqlite3` | o banco (títulos, lugares, ensaios, diário…) |
| `backups\` | cópias automáticas do banco |
| `thumbnails\`, `previews\`, `map_tiles\` | caches que o app recria sozinho |
| `private_psn_tokens.dpapi` | sessão Sony criptografada, só funciona no seu usuário do Windows. **Não compartilhe** |

## 8. Problemas comuns

| Problema | Solução |
|---|---|
| "Python não encontrado" | Reinstale o Python marcando **Add python.exe to PATH** |
| Abriu no navegador comum | Instale o Edge ou o Chrome. O app usa o "modo app" deles |
| O mapa não aparece | A primeira visualização de cada região precisa de internet |
| Sony não conecta | O token expira. Pegue um novo `npsso`, ou use o pendrive (3B) |
| Galeria online não atualiza | Veja o aviso em Meu estúdio → Galeria online; confira se o Node.js está instalado e clique em Reconectar |
| Quero ver o que aconteceu | Veja o arquivo `LeonidaFieldNotes\app.log` |

## Créditos e licenças

- Mapa e lista de lugares: [Open GTA 6 Map](https://github.com/fbritoferreira/gta6) (fbritoferreira e colaboradores), **CC BY 4.0**. Mapa de fã, posições aproximadas.
- [Leaflet](https://leafletjs.com) (BSD-2), [PhotoSwipe](https://photoswipe.com) (MIT), fontes Instrument Serif e Inter (SIL OFL).
- Projeto de fã independente. Não é afiliado à Rockstar Games, Take-Two, Sony ou PlayStation.

**Versão 2.4 — 22/11/2026**

### Para desenvolvedores
Backend em Python (biblioteca padrão + Pillow), SQLite, front-end HTML/CSS/JS sem build. Testes: `python -m unittest discover -s tests -v`. Opções: `python app.py --windowed` (janela maximizada), `--browser-tab` (aba comum), `--no-browser`, `--port N`.
