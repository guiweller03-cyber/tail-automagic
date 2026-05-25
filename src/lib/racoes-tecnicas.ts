import { RACOES_TECNICAS } from "./racoes-tecnicas-data.ts";

export type RacaoTecnica = (typeof RACOES_TECNICAS)[number];

const CAMPOS_TECNICOS = [
  "proteina",
  "proteína",
  "gordura",
  "fibra",
  "umidade",
  "minerais",
  "mineral",
  "calcio",
  "cálcio",
  "fosforo",
  "fósforo",
  "omega",
  "ômega",
  "taurina",
  "condroitina",
  "glicosamina",
  "prebiotico",
  "prebiótico",
  "yucca",
  "corante",
  "transgenico",
  "transgênico",
  "ingrediente",
  "composicao",
  "composição",
  "beneficio",
  "benefício",
  "indicacao",
  "indicação",
  "serve para",
  "indicado",
  "mini bits",
];

function normalizarTexto(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function clientePediuFichaTecnica(texto: string): boolean {
  const normalizado = normalizarTexto(texto);
  return CAMPOS_TECNICOS.some((termo) => normalizado.includes(normalizarTexto(termo)));
}

export function buscarRacoesTecnicasPorTexto(texto: string, limite = 3): RacaoTecnica[] {
  const normalizado = normalizarTexto(texto);
  const termosBusca = normalizado.split(/\s+/).filter((termo) => termo.length >= 3);

  return RACOES_TECNICAS.map((racao) => {
    const alvo = normalizarTexto(
      [
        racao.nome,
        racao.marca,
        racao.linha,
        racao.peso,
        racao.especie,
        racao.idade,
        racao.porte,
        racao.racaEspecifica,
        racao.indicacao,
      ].join(" "),
    );
    const score =
      (normalizado.includes(normalizarTexto(racao.nome)) ? 40 : 0) +
      (normalizado.includes(normalizarTexto(racao.linha)) ? 20 : 0) +
      termosBusca.filter((termo) => alvo.includes(termo)).length;

    return { racao, score };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map(({ racao }) => racao);
}
