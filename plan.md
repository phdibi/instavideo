# Plano: Teleprompter com Gravação + Auto-Edição

## Visão Geral
Adicionar uma tela de Teleprompter integrada na UploadScreen como alternativa ao upload de vídeo. O usuário escreve/cola o script, configura velocidade, inicia gravação com câmera, e ao parar, o vídeo gravado entra no pipeline de processamento automático existente (transcrição → efeitos → B-roll).

## Arquitetura

### Fluxo do Usuário:
1. Na UploadScreen: botão "Gravar com Teleprompter" ao lado da área de upload
2. Abre tela fullscreen do Teleprompter:
   - Textarea para colar/escrever o script
   - Preview da câmera (pequeno, no canto)
   - Controles: velocidade do scroll, tamanho da fonte, espelhar texto
   - Botão "Iniciar Gravação"
3. Modo gravação:
   - Câmera ocupa tela inteira
   - Texto do teleprompter rola sobre o vídeo (semi-transparente, na parte superior)
   - Countdown 3-2-1 antes de começar
   - Botão de parar gravação
4. Ao parar gravação:
   - Gera File/Blob do vídeo
   - Injeta no store como se fosse upload (setVideoFile, setVideoUrl, setVideoDuration)
   - Transição para ProcessingScreen (pipeline existente cuida do resto)

## Arquivos a Criar/Modificar

### 1. Novo: `src/components/TeleprompterScreen.tsx`
O componente principal com:
- **Estado `phase`**: `"setup"` | `"recording"` | `"countdown"`
- **Setup phase**: textarea para script, controles (velocidade 1-10, fontSize, flip horizontal)
- **Countdown phase**: overlay 3→2→1 com animação
- **Recording phase**:
  - `navigator.mediaDevices.getUserMedia({ video: true, audio: true })`
  - `MediaRecorder` para gravar em WebM
  - Texto do teleprompter rolando automaticamente sobre o preview da câmera
  - Timer mostrando duração da gravação
  - Botão "Parar" (vermelho, pulsante)
- **Ao parar**:
  - `new Blob(chunks, { type: 'video/webm' })` → `new File(...)`
  - Chama `handleFile` pattern do UploadScreen (setVideoDuration, setVideoFile, setVideoUrl, setStatus)

### 2. Modificar: `src/components/UploadScreen.tsx`
- Adicionar botão "Gravar com Teleprompter" abaixo da área de upload
- Estado `showTeleprompter` para alternar entre upload e teleprompter
- Quando `showTeleprompter === true`, renderiza `<TeleprompterScreen />`
- Feature card atualizada para mencionar teleprompter

### 3. Modificar: `src/types/index.ts`
- Nenhuma mudança necessária (o vídeo gravado entra como File normal)

### 4. Nenhuma mudança no pipeline de processamento
- ProcessingScreen já recebe videoFile/videoUrl do store
- Funciona igual para vídeo gravado ou enviado

## Detalhes Técnicos do Teleprompter

### Gravação de Vídeo:
```
navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'user', width: 1080, height: 1920 },
  audio: true
})
```
- MediaRecorder com `video/webm;codecs=vp9` (fallback para `video/webm`)
- Chunks coletados em `ondataavailable`
- Ao parar: Blob → File → injetar no store

### Teleprompter UI na gravação:
- Texto renderizado em overlay semi-transparente sobre o vídeo da câmera
- CSS `transform: translateY()` animado com `requestAnimationFrame` para scroll suave
- Velocidade controlável (pixels/segundo, configurável no setup)
- Fonte grande (configurável 24-72px)
- Opção de espelhar texto (para usar com espelho/vidro na frente da câmera)
- Indicador visual de progresso (barra lateral mostrando posição no texto)

### Layout do Setup:
- Esquerda: textarea grande para script com contador de palavras/tempo estimado
- Direita: preview da câmera + controles (velocidade, fonte, flip)
- Bottom: botão grande "Iniciar Gravação"

## Estimativa: 1 arquivo novo + 1 modificação menor
