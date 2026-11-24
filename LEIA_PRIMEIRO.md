# Leonida Lens — leia primeiro

Um app **pessoal** para quem faz RP de fotógrafo no GTA VI (PS5): guarda suas capturas, você anota **onde, quando e com que
clima** cada foto foi feita, organiza em ensaios, vê tudo num **mapa de Leonida** e, se quiser, publica uma **galeria online**.

- Roda **só no seu computador**. Sem conta nossa, sem servidor nosso, sem mensalidade.
- O passo a passo completo, com imagens, está no **README** do projeto e no **Guia** dentro do app (menu **07 · Guia**).

---

## 1. Instalar

1. Em **https://github.com/void3333/leonida-lens/releases/latest**, desça até **Assets** e baixe
   **`LeonidaLens-Setup-<versão>.exe`** (não baixe "Source code").
2. Se o navegador segurar o download: **Edge** → **…** → **Manter** → **Mostrar mais** → **Manter mesmo assim**; **Chrome** → **Manter**.
3. Dê dois cliques. Se aparecer **"O Windows protegeu o computador"**, clique em **Mais informações → Executar assim mesmo**
   (o instalador não tem assinatura digital paga).
4. Avance as telas. Não precisa de administrador nem de instalar mais nada (Python, Pillow e Node vão dentro).

Os atalhos **"Leonida Lens"** ficam na Área de Trabalho e no Menu Iniciar. O app abre em **tela cheia**:
**F11** sai/volta da tela cheia e **Alt+F4** fecha.

## 2. Primeiros passos

Na primeira abertura aparece um **assistente em tela cheia** (8 etapas curtas, dá para pular qualquer uma):
novo ou continuar estúdio → nome e assinatura → aparência → fotos → galeria online → backup.
Para rever: **Meu estúdio → Primeiros passos**.

## 3. Trazer as fotos do PS5

- **Nuvem PlayStation (automático):** no PS5, **Configurações → Capturas e transmissões → Capturas → envio automático** para
  o PlayStation App (celular na mesma conta). No PC, entre no site da Sony, abra
  **https://ca.account.sony.com/api/v1/ssocookie**, copie o texto que aparece (pode ser a linha inteira) e cole em
  **Procedência → PlayStation → Valor npsso → Conectar**. A primeira busca começa sozinha; depois, a cada 15 minutos com o app aberto.
- **Pendrive (sem conta):** no PS5, **Galeria de mídia → Copiar para unidade USB**; no PC, escolha a pasta em
  **Procedência → Pasta e importação** ou arraste as fotos para a janela.

> **Nunca** digite sua senha da PSN no app. O token é confidencial: não mande para ninguém.
> Se aparecer "A Sony não aceitou esse token", entre de novo no site da Sony e copie o valor novo.

## 4. Ficha de campo

Clique numa foto. Na aba **Campo**: local (digite ou clique no mapa), hora do jogo, clima e a frase.
Na aba **Arquivo**: título, ensaio e **Publicar na galeria online**. Fechar (X ou Esc) ou trocar de foto salva sozinho;
**Ctrl+Enter** salva e vai para a próxima.

## 5. Galeria online (grátis)

1. Crie a conta em **https://dash.cloudflare.com/sign-up** e confirme o e-mail.
2. **Meu estúdio → Galeria online → Conectar Cloudflare**. Na 1ª vez pode levar alguns minutos até o navegador abrir.
   Entre e clique em **Allow**.
3. O app publica sozinho. O endereço (`….pages.dev`) aparece em **Meu estúdio → Galeria online → Abrir site**.
   Na 1ª vez ele pode levar ~5 minutos para abrir: espere e recarregue.
4. Para ver como o visitante vê, sem publicar: **06 · Prévia da galeria → Como visitante**.

## 6. Backup, atualização e desinstalação

- **Backup:** **Meu estúdio → Backup** → escolha uma pasta do OneDrive/Google Drive (cópia a cada 30 min) ou **Baixar backup (.zip)**.
  Para restaurar num PC novo: assistente → **Continuar meu estúdio**.
- **Atualizar:** baixe o Setup novo em Releases e instale **por cima**. Fotos, fichas, conexão com a Sony e galeria continuam.
  A versão instalada aparece no **Guia**.
- **Desinstalar:** Configurações → Aplicativos → Leonida Lens → Desinstalar. Seus dados (pasta `LeonidaFieldNotes` na sua
  pasta de usuário) **nunca** são apagados.

---

Projeto de fã, sem afiliação com a Rockstar Games, Take-Two ou Sony. Mapa "Leonida Map" © Rockstar Games (baixado do site
oficial na 1ª execução). Lugares: Open GTA 6 Map (CC BY 4.0). Código: licença MIT.
