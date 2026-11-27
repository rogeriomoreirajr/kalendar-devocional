"""Parser do Kalendar 2026–2027 (Ano I · Edição Compacta · DIA) → JSON.

Gera em --out:
  - liturgias_semana.json : ofício diário de cada dia da semana (quinta a quarta)
                            + texto do Benedictus.
  - plano_leitura.json    : tabela de leituras (26/11/2026 a 24/11/2027), com estação
                            litúrgica, título do domingo, leituras e salmo.

Como o PDF é lido
-----------------
O PDF não é texto corrido: a tabela de leituras é em colunas (dia | título | leitura | salmo)
e os ofícios têm margens, notas e referências bíblicas alinhadas à direita. Por isso o
script trabalha com a posição (x, y) e o estilo (negrito) de cada linha, e identifica o
tipo de cada página pelo cabeçalho impresso no topo ("OFÍCIO DIÁRIO", "TABELA DE LEITURAS",
"BENEDICTUS") em vez de procurar palavras-chave no texto (o sumário também as contém).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from datetime import date, timedelta
from pathlib import Path
from typing import Any

try:
    import pymupdf  # PyMuPDF >= 1.24.3
except ImportError:  # pragma: no cover
    import fitz as pymupdf  # type: ignore

REPO_DIR = Path(__file__).resolve().parent.parent

# --------------------------------------------------------------------------------------
# Constantes
# --------------------------------------------------------------------------------------

DIAS_SEMANA_MAP = {
    "QUI": "quinta", "QUINTA": "quinta",
    "SEX": "sexta", "SEXTA": "sexta",
    "SÁB": "sabado", "SAB": "sabado", "SÁBADO": "sabado", "SABADO": "sabado",
    "DOM": "domingo", "DOMINGO": "domingo",
    "SEG": "segunda", "SEGUNDA": "segunda",
    "TER": "terca", "TERÇA": "terca", "TERCA": "terca",
    "QUA": "quarta", "QUARTA": "quarta",
}

ORDEM_SEMANA = ["quinta", "sexta", "sabado", "domingo", "segunda", "terca", "quarta"]

GENEROS_SEMANA = {
    "quinta": "A Torá",
    "sexta": "Evangelhos",
    "sabado": "História de Israel",
    "domingo": "Lecionário",
    "segunda": "Atos e Epístolas",
    "terca": "Os Profetas",
    "quarta": "Literatura Sapiencial",
}

# date.weekday(): segunda=0 ... domingo=6
WEEKDAY_PARA_CHAVE = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"]

# Chave da seção a partir do título impresso (sem acentos, sem espaços, em maiúsculas).
# A ordem importa: vale o primeiro prefixo que casar.
SECOES_PREFIXOS: list[tuple[str, str]] = [
    ("ABERTURA", "abertura"),
    ("INVOCACAO", "invocacao"),
    ("CONFIS", "confissao"),
    ("LEITURA", "leitura"),
    ("SILENCIO", "silencio_reflexao"),
    ("SALMO", "salmo"),
    ("GLORIA", "gloria"),
    ("ACLAMACAO", "aclamacao"),
    ("CANTICO", "cantico_louvor"),
    ("BENEDICTUS", "benedictus"),
    ("ORACAODOSENHOR", "oracao_do_senhor"),
    ("SUPLICA", "suplica"),
    ("ORACOESDOCORACAO", "oracoes_intercessao"),
    ("COLETA", "coleta"),
]

# Estação do Kalendar → valor de data-estacao no CSS
ESTACAO_CSS = {
    "preparacao ao advento": "advento",
    "advento": "advento",
    "natal": "natal",
    "epifania": "natal",
    "pre-quaresma": "tempo-comum",
    "quaresma": "quaresma",
    "semana santa": "quaresma",
    "sexta-feira santa e sabado santo": "quaresma",
    "pascoa": "pascoa",
    "tempo da trindade": "tempo-comum",
    # Edição corrigida do Kalendar: Epifania vai até 9/2, e o tempo depois da Páscoa muda de nome
    "pentecostes": "tempo-comum",
    "tempo do reino": "tempo-comum",
}

RE_DIA_OFICIO = re.compile(
    r"^(QUINTA|SEXTA|SÁBADO|DOMINGO|SEGUNDA|TERÇA|QUARTA)(?:-FEIRA)?\s*•", re.IGNORECASE
)
RE_LINHA_DATA = re.compile(
    r"^(Qui|Sex|Sáb|Sab|Dom|Seg|Ter|Qua)\s+(\d{1,2}/\d{1,2})\b\s*(.*)$", re.IGNORECASE
)
RE_INTERVALO = re.compile(r"\d{1,2}/\d{1,2}/\d{4}\s+a\s+\d{1,2}/\d{1,2}/\d{4}")
RE_SALMO = re.compile(r"^Salmos?\b", re.IGNORECASE)
RE_REFERENCIA_VALIDA = re.compile(r"^(?:[1-3]\s)?[A-Za-zÀ-ÿ]+(?:\s[A-Za-zÀ-ÿ]+)*\s+\d")

TOPO_Y = 35.0      # linhas acima disso são cabeçalho de página
RODAPE_Y = 550.0   # linhas abaixo disso são número de página


# --------------------------------------------------------------------------------------
# Utilitários
# --------------------------------------------------------------------------------------

def sem_acentos(texto: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn"
    )


def normalizar(texto: str) -> str:
    return sem_acentos(texto).lower().strip()


def limpar_espacos(texto: str) -> str:
    return re.sub(r"\s+", " ", texto).strip()


def normalizar_chave_dia(texto: str) -> str | None:
    limpo = limpar_espacos(texto.upper())
    limpo = re.sub(r"-FEIRA$", "", limpo)
    return DIAS_SEMANA_MAP.get(limpo)


def data_para_iso(data_curta: str) -> str | None:
    """'DD/MM' no ciclo 26/11/2026–24/11/2027 → 'YYYY-MM-DD'."""
    m = re.match(r"^(\d{1,2})/(\d{1,2})$", data_curta.strip())
    if not m:
        return None
    dia, mes = int(m.group(1)), int(m.group(2))
    # O ciclo começa em 26/11/2026 e termina em 24/11/2027: novembro é 2026 só a partir do dia 26.
    ano = 2026 if (mes == 12 or (mes == 11 and dia >= 26)) else 2027
    return f"{ano:04d}-{mes:02d}-{dia:02d}"


# --------------------------------------------------------------------------------------
# Extração de linhas com posição e estilo
# --------------------------------------------------------------------------------------

def _span_negrito(span: dict[str, Any]) -> bool:
    fonte = span.get("font", "")
    return "Bold" in fonte or "Black" in fonte or bool(span.get("flags", 0) & 16)


def extrair_paginas(doc: "pymupdf.Document", debug_path: Path | None = None) -> list[dict[str, Any]]:
    """Devolve uma lista de páginas: {num, cabecalho, linhas}.

    Cada linha: texto, x0, x1, y0, bold (maioria dos caracteres em negrito).
    O cabeçalho é a primeira linha no topo da página (y < TOPO_Y), em maiúsculas.
    """
    paginas: list[dict[str, Any]] = []
    debug: list[str] = []

    for num, page in enumerate(doc, start=1):
        linhas: list[dict[str, Any]] = []
        for bloco in page.get_text("dict").get("blocks", []):
            if bloco.get("type") != 0:
                continue
            for linha in bloco.get("lines", []):
                spans = [s for s in linha.get("spans", []) if s.get("text", "").strip()]
                texto = limpar_espacos("".join(s["text"] for s in linha.get("spans", [])))
                if not texto:
                    continue
                total = sum(len(s["text"].strip()) for s in spans) or 1
                negrito = sum(len(s["text"].strip()) for s in spans if _span_negrito(s))

                # Linha com estilos misturados (ex.: "nosso Deus. **Amém.**"): guarda os trechos.
                segmentos: list[dict[str, Any]] = []
                for s in spans:
                    b = _span_negrito(s)
                    if segmentos and segmentos[-1]["bold"] == b:
                        segmentos[-1]["texto"] += s["text"]
                    else:
                        segmentos.append({"texto": s["text"], "bold": b})
                for seg in segmentos:
                    seg["texto"] = limpar_espacos(seg["texto"])
                # pontuação solta ("Amém" + ".") volta para o trecho anterior
                fundidos: list[dict[str, Any]] = []
                for seg in segmentos:
                    if fundidos and not any(c.isalnum() for c in seg["texto"]):
                        fundidos[-1]["texto"] += seg["texto"]
                    else:
                        fundidos.append(seg)
                segmentos = fundidos

                linhas.append(
                    {
                        "texto": texto,
                        "x0": round(linha["bbox"][0], 1),
                        "x1": round(linha["bbox"][2], 1),
                        "y0": round(linha["bbox"][1], 1),
                        "bold": negrito / total > 0.5,
                        "segmentos": segmentos if len(segmentos) > 1 else None,
                    }
                )
        linhas.sort(key=lambda l: (l["y0"], l["x0"]))

        topo = [l for l in linhas if l["y0"] < TOPO_Y]
        cabecalho = topo[0]["texto"] if topo else ""
        paginas.append({"num": num, "cabecalho": cabecalho, "linhas": linhas})

        if debug_path:
            debug.append(f"=== PÁGINA {num} (largura={page.rect.width:.1f}) ===")
            for l in linhas:
                debug.append(
                    f"[x={l['x0']:>5.1f} | y={l['y0']:>5.1f} | bold={int(l['bold'])}] {l['texto']}"
                )

    if debug_path:
        debug_path.write_text("\n".join(debug), encoding="utf-8")
    return paginas


def corpo(pagina: dict[str, Any]) -> list[dict[str, Any]]:
    """Linhas da página sem cabeçalho nem número de página."""
    return [l for l in pagina["linhas"] if TOPO_Y <= l["y0"] <= RODAPE_Y]


def tipo_pagina(pagina: dict[str, Any]) -> str:
    cab = normalizar(pagina["cabecalho"])
    if cab.startswith("oficio diario"):
        return "oficio"
    if cab.startswith("tabela de leituras"):
        return "tabela"
    if cab == "benedictus":
        return "benedictus"
    return "outro"


# --------------------------------------------------------------------------------------
# Ofício diário
# --------------------------------------------------------------------------------------

def chave_secao(titulo: str) -> str:
    base = re.sub(r"[^A-Z]", "", sem_acentos(titulo).upper())
    for prefixo, chave in SECOES_PREFIXOS:
        if base.startswith(prefixo):
            return chave
    return re.sub(r"[^a-z0-9]+", "_", normalizar(titulo)).strip("_")


def corrigir_titulo(titulo: str) -> str:
    """O PDF imprime 'CONFIS SÃO' e 'INTERCES SÃO' com um espaço indevido."""
    return limpar_espacos(re.sub(r"S SÃO\b", "SSÃO", titulo))


def eh_titulo_secao(linha: dict[str, Any], margem: float) -> bool:
    t = linha["texto"]
    return (
        linha["bold"]
        and abs(linha["x0"] - margem) <= 2
        and len(t) <= 60
        and t == t.upper()
        and any(c.isalpha() for c in t)
    )


def classificar_linha_oficio(linha: dict[str, Any], margem: float) -> str:
    if RE_DIA_OFICIO.match(linha["texto"]):
        return "dia"
    if linha["x0"] > margem + 200:
        return "ref"
    if linha["x0"] > margem + 100:
        return "nota"
    if eh_titulo_secao(linha, margem):
        return "titulo"
    return "texto"


def _mesclar(anterior: dict[str, Any], novos: list[dict[str, Any]], hifen: bool) -> None:
    """Junta uma linha de continuação à linha anterior (com ou sem hifenização)."""
    antigos = anterior.get("segmentos") or [
        {"texto": anterior["texto"], "comunidade": anterior["comunidade"]}
    ]
    antigos = [dict(s) for s in antigos]
    novos = [dict(s) for s in novos]
    if hifen:
        antigos[-1]["texto"] = antigos[-1]["texto"][:-1]
        anterior["texto"] = anterior["texto"][:-1] + "".join(s["texto"] for s in novos)
    else:
        novos[0]["texto"] = " " + novos[0]["texto"]
        anterior["texto"] = anterior["texto"] + " " + "".join(s["texto"].strip() for s in novos)
    segs = antigos + novos
    if len({s["comunidade"] for s in segs}) > 1:
        anterior["segmentos"] = segs
    else:
        anterior.pop("segmentos", None)
    anterior["comunidade"] = sum(len(s["texto"]) for s in segs if s["comunidade"]) * 2 > sum(
        len(s["texto"]) for s in segs
    )


def _termina_na_comunidade(item: dict[str, Any]) -> bool:
    segs = item.get("segmentos")
    return bool(segs and segs[-1]["comunidade"])


def juntar_paragrafos(lista: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Confissão e Coleta são texto corrido: o PDF quebra a linha onde cabe, não onde a frase acaba.

    Junta as linhas num parágrafo; um parágrafo termina quando a linha acaba na resposta da
    comunidade (ex.: "… nosso Senhor. **Amém.**") ou quando tem referência bíblica.
    """
    saida: list[dict[str, Any]] = []
    for item in lista:
        if saida and not _termina_na_comunidade(saida[-1]) and not saida[-1].get("ref"):
            novos = item.get("segmentos") or [
                {"texto": item["texto"], "comunidade": item["comunidade"]}
            ]
            _mesclar(saida[-1], novos, hifen=False)
        else:
            saida.append(dict(item))
    return saida


def juntar_continuacoes(linhas: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """No Benedictus, uma linha de resposta que não termina em pontuação continua na seguinte."""
    saida: list[dict[str, Any]] = []
    for item in linhas:
        if (
            saida
            and item["comunidade"]
            and saida[-1]["comunidade"]
            and not re.search(r"[.,;:!?*…]$", saida[-1]["texto"])
        ):
            saida[-1]["texto"] = f"{saida[-1]['texto']} {item['texto']}"
        else:
            saida.append(dict(item))
    return saida


def parse_liturgias_semana(paginas: list[dict[str, Any]]) -> dict[str, Any]:
    dias: dict[str, Any] = {}
    dia_atual: str | None = None
    secao_atual: str | None = None
    avisos: list[str] = []

    for pag in paginas:
        if tipo_pagina(pag) != "oficio":
            continue
        linhas = corpo(pag)
        if not linhas:
            continue
        margem = min(l["x0"] for l in linhas)

        # 1) classifica; 2) junta títulos de seção em duas linhas; 3) associa notas.
        marcadas = [(classificar_linha_oficio(l, margem), l) for l in linhas]

        titulos: list[dict[str, Any]] = []  # {y, texto}
        for tipo, l in marcadas:
            if tipo != "titulo":
                continue
            if titulos and 0 < l["y0"] - titulos[-1]["y_ultima"] < 14:
                titulos[-1]["texto"] += " " + l["texto"]
                titulos[-1]["y_ultima"] = l["y0"]
            else:
                titulos.append({"y": l["y0"], "y_ultima": l["y0"], "texto": l["texto"]})

        def titulo_mais_proximo(y: float) -> dict[str, Any] | None:
            cand = [t for t in titulos if abs(t["y"] - y) <= 25 or abs(t["y_ultima"] - y) <= 25]
            return min(cand, key=lambda t: min(abs(t["y"] - y), abs(t["y_ultima"] - y))) if cand else None

        notas_por_titulo: dict[float, list[str]] = {}
        for tipo, l in marcadas:
            if tipo == "nota":
                alvo = titulo_mais_proximo(l["y0"])
                if alvo:
                    notas_por_titulo.setdefault(alvo["y"], []).append(l["texto"])
                elif dia_atual and secao_atual:
                    dias[dia_atual]["secoes_meta"][secao_atual]["notas"].append(l["texto"])

        # Junta linhas de nota que formam uma frase ("tempo reservado à oração pessoal e" + "comunitária")
        # (já vêm em ordem de y, então basta concatenar com espaço)
        titulos_vistos: set[float] = set()

        for tipo, l in marcadas:
            texto = l["texto"]

            if tipo == "dia":
                m = RE_DIA_OFICIO.match(texto)
                dia_atual = normalizar_chave_dia(m.group(1)) if m else None
                secao_atual = None
                if dia_atual and dia_atual not in dias:
                    dias[dia_atual] = {
                        "dia_semana": dia_atual,
                        "genero": GENEROS_SEMANA.get(dia_atual),
                        "titulo_cabecalho": texto,
                        "pagina_inicio": pag["num"],
                        "secoes": {},
                        "secoes_meta": {},
                    }
                continue

            if not dia_atual:
                continue

            if tipo == "titulo":
                alvo = next(
                    (t for t in titulos if t["y"] <= l["y0"] <= t["y_ultima"]), None
                )
                if alvo is None or alvo["y"] in titulos_vistos:
                    continue  # segunda linha de um título já tratado
                titulos_vistos.add(alvo["y"])
                titulo = corrigir_titulo(alvo["texto"])
                secao_atual = chave_secao(titulo)
                dias[dia_atual]["secoes"].setdefault(secao_atual, [])
                meta = dias[dia_atual]["secoes_meta"].setdefault(
                    secao_atual, {"titulo": titulo, "notas": []}
                )
                nota = " ".join(notas_por_titulo.get(alvo["y"], []))
                if nota:
                    meta["notas"].append(nota)
                continue

            if tipo == "nota" or not secao_atual:
                continue

            lista = dias[dia_atual]["secoes"][secao_atual]

            if tipo == "ref":
                if lista:
                    anterior = lista[-1]
                    anterior["ref"] = (
                        f"{anterior['ref']}; {texto}" if anterior.get("ref") else texto
                    )
                else:
                    avisos.append(f"ref sem linha anterior ({dia_atual}/{secao_atual}): {texto}")
                continue

            # texto do ofício
            segs = [
                {"texto": s["texto"], "comunidade": s["bold"]} for s in (l.get("segmentos") or [])
            ] or [{"texto": texto, "comunidade": l["bold"]}]

            if texto.startswith("⏎"):  # marca de continuação da linha anterior
                texto = texto.lstrip("⏎ ").strip()
                segs[0]["texto"] = segs[0]["texto"].lstrip("⏎ ").strip()
                if lista:
                    _mesclar(lista[-1], segs, hifen=False)
                    continue
            if (
                lista
                and lista[-1]["texto"].endswith("-")
                and lista[-1]["comunidade"] == l["bold"]
                and not lista[-1].get("ref")
                and texto[:1].islower()
            ):
                _mesclar(lista[-1], segs, hifen=True)  # hifenização de fim de linha
                continue
            item = {"texto": texto, "comunidade": l["bold"]}
            if len(segs) > 1:
                item["segmentos"] = segs
            lista.append(item)

    for dia in dias.values():
        for chave in ("confissao", "coleta"):
            if chave in dia["secoes"]:
                dia["secoes"][chave] = juntar_paragrafos(dia["secoes"][chave])

    ordenado = {k: dias[k] for k in ORDEM_SEMANA if k in dias}
    return {"semana_liturgica": ordenado, "_avisos": avisos}


def parse_benedictus(paginas: list[dict[str, Any]]) -> dict[str, Any] | None:
    for pag in paginas:
        if tipo_pagina(pag) != "benedictus":
            continue
        linhas = corpo(pag)
        if not linhas:
            continue
        margem = min(l["x0"] for l in linhas)
        saida: dict[str, Any] = {"pagina": pag["num"], "introducao": None, "linhas": [], "fonte": None}
        for l in linhas:
            t = l["texto"]
            if t == "Benedictus" and l["bold"]:
                continue
            if t.startswith("Cântico de Zacarias"):
                saida["fonte"] = t
            elif saida["introducao"] is None and not l["bold"] and abs(l["x0"] - margem) <= 2:
                saida["introducao"] = t
            else:
                saida["linhas"].append({"texto": t, "comunidade": l["bold"]})
        saida["linhas"] = juntar_continuacoes(saida["linhas"])
        return saida
    return None


# --------------------------------------------------------------------------------------
# Tabela de leituras
# --------------------------------------------------------------------------------------

def agrupar_em_linhas_visuais(linhas: list[dict[str, Any]], tol: float = 3.0) -> list[list[dict[str, Any]]]:
    """Agrupa fragmentos que estão na mesma altura (mesma linha da tabela)."""
    grupos: list[list[dict[str, Any]]] = []
    for l in sorted(linhas, key=lambda l: (l["y0"], l["x0"])):
        if grupos and abs(l["y0"] - grupos[-1][0]["y0"]) <= tol:
            grupos[-1].append(l)
        else:
            grupos.append([l])
    return grupos


def css_da_estacao(nome: str) -> str | None:
    return ESTACAO_CSS.get(normalizar(nome))


def parse_plano_leitura(paginas: list[dict[str, Any]]) -> dict[str, Any]:
    entradas: list[dict[str, Any]] = []
    avisos: list[str] = []
    estacao: dict[str, str | None] = {"nome": None, "periodo": None, "css": None}
    atual: dict[str, Any] | None = None

    for pag in paginas:
        if tipo_pagina(pag) != "tabela":
            continue
        linhas = corpo(pag)

        # A coluna do dia muda de x (40,2 / 51,6) conforme a página; usa as próprias datas como âncora.
        xs_data = [l["x0"] for l in linhas if RE_LINHA_DATA.match(l["texto"])]
        dx = min(xs_data) if xs_data else 40.2

        for grupo in agrupar_em_linhas_visuais(linhas):
            intervalo = next((l for l in grupo if RE_INTERVALO.search(l["texto"])), None)
            if intervalo:
                nome = " ".join(l["texto"] for l in grupo if l is not intervalo and l["x0"] < dx + 20)
                estacao = {
                    "nome": nome,
                    "periodo": RE_INTERVALO.search(intervalo["texto"]).group(0),
                    "css": css_da_estacao(nome),
                }
                atual = None
                continue

            novo = None
            titulo_partes: list[str] = []
            celulas: list[tuple[int, str]] = []  # (coluna, texto)

            for l in grupo:
                t = l["texto"]
                rel = l["x0"] - dx
                m = RE_LINHA_DATA.match(t)
                if m and rel < 30:
                    sigla, data_curta, resto = m.groups()
                    novo = {"sigla": sigla, "data": data_curta}
                    if resto:
                        titulo_partes.append(resto)
                elif rel < 120:
                    titulo_partes.append(t)
                elif rel < 200:
                    celulas.append((2, t))
                else:
                    celulas.append((3, t))

            if novo:
                chave = normalizar_chave_dia(novo["sigla"])
                atual = {
                    "data": novo["data"],
                    "data_iso": data_para_iso(novo["data"]),
                    "dia_semana": chave,
                    "genero": GENEROS_SEMANA.get(chave or ""),
                    "estacao": estacao["nome"],
                    "estacao_css": estacao["css"],
                    "estacao_periodo": estacao["periodo"],
                    "titulo_liturgico": None,
                    "_titulo": [],
                    "_celulas": [],
                    "pagina": pag["num"],
                }
                entradas.append(atual)
            elif atual is None:
                if not entradas:
                    continue  # título/subtítulo da página, antes da primeira estação
                avisos.append(f"p.{pag['num']}: linha sem dia anterior: {[l['texto'] for l in grupo]}")
                continue

            atual["_titulo"].extend(titulo_partes)
            atual["_celulas"].extend(texto for _col, texto in sorted(celulas))

    # Finaliza entradas
    for e in entradas:
        titulo = limpar_espacos(" ".join(e.pop("_titulo")))
        e["titulo_liturgico"] = titulo or None
        celulas = e.pop("_celulas")

        salmos = [c for c in celulas if RE_SALMO.match(c)]
        leituras = [c for c in celulas if not RE_SALMO.match(c)]
        if len(salmos) > 1:
            avisos.append(f"{e['data']}: mais de um salmo {salmos}")

        if e["dia_semana"] == "domingo" and len(leituras) == 3:
            tipos = ["antigo_testamento", "epistola", "evangelho"]
        elif len(leituras) == 1:
            tipos = ["leitura"]
        else:
            tipos = ["leitura"] * len(leituras)
            if e["dia_semana"] == "domingo" or not leituras:
                avisos.append(f"{e['data']} ({e['dia_semana']}): {len(leituras)} leituras {leituras}")
            elif len(leituras) > 1:
                avisos.append(f"{e['data']} ({e['dia_semana']}): {len(leituras)} leituras {leituras}")

        e["leituras"] = leituras
        e["leituras_detalhe"] = [{"tipo": t, "referencia": r} for t, r in zip(tipos, leituras)]
        e["salmo"] = salmos[0] if salmos else None

        for r in leituras + salmos:
            if not RE_REFERENCIA_VALIDA.match(r):
                avisos.append(f"{e['data']}: referência suspeita '{r}'")

        # Pentecostes muda a cor da estação até o fim da Páscoa
        if titulo and "pentecostes" in normalizar(titulo):
            e["estacao_css"] = "pentecostes"
            e["_pent"] = True

    pent = False
    for e in entradas:
        if e.pop("_pent", False):
            pent = True
        elif pent and e["estacao"] and normalizar(e["estacao"]) == "pascoa":
            e["estacao_css"] = "pentecostes"
        else:
            pent = False

    return {
        "periodo": "26/11/2026 a 24/11/2027",
        "ano": "Ano I",
        "total_entradas": len(entradas),
        "entradas": entradas,
        "_avisos": avisos,
    }


def validar_plano(entradas: list[dict[str, Any]]) -> list[str]:
    """Confere: 364 dias seguidos, dia da semana coerente com a data, todos com leitura e salmo."""
    erros: list[str] = []
    esperado = date(2026, 11, 26)
    fim = date(2027, 11, 24)
    total_esperado = (fim - esperado).days + 1
    if len(entradas) != total_esperado:
        erros.append(f"esperadas {total_esperado} entradas, extraídas {len(entradas)}")

    for e in entradas:
        iso = e["data_iso"]
        if iso != esperado.isoformat():
            erros.append(f"sequência quebrada: esperado {esperado.isoformat()}, veio {iso} ({e['data']})")
            try:
                esperado = date.fromisoformat(iso)
            except (TypeError, ValueError):
                pass
        try:
            d = date.fromisoformat(iso)
            if WEEKDAY_PARA_CHAVE[d.weekday()] != e["dia_semana"]:
                erros.append(f"{iso}: dia da semana {e['dia_semana']} não confere com o calendário")
        except (TypeError, ValueError):
            erros.append(f"data inválida: {e['data']}")
        if not e["leituras"]:
            erros.append(f"{e['data']}: sem leitura")
        if not e["salmo"] and e["dia_semana"] != "domingo":
            erros.append(f"{e['data']}: sem salmo")
        esperado += timedelta(days=1)
    return erros


# --------------------------------------------------------------------------------------
# Embutir os JSONs no index.html
# --------------------------------------------------------------------------------------

RE_BLOCO_DADOS = re.compile(r"(<!-- DADOS:INICIO -->).*?(<!-- DADOS:FIM -->)", re.DOTALL)


def _json_para_html(obj: Any) -> str:
    """JSON compacto, seguro para ficar dentro de <script type="application/json">."""
    texto = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return texto.replace("</", "<\\/").replace("<!--", "<\\!--")


def embutir_no_index(index_path: Path, liturgias: dict[str, Any], plano: dict[str, Any]) -> bool:
    """Grava os dois JSONs entre os marcadores DADOS:INICIO/FIM do index.html."""
    html = index_path.read_text(encoding="utf-8")
    if not RE_BLOCO_DADOS.search(html):
        return False
    # função em vez de string: o JSON pode conter barras invertidas
    novo = RE_BLOCO_DADOS.sub(
        lambda m: m.group(1)
        + "\n"
        + f'  <script id="dados-liturgias" type="application/json">{_json_para_html(liturgias)}</script>\n'
        + f'  <script id="dados-plano" type="application/json">{_json_para_html(plano)}</script>\n'
        + "  "
        + m.group(2),
        html,
        count=1,
    )
    index_path.write_text(novo, encoding="utf-8")
    return True


# --------------------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------------------

def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Parser do Kalendar PDF para JSON.")
    parser.add_argument(
        "--pdf",
        default=str(REPO_DIR / "KALENDAR-compacto-P_B.pdf"),
        help="Caminho do PDF (padrão: KALENDAR-compacto-P_B.pdf na raiz do repositório)",
    )
    parser.add_argument(
        "--out", default=str(REPO_DIR / "data"), help="Pasta de saída dos JSONs (padrão: ./data)"
    )
    parser.add_argument("--debug-text", action="store_true", help="Salva dump de texto com coordenadas")
    parser.add_argument(
        "--index",
        default=str(REPO_DIR / "index.html"),
        help="index.html que recebe os JSONs embutidos (padrão: index.html da raiz)",
    )
    parser.add_argument(
        "--no-embed", action="store_true", help="Não embutir os JSONs no index.html"
    )
    args = parser.parse_args()

    caminho_pdf = Path(args.pdf)
    if not caminho_pdf.exists():
        raise FileNotFoundError(f"PDF não encontrado: {caminho_pdf.resolve()}")

    pasta_saida = Path(args.out)
    pasta_saida.mkdir(parents=True, exist_ok=True)

    doc = pymupdf.open(caminho_pdf)
    debug_file = (pasta_saida / "debug_layout.txt") if args.debug_text else None
    paginas = extrair_paginas(doc, debug_path=debug_file)

    liturgias = parse_liturgias_semana(paginas)
    plano = parse_plano_leitura(paginas)
    avisos = liturgias.pop("_avisos") + plano.pop("_avisos")

    liturgias = {
        "fonte": "Kalendar 2026–2027 · Ano I · Edição Compacta · DIA",
        "semana_liturgica": liturgias["semana_liturgica"],
        "benedictus": parse_benedictus(paginas),
    }

    (pasta_saida / "liturgias_semana.json").write_text(
        json.dumps(liturgias, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (pasta_saida / "plano_leitura.json").write_text(
        json.dumps(plano, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"Gerados em: {pasta_saida.resolve()}")
    caminho_index = Path(args.index)
    if args.no_embed:
        pass
    elif not caminho_index.exists():
        print(f"- index.html não encontrado ({caminho_index}); dados não embutidos")
    elif embutir_no_index(caminho_index, liturgias, plano):
        print(f"- JSONs embutidos em {caminho_index.name} ({caminho_index.stat().st_size // 1024} KB)")
    else:
        print("- index.html sem os marcadores <!-- DADOS:INICIO/FIM -->; dados não embutidos")
    print(f"- Dias de liturgia extraídos: {len(liturgias['semana_liturgica'])}/7")
    for chave, dia in liturgias["semana_liturgica"].items():
        print(f"    {chave:8s} {len(dia['secoes'])} seções: {', '.join(dia['secoes'])}")
    print(f"- Benedictus: {'ok' if liturgias['benedictus'] else 'NÃO encontrado'}")
    print(f"- Entradas no plano de leitura: {plano['total_entradas']}")

    erros = validar_plano(plano["entradas"])
    if avisos or erros:
        print("\nAvisos de extração:")
        for a in avisos + erros:
            print(f"  ! {a}")
        return 1
    print("\nValidação: calendário contínuo e leituras completas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
