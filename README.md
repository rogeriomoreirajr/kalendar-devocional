# Kalendar Devocional (2026–2027 · Ano I)

App devocional em formato de **livro de ofícios**, a partir do *Kalendar — Plano Bienal de Leitura Bíblica (Ano I · Edição Compacta · DIA)*. Mostra o ofício diário (semana de quinta a quarta), as leituras e o salmo do dia, e permite **marcar o que já foi lido** — sem metas, sem sequências, sem cobrança.

- Abre no dia de hoje (ou em 26/11/2026, antes de o ciclo começar).
- **Topo mínimo:** uma faixa de sete ícones, um por dia da semana (quinta a quarta), cada um com o **tema do dia** (A Torá, Evangelhos, História de Israel, Dia do Senhor, Atos e Epístolas, Os Profetas, Literatura Sapiencial) e, acima, a sigla do dia da semana com o número do dia (ex.: QUI 10). Tocar num ícone abre aquele dia; a faixa rola com o dedo, com impulso, passando por várias semanas, e só para quando uma semana começa na quinta (no celular há uma dica na primeira visita; no desktop com mouse aparecem setas que rolam uma semana); tocar na data abre o calendário; quando você está vendo outro dia, um atalho "Hoje" aparece ao lado da data. Embaixo da data: "TEMA · ANO I · ESTAÇÃO".
- Marcação por leitura (A.T., Epístola, Evangelho, Salmo) e por dia; guardada **só no aparelho** (`localStorage`). No topo, o dia lido vira um disco cheio; o dia não lido fica neutro.
- **Caderneta**: calendário dos 364 dias, com os dias com a Palavra preenchidos e os outros em branco, sem destaque de "atraso". Cada estação tem a sua cor: uma faixa fina no alto de cada semana (que mostra a virada de uma estação para outra), o nome da estação e os dias lidos aparecem na cor dela. O cabeçalho é neutro (carvão) e o fundo é cinza, para as cores das estações se destacarem.
- **Links para a Bíblia**: cada referência (ex.: Mateus 11:2–10) abre o capítulo no **YouVersion** ou no **Bíblia Online**, à escolha, em **Ajustes**, junto com a versão (A21, ARA, ARC, NAA, NVI, NVT, NTLH e, no Bíblia Online, ACF). Padrão: YouVersion, A21. Também dá para desligar os links.
- Exportar/importar as marcações (para passar do computador ao celular), em **Ajustes**.
- **Cor da estação litúrgica** na tela do dia: papel tingido, cabeçalho em cor profunda e uma **barra do ano** no topo com as estações do Ano I. A estação de hoje desce e toca o cabeçalho (na mesma cor); as outras ficam separadas por um vão num tom mais escuro da estação. Na Caderneta e nos Ajustes (telas do ano todo) o cabeçalho é em carvão neutro e o fundo é cinza, e a estação de hoje fica em cor cheia na barra do ano. As cores de cada estação (acento, cor profunda, tinta do papel e filete, no claro e no escuro) ficam no início de `styles/kalendar.css`.
- Tema claro/escuro, funciona offline e instala na tela inicial (PWA).

## Estrutura

| Arquivo | Para que serve |
| --- | --- |
| `index.html` | Página única. Contém os dados embutidos entre `<!-- DADOS:INICIO -->` e `<!-- DADOS:FIM -->` |
| `app.js` | Lógica do app (rotas, marcação, caderneta). Sem dependências |
| `styles/kalendar.css` | Estilo do livro: cores, estações, tema escuro |
| `manifest.webmanifest`, `sw.js`, `icons/` | Instalação no celular e uso offline |
| `scripts/parse_kalendar.py` | Lê o PDF do Kalendar e gera os JSONs (e os embute no `index.html`) |
| `data/*.json` | Ofício semanal (`liturgias_semana.json`) e plano de leitura (`plano_leitura.json`) |

`styles/kalendar-base.css` é o CSS da primeira versão e não é mais usado.

## Gerar os dados a partir do PDF

```bash
pip install pymupdf
python scripts/parse_kalendar.py
# ou: python scripts/parse_kalendar.py --pdf caminho/kalendar.pdf --out ./data [--debug-text] [--no-embed]
```

Sem argumentos, usa `KALENDAR-compacto-P_B.pdf` da raiz e grava em `data/`. O script valida o resultado (364 dias contínuos de 26/11/2026 a 24/11/2027, cada um com leitura e salmo) e sai com código 1 se algo não bater. Também atualiza os dados embutidos no `index.html`.

Campos gerados:

- `liturgias_semana.json` → `semana_liturgica.<dia>.secoes.<secao>[]` com `texto`, `comunidade` (voz da comunidade, em negrito no PDF), `ref` (referência bíblica à direita da linha) e `segmentos` (quando a linha mistura estilos, ex.: "…nosso Senhor. **Amém.**"). Título e notas de cada seção ficam em `secoes_meta`. Confissão e Coleta saem em parágrafos. O `benedictus` traz o cântico completo.
- `plano_leitura.json` → `entradas[]` com `data`, `data_iso`, `dia_semana`, `genero`, `estacao`, `estacao_css`, `estacao_periodo`, `titulo_liturgico`, `leituras`, `leituras_detalhe` (domingos: `antigo_testamento`, `epistola`, `evangelho`) e `salmo`.

## Rodar localmente

O `index.html` com os dados embutidos abre direto (duplo clique). Para testar o modo instalável (service worker), use um servidor local:

```bash
python -m http.server 8765
# abra http://localhost:8765
```

## Publicar no GitHub Pages (para usar no celular)

1. Crie um repositório no GitHub (por exemplo `kalendar-devocional`) e envie estes arquivos. O `.gitignore` já deixa de fora o PDF e os rascunhos: **não envie o PDF do Kalendar**.
2. No repositório: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. Em alguns minutos o site fica em `https://SEU-USUARIO.github.io/kalendar-devocional/`.
4. No celular, abra esse endereço e use **Adicionar à tela inicial** (iPhone: botão Compartilhar → Adicionar à Tela de Início; Android/Chrome: menu ⋮ → Instalar app). Instalado, o app abre sem internet e o iPhone não apaga as marcações por falta de uso.

Observações:

- O endereço do GitHub Pages é público: quem tiver o link abre o site. A página pede aos buscadores que não a indexem (`noindex`), mas isso não é segurança.
- O conteúdo é do Kalendar (© lecionario.com, Daniel de Lima Vieira) e o Cântico de Zacarias é da Rede Episcopal Brasileira. O site é para uso pessoal; para divulgar além disso, peça autorização aos autores.
- As marcações ficam no navegador de cada aparelho. Para levar do computador ao celular (ou o contrário), use **Caderneta → Exportar marcações** e depois **Importar marcações** no outro aparelho.
- Ao regerar os dados com `parse_kalendar.py`, faça commit do `index.html` e de `data/` e envie de novo.
