# 🏙️ Blocópolis — Cidade de Blocos

Jogo 3D de construir cidades com blocos, para **celular e computador**, direto no navegador.

Junta o lado "mundo de blocos" (colocar e quebrar blocos, andar em primeira pessoa, voar) com o lado "construtor de cidades" (estradas, zonas, prédios que crescem sozinhos).

**Sem problemas de cidadãos e sem serviços domésticos.** Não tem dinheiro, energia, água, esgoto, lixo, trânsito travado nem reclamações. Tudo é livre: você só constrói.

## ▶️ Como abrir

- **Pelo GitHub Pages (recomendado, funciona no celular):**
  1. No GitHub, vá em **Settings → Pages**.
  2. Em *Build and deployment*, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)` e clique em **Save**.
  3. Depois de 1 ou 2 minutos, o jogo fica em `https://danicraft2000.github.io/RVA/blocopolis/`.
  4. No celular, abra o link e use **"Adicionar à tela inicial"**. O jogo abre em tela cheia e funciona até sem internet.
- **No computador:** dê dois cliques em `blocopolis/index.html`. Se o navegador bloquear, rode `python3 -m http.server` na pasta do projeto e abra `http://localhost:8000/blocopolis/`.

## 🎮 Como jogar

| Ferramenta | O que faz |
|---|---|
| ✋ Mover | Move a câmera. Toque/clique num prédio para ver os detalhes. |
| 🛣️ Estrada | Arraste para fazer ruas retas. Elas sobem morros e viram ponte sobre a água. |
| 🏠 Casas · 🏬 Comércio · 🏭 Indústria | Pinte zonas ao lado das ruas. As construções **nascem sozinhas** e crescem com o tempo: casa → sobrado → prédio; loja → escritório → arranha-céu; galpão → fábrica → indústria com chaminés. |
| 🌳 Especiais | Árvore, Parque, Praça com Fonte, Prefeitura, Igreja, Estádio, Torre de TV e Farol. A cidade cresce mais rápido perto deles. |
| 🧱 Blocos | Coloca, quebra e copia blocos (43 tipos, de grama a vidro espelhado). |
| ⛰️ Terreno | Eleva, rebaixa ou nivela o chão. Abaixo do nível do mar vira lago. |
| 💥 Demolir | Remove prédios, ruas, zonas e árvores. |
| 🚶 Explorar | Anda pela cidade em primeira pessoa, pula, voa e constrói por dentro. |

Também tem: ciclo de dia e noite (com as janelas acendendo), carros andando nas ruas, fumaça nas chaminés, nuvens, 4 tipos de terreno (Planície, Colinas, Ilhas, Plano) e 3 tamanhos de mapa.

### 📱 Celular
- **1 dedo:** usa a ferramenta (no ✋ move o mapa)
- **2 dedos:** movem, giram e dão zoom
- **Explorar:** joystick à esquerda, arraste à direita para olhar, botões ⛏️ 🧱 ⬆️ ⬇️ 🕊️

### 🖱️ Computador
- **Botão esquerdo:** ferramenta · **direito:** gira · **roda:** zoom
- **WASD / setas:** move · **Q/E:** gira · **T/G:** inclina · **1–9, 0:** ferramentas · **Espaço:** pausa
- **Explorar:** WASD, mouse, Espaço (2x = voar), clique esquerdo quebra, direito coloca, **E** abre todos os blocos, **C** volta à cidade

## 💾 Salvamento
- O jogo **salva sozinho** no navegador a cada minuto e quando você sai.
- No menu ☰ dá para **baixar o arquivo da cidade** e abrir em outro aparelho (do PC para o celular, por exemplo).

## 🛠️ Técnica
- HTML + CSS + JavaScript puro, sem etapa de compilação.
- 3D com [three.js](https://threejs.org) r149 (arquivo em `lib/`, licença MIT em `lib/THREE-LICENSE.txt`).
- Todas as texturas são desenhadas por código; não há imagens externas.
- Mundo em pedaços (*chunks*) de 16×16 blocos com 64 de altura, faces escondidas descartadas e sombreamento de cantos (*ambient occlusion*).
- PWA: `manifest.webmanifest` + `sw.js` permitem instalar e jogar offline.

```
blocopolis/
├── index.html            página do jogo
├── css/style.css         interface (responsiva para celular)
├── js/noise.js           aleatoriedade e ruído do terreno
├── js/blocks.js          tipos de bloco e texturas geradas
├── js/world.js           mundo de blocos, malhas, raio e terreno
├── js/structures.js      casas, prédios, fábricas e especiais
├── js/city.js            ruas, zonas, crescimento e demolição
├── js/life.js            carros, fumaça e nuvens
├── js/controls.js        câmera, toque e primeira pessoa
├── js/save.js            salvar e carregar
├── js/ui.js              menus e painéis
├── js/main.js            jogo principal e dia/noite
├── lib/three.min.js      biblioteca 3D
├── manifest.webmanifest  instalação no celular
├── sw.js                 modo offline
└── icons/                ícones do app
```
