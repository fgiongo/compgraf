# Projeto Final — Computação Gráfica (Oceano)

Cena 3D em [p5.js](https://p5js.org/) (modo WEBGL) com céu de ciclo dia/noite
(skybox) e oceano com ondas de Gerstner via shaders.

## Como rodar

> ⚠️ **Não abra o `index.html` direto pelo navegador (`file://`).**
> A cena usa `loadShader`, que faz `fetch` dos arquivos em `shaders/`, e o
> navegador bloqueia isso em `file://` por CORS. É preciso servir por HTTP.

Na pasta do projeto, suba um servidor local. Exemplos:

```bash
# Python (já vem no Windows/macOS/Linux)
python -m http.server 8080

# ou Node
npx serve .
```

Depois abra no navegador:

```
http://localhost:8080
```

(troque a porta se a 8080 estiver ocupada)

## Controles

- **Slider de tempo** (embaixo): controla o ciclo dia/noite. Arrastar pausa o
  avanço automático; o botão ▶/❚❚ retoma/pausa.
- **Slider de amplitude**: ajusta a altura das ondas do oceano.
- **Arrastar com o mouse**: orbita a câmera ao redor da cena.

## Estrutura

| Arquivo / pasta                  | Responsável por                                  |
| -------------------------------- | ------------------------------------------------ |
| `index.html` / `index.js`        | Cena central — junta as partes e a iluminação    |
| `skybox.js`                      | Céu (cúpula, sol/lua, estrelas, ciclo dia/noite) |
| `ocean.js` + `shaders/`          | Oceano (ondas de Gerstner em shaders)            |
| `style.css`                      | Estilo da página e dos controles                 |
| `docs/`                          | Documentação técnica                             |
| `vendor/p5/`                     | Biblioteca p5.js (local)                          |

## Para adicionar uma nova parte à cena

No `index.js`, dentro de `draw()`, há uma seção marcada
`// 3) PARTES DOS COLEGAS`. Desenhe sua parte ali, de preferência envolvida em
`push()` / `pop()` para isolar transformações e estilos. O céu (`Skybox.draw`)
deve continuar sendo desenhado **antes** das luzes da cena.
