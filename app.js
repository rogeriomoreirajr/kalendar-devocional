/* Kalendar Devocional — app do livro de ofícios (sem dependências).
 *
 * Dados: JSON embutido no index.html (gerado por scripts/parse_kalendar.py).
 * Marcações de leitura: ficam só neste aparelho (localStorage), nada é enviado a servidor.
 * Rotas (hash): #/ (hoje) · #/dia/AAAA-MM-DD · #/caderneta
 */
(function () {
  "use strict";

  var CICLO_INI = "2026-11-26";
  var CICLO_FIM = "2027-11-24";
  var STORE_KEY = "kalendar.ano1.v1";

  var DIA_POR_WEEKDAY = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"]; // getUTCDay()
  var NOMES_DIAS = {
    quinta: "Quinta-feira", sexta: "Sexta-feira", sabado: "Sábado", domingo: "Domingo",
    segunda: "Segunda-feira", terca: "Terça-feira", quarta: "Quarta-feira"
  };
  var SIGLAS = { quinta: "QUI", sexta: "SEX", sabado: "SÁB", domingo: "DOM", segunda: "SEG", terca: "TER", quarta: "QUA" };
  var ORDEM_SEMANA = ["quinta", "sexta", "sabado", "domingo", "segunda", "terca", "quarta"];
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  var TITULOS_SECAO = {
    abertura: "Abertura",
    invocacao: "Invocação",
    confissao: "Confissão de pecado e súplica pelo perdão",
    leitura: "Leitura · Lecionário",
    gloria: "Glória Patri",
    aclamacao: "Aclamação",
    cantico_louvor: "Cântico de louvor",
    benedictus: "Benedictus",
    oracao_do_senhor: "Oração do Senhor",
    suplica: "Súplica diurna",
    oracoes_intercessao: "Orações do coração e intercessão",
    coleta: "Coleta"
  };
  var SECOES_PARAGRAFO = { confissao: true, coleta: true };
  var SECOES_OMITIDAS = { silencio_reflexao: true, salmo: true }; // entram no bloco "Leitura"

  var ICONES = {
    at: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 5.5c2.8-1.2 5.5-1.1 8.5.5 3-1.6 5.7-1.7 8.5-.5V18c-2.8-1.2-5.5-1.1-8.5.5-3-1.6-5.7-1.7-8.5-.5z"/><path d="M12 6v12.5"/></svg>',
    nt: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12c3.2-4.8 7.5-5.8 11.5-3.6 1.8 1 3.3 2.3 4.5 3.6-1.2 1.3-2.7 2.6-4.5 3.6-4 2.2-8.3 1.2-11.5-3.6z"/><path d="M18.5 12l3-3M18.5 12l3 3"/></svg>',
    sl: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4c5.5 0 9.5 2.2 9.5 7.5V20"/><path d="M7 4v12.5C7 18.6 8.5 20 10.5 20h6"/><path d="M10.5 8v9M13.5 9.5V17"/></svg>'
  };
  var ICONE_LUA =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.2 8.2 0 1 0 20 14.2z"/></svg>';
  var ICONE_SOL =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>';
  // Tema de cada dia da semana (gênero das Escrituras no Kalendar); no domingo o nome exibido é "Dia do Senhor".
  var TEMAS = {
    quinta: "A Torá", sexta: "Evangelhos", sabado: "História de Israel", domingo: "Dia do Senhor",
    segunda: "Atos e Epístolas", terca: "Os Profetas", quarta: "Literatura Sapiencial"
  };
  function iconeTema(caminhos) {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + caminhos + "</svg>";
  }
  var ICONES_TEMA = {
    quinta: iconeTema('<path d="M4.5 20V9a3.5 3.5 0 0 1 7 0v11z"/><path d="M12.5 20V9a3.5 3.5 0 0 1 7 0v11z"/><path d="M7 12.5h2M15 12.5h2M7 15.5h2M15 15.5h2"/>'),
    sexta: iconeTema('<path d="M12 3v18M7 9h10"/>'),
    sabado: iconeTema('<path d="M2.5 19.5 12 4.5l9.5 15z"/><path d="M9.5 19.5v-3.5a2.5 2.5 0 0 1 5 0v3.5"/>'),
    domingo: iconeTema('<path d="M3 18.5h18"/><path d="M7 18.5a5 5 0 0 1 10 0"/><path d="M12 6v3M5.2 9.5l2 2M18.8 9.5l-2 2"/>'),
    segunda: iconeTema('<rect x="3.5" y="6" width="17" height="12.5" rx="1.5"/><path d="M4 7.5l8 6 8-6"/>'),
    terca: iconeTema('<path d="M12 3c.6 3.2-4 5.6-4 10a4 4 0 0 0 8 0c0-1.8-.9-3-1.8-4.1C13.2 8 12.6 5.6 12 3z"/><path d="M12 20a2 2 0 0 1-2-2c0-1.4 2-2.2 2-4 0 1.8 2 2.6 2 4a2 2 0 0 1-2 2z"/>'),
    quarta: iconeTema('<path d="M5 19C5 10.5 10 5 19.5 4.5 19 14 13.5 19 5 19z"/><path d="M5 19 14 10"/>')
  };
  var ICONE_CHEVRON =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var MARCA =
    '<svg class="caixa__marca" width="12" height="12" viewBox="0 0 12 12" fill="none" style="stroke:var(--on-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6.5l2.7 2.7L10 3.2"/></svg>';

  // ------------------------------------------------------------------ links para a Bíblia

  // Versões em português: id no YouVersion (bible.com) e nome. No Bíblia Online a sigla minúscula é o endereço.
  var VERSOES = {
    a21: { nome: "Almeida Século 21 (A21)", yv: 2645 },
    ara: { nome: "Almeida Revista e Atualizada (ARA)", yv: 1608 },
    arc: { nome: "Almeida Revista e Corrigida (ARC)", yv: 212 },
    naa: { nome: "Nova Almeida Atualizada (NAA)", yv: 1840 },
    nvi: { nome: "Nova Versão Internacional (NVI)", yv: 129 },
    nvt: { nome: "Nova Versão Transformadora (NVT)", yv: 1930 },
    ntlh: { nome: "Nova Tradução na Linguagem de Hoje (NTLH)", yv: 211 },
    acf: { nome: "Almeida Corrigida Fiel (ACF)", yv: null } // só no Bíblia Online
  };

  var DESTINOS = {
    youversion: { nome: "YouVersion (app ou site)", versoes: ["a21", "ara", "arc", "naa", "nvi", "nvt", "ntlh"] },
    bibliaonline: { nome: "Bíblia Online (site)", versoes: ["a21", "ara", "arc", "naa", "nvi", "nvt", "ntlh", "acf"] },
    nenhum: { nome: "Não abrir links (só o texto)", versoes: [] }
  };

  var CONFIG_PADRAO = { destino: "youversion", versao: "a21" };

  // [nome, código YouVersion, endereço no Bíblia Online]
  var LIVROS_LISTA = [
    ["Gênesis", "GEN", "gn"], ["Êxodo", "EXO", "ex"], ["Levítico", "LEV", "lv"], ["Números", "NUM", "nm"],
    ["Deuteronômio", "DEU", "dt"], ["Josué", "JOS", "js"], ["Juízes", "JDG", "jz"], ["Rute", "RUT", "rt"],
    ["1 Samuel", "1SA", "1sm"], ["2 Samuel", "2SA", "2sm"], ["1 Reis", "1KI", "1rs"], ["2 Reis", "2KI", "2rs"],
    ["1 Crônicas", "1CH", "1cr"], ["2 Crônicas", "2CH", "2cr"], ["Esdras", "EZR", "ed"], ["Neemias", "NEH", "ne"],
    ["Ester", "EST", "et"], ["Jó", "JOB", "jó"], ["Salmo", "PSA", "sl"], ["Salmos", "PSA", "sl"],
    ["Provérbios", "PRO", "pv"], ["Eclesiastes", "ECC", "ec"], ["Cantares", "SNG", "ct"], ["Isaías", "ISA", "is"],
    ["Jeremias", "JER", "jr"], ["Lamentações", "LAM", "lm"], ["Ezequiel", "EZK", "ez"], ["Daniel", "DAN", "dn"],
    ["Oseias", "HOS", "os"], ["Joel", "JOL", "jl"], ["Amós", "AMO", "am"], ["Obadias", "OBA", "ob"],
    ["Jonas", "JON", "jn"], ["Miqueias", "MIC", "mq"], ["Naum", "NAM", "na"], ["Habacuque", "HAB", "hc"],
    ["Sofonias", "ZEP", "sf"], ["Ageu", "HAG", "ag"], ["Zacarias", "ZEC", "zc"], ["Malaquias", "MAL", "ml"],
    ["Mateus", "MAT", "mt"], ["Marcos", "MRK", "mc"], ["Lucas", "LUK", "lc"], ["João", "JHN", "jo"],
    ["Atos", "ACT", "atos"], ["Romanos", "ROM", "rm"], ["1 Coríntios", "1CO", "1co"], ["2 Coríntios", "2CO", "2co"],
    ["Gálatas", "GAL", "gl"], ["Efésios", "EPH", "ef"], ["Filipenses", "PHP", "fp"], ["Colossenses", "COL", "cl"],
    ["1 Tessalonicenses", "1TH", "1ts"], ["2 Tessalonicenses", "2TH", "2ts"], ["1 Timóteo", "1TI", "1tm"],
    ["2 Timóteo", "2TI", "2tm"], ["Tito", "TIT", "tt"], ["Filemom", "PHM", "fm"], ["Hebreus", "HEB", "hb"],
    ["Tiago", "JAS", "tg"], ["1 Pedro", "1PE", "1pe"], ["2 Pedro", "2PE", "2pe"], ["1 João", "1JN", "1jo"],
    ["2 João", "2JN", "2jo"], ["3 João", "3JN", "3jo"], ["Judas", "JUD", "jd"], ["Apocalipse", "REV", "ap"]
  ];

  function semAcentos(s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }

  var LIVROS = {};
  LIVROS_LISTA.forEach(function (l) { LIVROS[semAcentos(l[0])] = l; });
  LIVROS["oseas"] = LIVROS["oseias"];
  LIVROS["miquéias"] = LIVROS["miqueias"];
  LIVROS["cantico dos canticos"] = LIVROS["cantares"];

  // Configuração válida (corrige valores antigos ou inexistentes).
  function config() {
    var c = store.config || {};
    var destino = DESTINOS[c.destino] ? c.destino : CONFIG_PADRAO.destino;
    var versao = DESTINOS[destino].versoes.indexOf(c.versao) !== -1 ? c.versao : CONFIG_PADRAO.versao;
    return { destino: destino, versao: versao };
  }

  function urlLeitura(livro, cap) {
    var c = config();
    var l = LIVROS[semAcentos(livro)];
    if (c.destino === "nenhum" || !l) return null;
    if (c.destino === "bibliaonline") {
      return "https://www.bibliaonline.com.br/" + c.versao + "/" + encodeURIComponent(l[2]) + "/" + cap;
    }
    return "https://www.bible.com/bible/" + VERSOES[c.versao].yv + "/" + l[1] + "." + cap + "." + c.versao.toUpperCase();
  }

  // Referência → HTML com link para o capítulo. "Isaías 9:1–7; 11:1–10" vira dois links (o 2º herda o livro).
  function refHtml(ref) {
    var livro = null;
    var c = config();
    return String(ref).split(";").map(function (parte) {
      var p = parte.trim();
      var m = p.match(/^((?:[1-3]\s)?[A-Za-zÀ-ÿ]+(?:\s[A-Za-zÀ-ÿ]+)*?)\s+(\d+)/);
      var cap;
      if (m && LIVROS[semAcentos(m[1])]) { livro = m[1]; cap = m[2]; }
      else if (livro && /^\d+/.test(p)) { cap = p.match(/^\d+/)[0]; }
      else return esc(p);
      var url = urlLeitura(livro, cap);
      if (!url) return esc(p);
      return '<a class="ref" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" title="' +
        esc("Abrir o capítulo (" + c.versao.toUpperCase() + ", " + (c.destino === "bibliaonline" ? "Bíblia Online" : "YouVersion") + ")") + '">' + esc(p) + "</a>";
    }).join("; ");
  }

  // ------------------------------------------------------------------ utilidades

  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function paraMs(iso) {
    var p = iso.split("-");
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }
  function deMs(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  }
  function somaDias(iso, n) { return deMs(paraMs(iso) + n * 86400000); }
  function difDias(a, b) { return Math.round((paraMs(b) - paraMs(a)) / 86400000); }
  function diaDaSemana(iso) { return DIA_POR_WEEKDAY[new Date(paraMs(iso)).getUTCDay()]; }
  function dentroDoCiclo(iso) { return iso >= CICLO_INI && iso <= CICLO_FIM; }
  function limitar(iso) { return iso < CICLO_INI ? CICLO_INI : iso > CICLO_FIM ? CICLO_FIM : iso; }

  function hojeReal() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function dataExtenso(iso) {
    var p = iso.split("-");
    return NOMES_DIAS[diaDaSemana(iso)] + ", " + +p[2] + " de " + MESES[+p[1] - 1] + " de " + p[0];
  }
  // "29 de novembro de 2026" (o dia da semana já aparece na faixa de ícones)
  function dataLonga(iso) {
    var p = iso.split("-");
    return (+p[2] === 1 ? "1º" : +p[2]) + " de " + MESES[+p[1] - 1] + " de " + p[0];
  }
  function curta(iso) { var p = iso.split("-"); return +p[2] + " " + MESES_ABREV[+p[1] - 1]; }
  function intervalo(a, b) {
    var pa = a.split("-"), pb = b.split("-");
    return pa[1] === pb[1] ? +pa[2] + " – " + +pb[2] + " " + MESES_ABREV[+pb[1] - 1] : curta(a) + " – " + curta(b);
  }

  function frase(t) {
    t = String(t || "").trim();
    if (!t) return "";
    t = t.charAt(0).toUpperCase() + t.slice(1);
    return /[.!?…]$/.test(t) ? t : t + ".";
  }

  // "Senhor" em versaletes (nome de Deus), exceto em "nosso Senhor".
  function texto(t) {
    return esc(t).replace(/Senhor/g, function (m, off, s) {
      return s.slice(Math.max(0, off - 6), off) === "nosso " ? m : '<span class="vs">Senhor</span>';
    });
  }

  // ------------------------------------------------------------------ armazenamento

  var store = { lidos: {}, tema: null, config: {} };
  var memoria = false;

  function carregar() {
    try {
      var bruto = localStorage.getItem(STORE_KEY);
      if (bruto) {
        var d = JSON.parse(bruto);
        if (d && typeof d === "object") {
          store.lidos = d.lidos && typeof d.lidos === "object" ? d.lidos : {};
          store.tema = d.tema === "claro" || d.tema === "escuro" ? d.tema : null;
          store.config = d.config && typeof d.config === "object" ? d.config : {};
        }
      }
    } catch (e) { memoria = true; }
  }
  function salvar() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { memoria = true; }
  }

  function marcado(iso, idx) { return (store.lidos[iso] || []).indexOf(idx) !== -1; }
  function alternar(iso, idx) {
    var lista = (store.lidos[iso] || []).slice();
    var i = lista.indexOf(idx);
    if (i === -1) lista.push(idx); else lista.splice(i, 1);
    lista.sort(function (a, b) { return a - b; });
    if (lista.length) store.lidos[iso] = lista; else delete store.lidos[iso];
    salvar();
  }
  function definirDia(iso, total, valor) {
    if (valor) {
      var todos = [];
      for (var i = 0; i < total; i++) todos.push(i);
      store.lidos[iso] = todos;
    } else {
      delete store.lidos[iso];
    }
    salvar();
  }

  // ------------------------------------------------------------------ dados

  var lit = null;
  var plano = null;
  var porData = {};

  function lerEmbutido(id) {
    var el = document.getElementById(id);
    try { return el ? JSON.parse(el.textContent) : null; } catch (e) { return null; }
  }

  function carregarDados() {
    lit = lerEmbutido("dados-liturgias");
    plano = lerEmbutido("dados-plano");
    if (lit && plano) return Promise.resolve();
    return Promise.all([
      fetch("./data/liturgias_semana.json").then(function (r) { return r.json(); }),
      fetch("./data/plano_leitura.json").then(function (r) { return r.json(); })
    ]).then(function (r) { lit = r[0]; plano = r[1]; });
  }

  function indexar() {
    porData = {};
    plano.entradas.forEach(function (e) { porData[e.data_iso] = e; });
  }

  function itensDoDia(e) {
    var itens = [];
    (e.leituras_detalhe || []).forEach(function (l) {
      var icone, rotulo;
      if (l.tipo === "antigo_testamento") { icone = "at"; rotulo = "Leitura do A.T."; }
      else if (l.tipo === "epistola") { icone = "nt"; rotulo = "Epístola"; }
      else if (l.tipo === "evangelho") { icone = "nt"; rotulo = "Evangelho"; }
      else {
        icone = ["quinta", "sabado", "terca", "quarta"].indexOf(e.dia_semana) !== -1 ? "at" : "nt";
        rotulo = icone === "at" ? "Leitura do A.T." : "Leitura do N.T.";
      }
      itens.push({ icone: icone, rotulo: rotulo, ref: l.referencia });
    });
    if (e.salmo) itens.push({ icone: "sl", rotulo: "Salmo", ref: e.salmo });
    return itens;
  }

  function diaFeito(iso) {
    var e = porData[iso];
    if (!e) return false;
    var n = itensDoDia(e).length;
    var lista = store.lidos[iso] || [];
    return n > 0 && lista.length >= n;
  }

  function inicioDaSemana(iso) { return somaDias(CICLO_INI, Math.floor(difDias(CICLO_INI, iso) / 7) * 7); }

  // ------------------------------------------------------------------ peças de HTML

  function checkHtml(iso, idx, rotulo, ref) {
    var pr = marcado(iso, idx);
    return '<button type="button" class="check" data-act="toggle" data-check data-iso="' + iso + '" data-idx="' + idx +
      '" data-nome="' + esc(rotulo + " " + ref) + '" aria-pressed="' + pr + '" aria-label="' +
      esc((pr ? "Desmarcar: " : "Marcar como lido: ") + rotulo + " " + ref) + '"><span class="check__quadro">' + MARCA + "</span></button>";
  }

  function itemHtml(iso, it, idx, compacto) {
    return '<div class="item' + (compacto ? " item--compacto" : "") + '">' +
      '<span class="item__icone">' + ICONES[it.icone] + "</span>" +
      '<span class="item__texto"><span class="item__rotulo">' + esc(it.rotulo) + '</span> <span class="item__ref">' + refHtml(it.ref) + "</span></span>" +
      checkHtml(iso, idx, it.rotulo, it.ref) + "</div>";
  }

  function corpoLinha(l) {
    if (l.segmentos) {
      return l.segmentos.map(function (s) {
        return s.comunidade ? "<b>" + texto(s.texto) + "</b>" : texto(s.texto);
      }).join(" ");
    }
    return texto(l.texto);
  }

  function linhasHtml(linhas, paragrafo) {
    return linhas.map(function (l, i) {
      var prox = linhas[i + 1];
      var cls = "linha";
      if (paragrafo || l.segmentos) cls += " linha--paragrafo";
      else {
        if (l.comunidade) cls += " linha--comunidade";
        if (l.ref || !prox || (l.comunidade && !prox.comunidade)) cls += " linha--fim";
      }
      return '<div class="' + cls + '"><p class="linha__texto">' + corpoLinha(l) + "</p>" +
        (l.ref ? '<span class="linha__ref">' + refHtml(l.ref) + "</span>" : "") + "</div>";
    }).join("");
  }

  function rotuloSecao(titulo) {
    return '<div class="secao__rotulo"><h2 class="secao__titulo">' + esc(titulo) + "</h2></div>";
  }

  function leituraHtml(iso, e, diaObj) {
    var meta = (diaObj.secoes_meta || {}).silencio_reflexao || {};
    var nota = frase((meta.notas || [])[0]) || "Um tempo de silêncio diante da Palavra lida.";
    var itens = itensDoDia(e).map(function (it, i) { return itemHtml(iso, it, i, false); }).join("");
    return '<section class="leitura"><div class="leitura__lecionario">' + rotuloSecao("Leitura · Lecionário") +
      '<div class="itens">' + itens + "</div></div>" +
      '<div class="leitura__silencio">' + rotuloSecao("Silêncio e reflexão") + "<p>" + esc(nota) + "</p></div></section>";
  }

  function secaoHtml(chave, linhas, meta, iso, e, diaObj) {
    if (SECOES_OMITIDAS[chave]) return "";
    if (chave === "leitura") return leituraHtml(iso, e, diaObj);

    var titulo = TITULOS_SECAO[chave] || (meta && meta.titulo) || chave;
    var corpo = "";
    var fonte = "";

    if (chave === "benedictus" && lit.benedictus) {
      corpo = linhasHtml(lit.benedictus.linhas || [], false);
      if (lit.benedictus.fonte) fonte = '<p class="fonte">' + esc(lit.benedictus.fonte) + "</p>";
    } else {
      corpo = linhasHtml(linhas || [], !!SECOES_PARAGRAFO[chave]);
    }

    var notas = "";
    if (chave === "cantico_louvor") {
      notas = '<p class="nota">Use o cântico ou salmo de louvor de sua escolha.</p>';
    } else {
      notas = ((meta && meta.notas) || [])
        .filter(function (n) { return !/^tabelas de leitura|^texto na seção final/i.test(n); })
        .map(function (n) { return '<p class="nota">' + esc(frase(n)) + "</p>"; }).join("");
    }

    if (!corpo && !notas) return "";
    return '<section class="secao">' + rotuloSecao(titulo) + notas + corpo + fonte + "</section>";
  }

  function caixasHtml(iso) {
    var ini = inicioDaSemana(iso);
    var html = "";
    for (var i = 0; i < 7; i++) {
      var d = somaDias(ini, i);
      if (!dentroDoCiclo(d)) continue;
      var chave = diaDaSemana(d);
      html += '<a class="caixa' + (d === iso ? " caixa--atual" : "") + (diaFeito(d) ? " caixa--feito" : "") +
        '" data-iso="' + d + '" href="#/dia/' + d + '" aria-label="' + esc(NOMES_DIAS[chave] + ", " + TEMAS[chave] + ", " + dataLonga(d)) + '"' +
        (d === iso ? ' aria-current="date"' : "") + ">" +
        '<span class="caixa__sigla">' + SIGLAS[chave] + '</span><span class="caixa__disco">' + ICONES_TEMA[chave] + "</span></a>";
    }
    return html;
  }

  function semanaHtml(iso, e) {
    var ini = inicioDaSemana(iso);
    var fim = somaDias(ini, 6);
    var dias = "";
    for (var i = 0; i < 7; i++) {
      var d = somaDias(ini, i);
      var en = porData[d];
      if (!en) continue;
      var nome = NOMES_DIAS[en.dia_semana] + (en.titulo_liturgico ? " · " + en.titulo_liturgico : "");
      dias += '<div class="dia"><a class="banda' + (d === iso ? " banda--atual" : "") + '" href="#/dia/' + d + '">' +
        "<span>" + esc(nome) + '</span><span class="banda__data">' + esc(en.data) + "</span></a>" +
        itensDoDia(en).map(function (it, k) { return itemHtml(d, it, k, true); }).join("") + "</div>";
    }
    // No celular fica recolhido (abre ao tocar); no desktop é sempre aberto (ver ajustarSemana).
    return '<details class="semana-det" id="semana-det"><summary class="semana__cabecalho">' +
      '<h2 class="titulo-livro">Lecionário</h2>' +
      '<span class="semana__lado"><span class="semana__intervalo">' + esc(curta(ini) + " a " + curta(fim > CICLO_FIM ? CICLO_FIM : fim)) +
      '</span><span class="semana__seta" aria-hidden="true"></span></span></summary>' +
      '<p class="semana__sub">' + esc(e.estacao || "") + " · a semana de quinta a quarta</p>" + dias +
      '<p class="semana__frase" id="frase-semana"></p></details>';
  }

  var mqLargo = window.matchMedia ? window.matchMedia("(min-width: 1000px)") : { matches: true };

  function ajustarSemana() {
    var det = document.getElementById("semana-det");
    if (!det) return;
    det.open = mqLargo.matches;
    det.addEventListener("toggle", function () {
      if (mqLargo.matches && !det.open) det.open = true; // no desktop não recolhe
    });
  }

  if (mqLargo.addEventListener) {
    mqLargo.addEventListener("change", function () {
      var det = document.getElementById("semana-det");
      if (det && mqLargo.matches) det.open = true;
    });
  }

  // ------------------------------------------------------------------ telas

  var app = document.getElementById("app");

  function definirEstacao(e) {
    document.documentElement.setAttribute("data-estacao", (e && e.estacao_css) || "advento");
    corDaBarraDoSistema();
  }

  // Cor da barra de status do celular = tinta do papel da estação.
  function corDaBarraDoSistema() {
    var meta = document.querySelector('meta[name="theme-color"]');
    var v = getComputedStyle(document.documentElement).getPropertyValue("--tint").trim();
    if (meta && v) meta.setAttribute("content", v);
  }

  // Barra do ano: uma faixa por estação (consecutivas, pela cor); a de hoje desce até o cabeçalho.
  var segmentosAno = null;

  function segmentosDoAno() {
    if (segmentosAno) return segmentosAno;
    segmentosAno = [];
    plano.entradas.forEach(function (e) {
      var ult = segmentosAno[segmentosAno.length - 1];
      if (ult && ult.css === e.estacao_css) {
        ult.dias++;
        ult.fim = e.data_iso;
        if (ult.nomes.indexOf(e.estacao) === -1) ult.nomes.push(e.estacao);
      } else {
        segmentosAno.push({ css: e.estacao_css, dias: 1, ini: e.data_iso, fim: e.data_iso, nomes: [e.estacao] });
      }
    });
    return segmentosAno;
  }

  function barraAno(iso) {
    var el = document.getElementById("barra-ano");
    if (!el) return;
    var atualNome = "";
    el.innerHTML = segmentosDoAno().map(function (s) {
      var atual = iso >= s.ini && iso <= s.fim;
      if (atual) atualNome = s.nomes.join(" · ");
      return '<span class="ano__seg ano__seg--' + esc(s.css) + (atual ? " ano__seg--atual" : "") +
        '" style="flex:' + s.dias + ' 1 0" title="' + esc(s.nomes.join(" · ")) + '"></span>';
    }).join("");
    el.setAttribute("aria-label", "Dia " + (difDias(CICLO_INI, iso) + 1) + " de 364 · " + atualNome);
  }

  // Cabeçalho em cor: linha da estação, título e, no dia, os quadradinhos da semana e a data.
  function cabeca(tipo, iso, e) {
    var el = document.getElementById("cabeca-conteudo");
    if (!el) return;
    var ref = e || porData[limitar(hojeReal())];
    var linha = '<div class="cabeca__linha"><span>Ano I · ' + esc(ref.estacao || "") + "</span></div>";
    var html;
    if (tipo === "dia") {
      // Topo mínimo: faixa de ícones (tema de cada dia, navegação), data que abre o calendário
      // e, embaixo, "TEMA · ANO I · ESTAÇÃO" (no domingo, o título do domingo no lugar da estação).
      var local = e.titulo_liturgico || e.estacao || "";
      html = '<div class="cabeca__centro">' +
        '<div class="caixas" role="group" aria-label="Dias da semana e seus temas">' + caixasHtml(iso) + "</div>" +
        '<div class="cabeca__data">' +
        '<label class="sr-only" for="data-dia">Ir para a data</label>' +
        '<input class="sr-only" id="data-dia" type="date" value="' + iso + '" min="' + CICLO_INI + '" max="' + CICLO_FIM + '" tabindex="-1" />' +
        '<button type="button" class="data-botao" data-act="abrir-data" aria-label="Escolher outra data. Data atual: ' + esc(dataLonga(iso)) + '">' +
        '<span class="data-botao__texto">' + esc(dataLonga(iso)) + ICONE_CHEVRON + "</span>" +
        '<span class="data-botao__linha">' + esc(TEMAS[e.dia_semana]) + " · Ano I · " + esc(local) + "</span></button></div></div>";
    } else if (tipo === "caderneta") {
      html = linha + '<h1 class="titulo-livro">Caderneta</h1><p class="cabeca__sub">Os dias em que você esteve com a Palavra.</p>';
    } else {
      html = linha + '<h1 class="titulo-livro">Ajustes</h1><p class="cabeca__sub">Do seu jeito, no seu ritmo.</p>';
    }
    el.innerHTML = html;
  }

  function telaDia(iso) {
    var e = porData[iso];
    var diaObj = lit.semana_liturgica[e.dia_semana];
    definirEstacao(e);
    document.title = e.data + " · " + NOMES_DIAS[e.dia_semana] + " · Kalendar Devocional";

    var secoes = "";
    if (diaObj) {
      var meta = diaObj.secoes_meta || {};
      Object.keys(diaObj.secoes).forEach(function (chave) {
        secoes += secaoHtml(chave, diaObj.secoes[chave], meta[chave], iso, e, diaObj);
      });
    } else {
      secoes = '<p class="nota">O ofício deste dia não consta em data/liturgias_semana.json.</p>';
    }

    barraAno(iso);
    cabeca("dia", iso, e);
    app.innerHTML =
      '<div class="livro">' +
      '<article class="pagina pagina--oficio">' +
      secoes +
      '<div class="fecho"><p>Marque quando quiser. Sem pressa.</p>' +
      '<button type="button" class="botao-solido" id="btn-dia" data-act="toggle-dia" data-iso="' + iso + '"></button></div>' +
      "</article>" +
      '<aside class="pagina pagina--semana" aria-label="Lecionário da semana">' + semanaHtml(iso, e) + "</aside>" +
      "</div>";

    window.scrollTo(0, 0);
    ajustarSemana();
    atualizarMarcas();
  }

  function telaCaderneta() {
    definirEstacao(porData[limitar(hojeReal())]);
    document.title = "Caderneta · Kalendar Devocional";
    var hoje = hojeReal();
    var semanas = "";
    for (var w = 0; w < 52; w++) {
      var ini = somaDias(CICLO_INI, w * 7);
      var fim = somaDias(ini, 6);
      var e0 = porData[ini];
      var e1 = porData[fim];
      var est = e0 && e1 && e0.estacao !== e1.estacao ? e0.estacao + " · " + e1.estacao : (e0 && e0.estacao) || "";
      var dias = "";
      for (var i = 0; i < 7; i++) {
        var d = somaDias(ini, i);
        var cls = "cad-dia" + (d > hoje ? " cad-dia--futuro" : "") + (d === hoje ? " cad-dia--hoje" : "") + (diaFeito(d) ? " cad-dia--feito" : "");
        dias += '<a class="' + cls + '" data-iso="' + d + '" href="#/dia/' + d + '" aria-label="' + esc(dataExtenso(d)) + '">' +
          "<span>" + +d.slice(8) + '</span><span class="cad-dia__quadro">' + MARCA + "</span></a>";
      }
      semanas += '<div class="cad-semana"><div class="cad-semana__titulo"><span>' + esc(intervalo(ini, fim)) + "</span><i>" + esc(est) +
        '</i></div><div class="cad-dias">' + dias + "</div></div>";
    }

    var cab = ORDEM_SEMANA.map(function (k) { return "<span>" + SIGLAS[k] + "</span>"; }).join("");
    barraAno(limitar(hoje));
    cabeca("caderneta");
    app.innerHTML =
      '<div class="caderneta"><article class="pagina caderneta__pagina">' +
      '<div class="cad-cabecalho" aria-hidden="true">' + cab + "</div>" + semanas +
      '<div class="cad-resumo"><p id="cad-resumo-1"></p><p>Os outros dias continuam abertos para você, quando quiser voltar a eles.</p></div>' +
      '<div class="cad-acoes">' +
      '<a class="botao-contorno" id="btn-continuar" href="#/">Continuar de onde parei</a>' +
      "</div></article></div>";
    window.scrollTo(0, 0);
    atualizarMarcas();
  }

  function opcoesVersao(destino, atual) {
    return DESTINOS[destino].versoes.map(function (k) {
      return '<option value="' + k + '"' + (k === atual ? " selected" : "") + ">" + esc(VERSOES[k].nome) + "</option>";
    }).join("");
  }

  function telaAjustes() {
    definirEstacao(porData[limitar(hojeReal())]);
    document.title = "Ajustes · Kalendar Devocional";
    var c = config();
    var destinos = Object.keys(DESTINOS).map(function (k) {
      return '<label class="opcao"><input type="radio" name="destino" value="' + k + '"' + (c.destino === k ? " checked" : "") +
        "><span>" + esc(DESTINOS[k].nome) + "</span></label>";
    }).join("");
    var tema = store.tema || "auto";
    var temas = [["auto", "Automático (como o aparelho)"], ["claro", "Claro"], ["escuro", "Escuro"]].map(function (t) {
      return '<option value="' + t[0] + '"' + (tema === t[0] ? " selected" : "") + ">" + t[1] + "</option>";
    }).join("");

    barraAno(limitar(hojeReal()));
    cabeca("ajustes");
    app.innerHTML =
      '<div class="caderneta"><article class="pagina caderneta__pagina">' +

      '<section class="ajuste" aria-labelledby="aj-links">' +
      '<div class="secao__rotulo"><h2 class="secao__titulo" id="aj-links">Abrir as leituras em</h2></div>' +
      '<div class="opcoes" role="radiogroup" aria-labelledby="aj-links">' + destinos + "</div>" +
      '<label class="ajuste__rotulo" for="sel-versao">Versão da Bíblia</label>' +
      '<select class="ajuste__campo" id="sel-versao"' + (c.destino === "nenhum" ? " disabled" : "") + ">" + opcoesVersao(c.destino === "nenhum" ? "youversion" : c.destino, c.versao) + "</select>" +
      '<p class="nota">Ao tocar numa referência (por exemplo, Mateus 11:2–10), abre o capítulo em outra aba. ' +
      "Com o app do YouVersion instalado, o celular costuma abri-lo direto.</p>" +
      "</section>" +

      '<section class="ajuste" aria-labelledby="aj-tema">' +
      '<div class="secao__rotulo"><h2 class="secao__titulo" id="aj-tema">Aparência</h2></div>' +
      '<label class="ajuste__rotulo" for="sel-tema">Tema</label>' +
      '<select class="ajuste__campo" id="sel-tema">' + temas + "</select>" +
      "</section>" +

      '<section class="ajuste" aria-labelledby="aj-marcas">' +
      '<div class="secao__rotulo"><h2 class="secao__titulo" id="aj-marcas">Suas marcações</h2></div>' +
      '<p class="nota">Ficam guardadas só neste aparelho. Para levar do computador ao celular, exporte aqui e importe no outro.</p>' +
      '<div class="cad-acoes">' +
      '<button type="button" class="botao-contorno" data-act="exportar">Exportar marcações</button>' +
      '<label class="botao-contorno" for="arq-importar" style="cursor:pointer">Importar marcações</label>' +
      '<input type="file" id="arq-importar" accept="application/json,.json" class="sr-only" />' +
      '<button type="button" class="botao-texto botao-texto--suave" data-act="limpar">Limpar marcações deste aparelho</button>' +
      "</div></section>" +
      "</article></div>";
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------ atualização das marcas

  function diasComPalavra() {
    return plano.entradas.filter(function (e) { return diaFeito(e.data_iso); }).length;
  }

  function ondeParei() {
    var ultimo = null;
    Object.keys(store.lidos).forEach(function (iso) { if (store.lidos[iso].length && (!ultimo || iso > ultimo)) ultimo = iso; });
    if (!ultimo) return limitar(hojeReal());
    return diaFeito(ultimo) && ultimo < CICLO_FIM ? somaDias(ultimo, 1) : ultimo;
  }

  function atualizarMarcas() {
    document.querySelectorAll("[data-check]").forEach(function (b) {
      var pr = marcado(b.getAttribute("data-iso"), +b.getAttribute("data-idx"));
      b.setAttribute("aria-pressed", String(pr));
      b.setAttribute("aria-label", (pr ? "Desmarcar: " : "Marcar como lido: ") + b.getAttribute("data-nome"));
    });
    document.querySelectorAll(".caixa[data-iso]").forEach(function (a) {
      a.classList.toggle("caixa--feito", diaFeito(a.getAttribute("data-iso")));
    });
    document.querySelectorAll(".cad-dia[data-iso]").forEach(function (a) {
      a.classList.toggle("cad-dia--feito", diaFeito(a.getAttribute("data-iso")));
    });

    var btn = document.getElementById("btn-dia");
    if (btn) btn.textContent = diaFeito(btn.getAttribute("data-iso")) ? "Desmarcar o dia" : "Marcar o dia como lido";

    var fr = document.getElementById("frase-semana");
    if (fr) {
      var ini = inicioDaSemana(rotaAtual().iso);
      var n = 0;
      for (var i = 0; i < 7; i++) if (diaFeito(somaDias(ini, i))) n++;
      fr.textContent = n === 0 ? "Quando quiser, é só começar." :
        "Nesta semana você esteve com a Palavra em " + n + (n === 1 ? " dia." : " dias.");
    }

    var res = document.getElementById("cad-resumo-1");
    if (res) {
      var t = diasComPalavra();
      res.innerHTML = t === 0 ? "Sua caderneta começa aqui." :
        "Até aqui, <b>" + t + (t === 1 ? " dia</b> com a Palavra." : " dias</b> com a Palavra.");
    }
    var cont = document.getElementById("btn-continuar");
    if (cont) cont.setAttribute("href", "#/dia/" + ondeParei());
  }

  // ------------------------------------------------------------------ rotas

  function rotaAtual() {
    var h = location.hash || "#/";
    if (h.indexOf("#/caderneta") === 0) return { tela: "caderneta" };
    if (h.indexOf("#/ajustes") === 0) return { tela: "ajustes" };
    var m = h.match(/^#\/dia\/(\d{4}-\d{2}-\d{2})$/);
    var iso = limitar(m ? m[1] : hojeReal());
    return { tela: "dia", iso: iso };
  }

  function renderizar() {
    var r = rotaAtual();
    if (r.tela === "caderneta") telaCaderneta();
    else if (r.tela === "ajustes") telaAjustes();
    else telaDia(r.iso);

    // Ícone da tela atual fica em branco pleno
    document.querySelectorAll(".topo__nav .botao-icone").forEach(function (a) {
      var alvo = a.getAttribute("href") === "#/" + r.tela;
      if (alvo) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

  function irPara(iso) { location.hash = "#/dia/" + limitar(iso); }

  // ------------------------------------------------------------------ interações

  function aviso(msg) {
    var el = document.createElement("div");
    el.className = "aviso";
    el.setAttribute("role", "status");
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }

  function aplicarTema(t) {
    document.documentElement.setAttribute("data-theme", t === "escuro" ? "dark" : "light");
    var b = document.getElementById("btn-tema");
    if (b) {
      // Mostra o ícone do tema para o qual o botão leva: sol no escuro, lua no claro.
      var nome = t === "escuro" ? "Tema claro" : "Tema escuro";
      b.setAttribute("aria-label", nome);
      b.setAttribute("title", nome);
      b.innerHTML = t === "escuro" ? ICONE_SOL : ICONE_LUA;
    }
    corDaBarraDoSistema();
  }
  function temaAtual() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "escuro" : "claro";
  }

  function exportar() {
    var dados = JSON.stringify({ app: "kalendar-devocional", versao: 1, exportadoEm: new Date().toISOString(), lidos: store.lidos }, null, 2);
    var url = URL.createObjectURL(new Blob([dados], { type: "application/json" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = "kalendar-marcacoes.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    aviso("Marcações exportadas.");
  }

  function importar(arquivo) {
    var leitor = new FileReader();
    leitor.onload = function () {
      try {
        var d = JSON.parse(leitor.result);
        if (!d || typeof d.lidos !== "object") throw new Error("formato");
        var n = 0;
        Object.keys(d.lidos).forEach(function (iso) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Array.isArray(d.lidos[iso])) return;
          var atual = store.lidos[iso] || [];
          var uniao = atual.concat(d.lidos[iso].filter(function (x) { return Number.isInteger(x) && x >= 0 && x < 20; }));
          uniao = uniao.filter(function (x, i) { return uniao.indexOf(x) === i; }).sort(function (a, b) { return a - b; });
          if (uniao.length) { store.lidos[iso] = uniao; n++; }
        });
        salvar();
        atualizarMarcas();
        aviso("Marcações importadas (" + n + " dias).");
      } catch (e) {
        aviso("Não consegui ler esse arquivo.");
      }
    };
    leitor.readAsText(arquivo);
  }

  document.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-act], #btn-tema");
    if (!el) return;
    if (el.id === "btn-tema") {
      var novo = temaAtual() === "escuro" ? "claro" : "escuro";
      store.tema = novo;
      salvar();
      aplicarTema(novo);
      return;
    }
    var acao = el.getAttribute("data-act");
    if (acao === "toggle") {
      alternar(el.getAttribute("data-iso"), +el.getAttribute("data-idx"));
      atualizarMarcas();
    } else if (acao === "toggle-dia") {
      var iso = el.getAttribute("data-iso");
      definirDia(iso, itensDoDia(porData[iso]).length, !diaFeito(iso));
      atualizarMarcas();
    } else if (acao === "abrir-data") {
      var campo = document.getElementById("data-dia");
      if (campo) {
        try { campo.showPicker(); } catch (_) { campo.focus(); campo.click(); }
      }
    } else if (acao === "prev") {
      irPara(somaDias(rotaAtual().iso, -1));
    } else if (acao === "next") {
      irPara(somaDias(rotaAtual().iso, 1));
    } else if (acao === "exportar") {
      exportar();
    } else if (acao === "limpar") {
      if (window.confirm("Apagar todas as marcações guardadas neste aparelho? Isso não pode ser desfeito.")) {
        store.lidos = {};
        salvar();
        atualizarMarcas();
        aviso("Marcações apagadas.");
      }
    }
  });

  document.addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.id === "data-dia" && t.value) irPara(t.value);
    if (t.name === "destino") {
      store.config = { destino: t.value, versao: store.config && store.config.versao };
      store.config.versao = config().versao;
      salvar();
      var sel = document.getElementById("sel-versao");
      if (sel) {
        sel.disabled = t.value === "nenhum";
        sel.innerHTML = opcoesVersao(t.value === "nenhum" ? "youversion" : t.value, store.config.versao);
      }
    }
    if (t.id === "sel-versao") {
      store.config = { destino: config().destino, versao: t.value };
      salvar();
    }
    if (t.id === "sel-tema") {
      store.tema = t.value === "claro" || t.value === "escuro" ? t.value : null;
      salvar();
      aplicarTema(store.tema || (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro"));
    }
    if (t.id === "arq-importar" && t.files && t.files[0]) { importar(t.files[0]); t.value = ""; }
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    var tag = (ev.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    var r = rotaAtual();
    if (r.tela !== "dia") return;
    if (ev.key === "ArrowLeft") irPara(somaDias(r.iso, -1));
    if (ev.key === "ArrowRight") irPara(somaDias(r.iso, 1));
  });

  // Sem setas: arrastar a faixa de ícones para o lado muda de semana (mesmo dia da semana).
  var toque = null;

  document.addEventListener("touchstart", function (ev) {
    var faixa = ev.target.closest && ev.target.closest(".caixas");
    var t = ev.touches[0];
    toque = faixa && t ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });

  document.addEventListener("touchend", function (ev) {
    if (!toque) return;
    var t = ev.changedTouches[0];
    var dx = t.clientX - toque.x;
    var dy = t.clientY - toque.y;
    toque = null;
    var r = rotaAtual();
    if (r.tela !== "dia" || Math.abs(dx) < 50 || Math.abs(dy) > 40) return;
    irPara(somaDias(r.iso, dx < 0 ? 7 : -7));
  }, { passive: true });

  window.addEventListener("hashchange", renderizar);

  // ------------------------------------------------------------------ início

  carregar();
  aplicarTema(store.tema || temaAtual());

  carregarDados()
    .then(function () {
      indexar();
      renderizar();
      if (memoria) aviso("Não foi possível guardar as marcações neste navegador.");
    })
    .catch(function (err) {
      app.innerHTML = '<div class="livro"><article class="pagina"><p class="nota">Não foi possível carregar os dados (' + esc(err.message) +
        "). Rode <code>python scripts/parse_kalendar.py</code> para embuti-los no index.html.</p></article></div>";
    });

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    // Se uma versão nova do app assumir o controle, recarrega uma vez para não ficar com arquivos misturados.
    var tinhaControle = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (tinhaControle) location.reload();
    });
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () { /* sem offline, tudo bem */ });
    });
  }
})();
