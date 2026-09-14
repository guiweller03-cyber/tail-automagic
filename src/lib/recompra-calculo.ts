// Regras do ciclo de recompra documentadas em RECOMPRA_CALCULO.md (manter em sincronia).
import type { PetDetalhe } from "@/lib/crm-types";

export type RacaoLinhaRecompra = "fresh_meat" | "pro_life" | "generica";
export type RacaoFaseRecompra = "filhote" | "adulto" | "senior" | "castrado";
export type RacaoPorteCachorro = "toy" | "pequeno" | "medio" | "grande" | "gigante";
export type RacaoPorteRecompra = RacaoPorteCachorro | "gato";

export type ProdutoRecompraInfo = {
  nome?: string | null;
  categoria?: string | null;
  detalhes_tecnicos?: {
    marca?: string;
    linha?: string;
    especie?: string;
    porte?: string;
    idade?: string;
    peso?: string;
    tipoProduto?: string;
  } | null;
  detalhesTecnicos?: {
    marca?: string;
    linha?: string;
    especie?: string;
    porte?: string;
    idade?: string;
    peso?: string;
    tipoProduto?: string;
  } | null;
};

export type PetConsumoEstimado = {
  nome: string;
  especie: "cachorro" | "gato";
  porte: "pequeno" | "medio" | "grande";
  pesoKg: number;
  pesoInformado: boolean;
  pesoOrigem: "informado" | "medido" | "crescimento" | "raca" | "porte";
  raca?: string;
  consumoDiaG: number;
  linha: RacaoLinhaRecompra;
  fase: RacaoFaseRecompra;
};

type PesoMedioRaca = {
  nome: string;
  especie: "cachorro" | "gato";
  aliases: string[];
  pesoKg: number;
  porte: RacaoPorteRecompra;
};

export type RacaPesoBase = {
  nome: string;
  especie: "cachorro" | "gato";
  pesoKg: number;
  porte: RacaoPorteRecompra;
};

const PESO_MEDIO_POR_PORTE: Record<RacaoPorteRecompra, number> = {
  toy: 3.7,
  pequeno: 8.1,
  medio: 17.6,
  grande: 29.9,
  gigante: 57.1,
  gato: 3.5,
};

const PESO_ADULTO_RACAS_CSV: Array<{
  nome: string;
  porte: RacaoPorteCachorro;
  pesoKg: number;
}> = [
  { nome: "Chihuahua", porte: "toy", pesoKg: 2.1 },
  { nome: "Poodle Toy", porte: "toy", pesoKg: 2.25 },
  { nome: "Spitz Alemão / Lulu da Pomerânia", porte: "toy", pesoKg: 2.3 },
  { nome: "Yorkshire Terrier", porte: "toy", pesoKg: 2.6 },
  { nome: "Maltês", porte: "toy", pesoKg: 2.8 },
  { nome: "Papillon", porte: "toy", pesoKg: 3.4 },
  { nome: "Prazer / Affenpinscher", porte: "toy", pesoKg: 3.85 },
  { nome: "Pinscher Miniatura", porte: "toy", pesoKg: 4.05 },
  { nome: "Pequinês", porte: "toy", pesoKg: 4.7 },
  { nome: "Jack Russell Terrier", porte: "toy", pesoKg: 5.45 },
  { nome: "Poodle Miniatura", porte: "toy", pesoKg: 5.65 },
  { nome: "Shih Tzu", porte: "toy", pesoKg: 5.7 },
  { nome: "Lhasa Apso", porte: "pequeno", pesoKg: 6.8 },
  { nome: "Bichon Frisé", porte: "pequeno", pesoKg: 6.8 },
  { nome: "Schnauzer Miniatura", porte: "pequeno", pesoKg: 7.05 },
  { nome: "Cavalier King Charles Spaniel", porte: "pequeno", pesoKg: 7.05 },
  { nome: "Pug", porte: "pequeno", pesoKg: 7.3 },
  { nome: "Fox Paulistinha / Fox Terrier", porte: "pequeno", pesoKg: 7.5 },
  { nome: "West Highland White Terrier", porte: "pequeno", pesoKg: 7.95 },
  { nome: "Beagle", porte: "pequeno", pesoKg: 8.85 },
  { nome: "Dachshund (Salsicha)", porte: "pequeno", pesoKg: 9.75 },
  { nome: "Buldogue Francês", porte: "pequeno", pesoKg: 10 },
  { nome: "Basenji", porte: "pequeno", pesoKg: 10.45 },
  { nome: "Corgi (Welsh Corgi)", porte: "medio", pesoKg: 13.15 },
  { nome: "Cocker Spaniel Inglês", porte: "medio", pesoKg: 13.6 },
  { nome: "Staffordshire Bull Terrier", porte: "medio", pesoKg: 14.05 },
  { nome: "Whippet", porte: "medio", pesoKg: 14.7 },
  { nome: "Schnauzer Standard", porte: "medio", pesoKg: 18.15 },
  { nome: "Border Collie", porte: "medio", pesoKg: 19.25 },
  { nome: "Bulldog Inglês", porte: "medio", pesoKg: 20.4 },
  { nome: "Springer Spaniel", porte: "medio", pesoKg: 20.4 },
  { nome: "Pit Bull (American Pit Bull Terrier)", porte: "medio", pesoKg: 20.4 },
  { nome: "Husky Siberiano", porte: "medio", pesoKg: 21.55 },
  { nome: "Samoieda", porte: "grande", pesoKg: 22.7 },
  { nome: "Shar Pei", porte: "grande", pesoKg: 23.8 },
  { nome: "Basset Hound", porte: "grande", pesoKg: 23.8 },
  { nome: "Australian Shepherd", porte: "grande", pesoKg: 23.8 },
  { nome: "Poodle Standard", porte: "grande", pesoKg: 24.95 },
  { nome: "Chow Chow", porte: "grande", pesoKg: 26.1 },
  { nome: "Dálmata", porte: "grande", pesoKg: 26.1 },
  { nome: "Pointer Inglês", porte: "grande", pesoKg: 27.2 },
  { nome: "Bull Terrier", porte: "grande", pesoKg: 27.25 },
  { nome: "Setter Inglês (English Setter)", porte: "grande", pesoKg: 28.35 },
  { nome: "Collie (Pastor Escocês)", porte: "grande", pesoKg: 28.35 },
  { nome: "Golden Retriever", porte: "grande", pesoKg: 29.45 },
  { nome: "Boxer", porte: "grande", pesoKg: 29.5 },
  { nome: "Setter Irlandês (Irish Setter)", porte: "grande", pesoKg: 29.5 },
  { nome: "Labrador Retriever", porte: "grande", pesoKg: 30.6 },
  { nome: "Pastor Alemão", porte: "grande", pesoKg: 31.75 },
  { nome: "Pastor Belga", porte: "grande", pesoKg: 25 },
  { nome: "Weimaraner", porte: "grande", pesoKg: 32.85 },
  { nome: "Doberman", porte: "grande", pesoKg: 36.3 },
  { nome: "Old English Sheepdog (Bobtail)", porte: "grande", pesoKg: 36.3 },
  { nome: "Alaskan Malamute", porte: "grande", pesoKg: 36.3 },
  { nome: "Cane Corso", porte: "grande", pesoKg: 45 },
  { nome: "Buldogue Campeiro", porte: "grande", pesoKg: 37.5 },
  { nome: "Bernese Mountain Dog (Bernês da Montanha)", porte: "gigante", pesoKg: 42 },
  { nome: "Akita", porte: "gigante", pesoKg: 45.4 },
  { nome: "Dogue de Bordeaux", porte: "gigante", pesoKg: 47.4 },
  { nome: "Rottweiler", porte: "gigante", pesoKg: 48.75 },
  { nome: "Kangal", porte: "gigante", pesoKg: 54.5 },
  { nome: "Terra Nova (Newfoundland)", porte: "gigante", pesoKg: 56.7 },
  { nome: "Leonberger", porte: "gigante", pesoKg: 58.95 },
  { nome: "Mastim Napolitano", porte: "gigante", pesoKg: 58.95 },
  { nome: "Fila Brasileiro", porte: "gigante", pesoKg: 60 },
  { nome: "Dogue Alemão (Great Dane)", porte: "gigante", pesoKg: 64.65 },
  { nome: "São Bernardo", porte: "gigante", pesoKg: 68 },
  { nome: "Mastiff Inglês", porte: "gigante", pesoKg: 79.35 },
];

const CURVA_CRESCIMENTO_PCT: Record<RacaoPorteCachorro, Array<[number, number]>> = {
  toy: [
    [0, 0.03],
    [1, 0.182],
    [2, 0.332],
    [3, 0.478],
    [4, 0.625],
    [5, 0.749],
    [6, 0.838],
    [7, 0.907],
    [8, 0.979],
    [9, 1],
    [10, 1],
    [12, 1],
    [18, 1],
    [24, 1],
  ],
  pequeno: [
    [0, 0.025],
    [1, 0.153],
    [2, 0.284],
    [3, 0.431],
    [4, 0.581],
    [5, 0.71],
    [6, 0.802],
    [7, 0.866],
    [8, 0.932],
    [9, 0.96],
    [10, 0.973],
    [12, 1],
    [18, 1],
    [24, 1],
  ],
  medio: [
    [0, 0.02],
    [1, 0.128],
    [2, 0.242],
    [3, 0.387],
    [4, 0.536],
    [5, 0.67],
    [6, 0.767],
    [7, 0.834],
    [8, 0.903],
    [9, 0.936],
    [10, 0.955],
    [12, 0.994],
    [18, 1],
    [24, 1],
  ],
  grande: [
    [0, 0.013],
    [1, 0.094],
    [2, 0.182],
    [3, 0.313],
    [4, 0.455],
    [5, 0.59],
    [6, 0.694],
    [7, 0.773],
    [8, 0.854],
    [9, 0.893],
    [10, 0.915],
    [12, 0.96],
    [18, 0.99],
    [24, 1],
  ],
  gigante: [
    [0, 0.01],
    [1, 0.072],
    [2, 0.142],
    [3, 0.26],
    [4, 0.392],
    [5, 0.524],
    [6, 0.629],
    [7, 0.712],
    [8, 0.797],
    [9, 0.844],
    [10, 0.874],
    [12, 0.937],
    [18, 0.97],
    [24, 1],
  ],
};

const PESO_MEDIO_POR_RACA: PesoMedioRaca[] = [
  { nome: "Pinscher", especie: "cachorro", aliases: ["pinscher"], pesoKg: 3, porte: "pequeno" },
  { nome: "Chihuahua", especie: "cachorro", aliases: ["chihuahua"], pesoKg: 3, porte: "pequeno" },
  {
    nome: "Yorkshire Terrier",
    especie: "cachorro",
    aliases: ["yorkshire terrier", "yorkshire", "york"],
    pesoKg: 3.5,
    porte: "pequeno",
  },
  { nome: "Maltês", especie: "cachorro", aliases: ["maltes"], pesoKg: 4, porte: "pequeno" },
  {
    nome: "Poodle Toy",
    especie: "cachorro",
    aliases: ["poodle toy", "poodle mini", "poodle miniature"],
    pesoKg: 4,
    porte: "pequeno",
  },
  {
    nome: "Spitz Alemão (Lulu)",
    especie: "cachorro",
    aliases: ["spitz alemao", "spitz", "lulu", "lulu da pomerania", "pomerania"],
    pesoKg: 4,
    porte: "pequeno",
  },
  {
    nome: "Shih Tzu",
    especie: "cachorro",
    aliases: ["shih tzu", "shitzu", "shihtzu"],
    pesoKg: 6,
    porte: "pequeno",
  },
  {
    nome: "Lhasa Apso",
    especie: "cachorro",
    aliases: ["lhasa apso", "lhasa"],
    pesoKg: 7,
    porte: "pequeno",
  },
  { nome: "Pug", especie: "cachorro", aliases: ["pug"], pesoKg: 8, porte: "pequeno" },
  {
    nome: "Bichon Frisé",
    especie: "cachorro",
    aliases: ["bichon frise", "bichon"],
    pesoKg: 6,
    porte: "pequeno",
  },
  {
    nome: "Dachshund (Salsicha)",
    especie: "cachorro",
    aliases: ["dachshund", "salsicha", "teckel"],
    pesoKg: 7,
    porte: "pequeno",
  },
  {
    nome: "Jack Russell Terrier",
    especie: "cachorro",
    aliases: ["jack russell terrier", "jack russell"],
    pesoKg: 7,
    porte: "pequeno",
  },
  {
    nome: "Bulldog Francês",
    especie: "cachorro",
    aliases: ["bulldog frances", "buldogue frances"],
    pesoKg: 11,
    porte: "pequeno",
  },
  {
    nome: "Boston Terrier",
    especie: "cachorro",
    aliases: ["boston terrier", "boston"],
    pesoKg: 9,
    porte: "pequeno",
  },
  { nome: "Beagle", especie: "cachorro", aliases: ["beagle"], pesoKg: 13, porte: "medio" },
  {
    nome: "Cocker Spaniel",
    especie: "cachorro",
    aliases: ["cocker spaniel", "cocker"],
    pesoKg: 13,
    porte: "medio",
  },
  {
    nome: "Schnauzer Médio",
    especie: "cachorro",
    aliases: ["schnauzer medio", "schnauzer"],
    pesoKg: 15,
    porte: "medio",
  },
  {
    nome: "Poodle Médio",
    especie: "cachorro",
    aliases: ["poodle medio", "poodle"],
    pesoKg: 12,
    porte: "medio",
  },
  {
    nome: "Poodle Grande",
    especie: "cachorro",
    aliases: ["poodle grande", "poodle standard"],
    pesoKg: 22,
    porte: "medio",
  },
  {
    nome: "Border Collie",
    especie: "cachorro",
    aliases: ["border collie", "border"],
    pesoKg: 20,
    porte: "medio",
  },
  { nome: "Corgi", especie: "cachorro", aliases: ["corgi"], pesoKg: 12, porte: "medio" },
  {
    nome: "Pastor de Shetland",
    especie: "cachorro",
    aliases: ["pastor de shetland", "shetland", "sheltie"],
    pesoKg: 10,
    porte: "medio",
  },
  {
    nome: "Australian Shepherd",
    especie: "cachorro",
    aliases: ["australian shepherd", "aussie"],
    pesoKg: 23,
    porte: "medio",
  },
  { nome: "Chow Chow", especie: "cachorro", aliases: ["chow chow"], pesoKg: 25, porte: "medio" },
  {
    nome: "Husky Siberiano",
    especie: "cachorro",
    aliases: ["husky siberiano", "husky", "siberiano"],
    pesoKg: 25,
    porte: "medio",
  },
  {
    nome: "Pitbull",
    especie: "cachorro",
    aliases: ["pitbull", "pit bull", "amstaff"],
    pesoKg: 25,
    porte: "grande",
  },
  {
    nome: "American Bully",
    especie: "cachorro",
    aliases: ["american bully", "bully"],
    pesoKg: 40,
    porte: "grande",
  },
  {
    nome: "Golden Retriever",
    especie: "cachorro",
    aliases: ["golden retriever", "golden"],
    pesoKg: 32,
    porte: "grande",
  },
  {
    nome: "Labrador Retriever",
    especie: "cachorro",
    aliases: ["labrador retriever", "labrador"],
    pesoKg: 32,
    porte: "grande",
  },
  {
    nome: "Pastor Alemão",
    especie: "cachorro",
    aliases: ["pastor alemao"],
    pesoKg: 38,
    porte: "grande",
  },
  {
    nome: "Pastor Belga",
    especie: "cachorro",
    aliases: ["pastor belga", "belgian shepherd", "malinois"],
    pesoKg: 25,
    porte: "grande",
  },
  { nome: "Boxer", especie: "cachorro", aliases: ["boxer"], pesoKg: 30, porte: "grande" },
  {
    nome: "Dobermann",
    especie: "cachorro",
    aliases: ["dobermann", "doberman"],
    pesoKg: 38,
    porte: "grande",
  },
  { nome: "Rottweiler", especie: "cachorro", aliases: ["rottweiler"], pesoKg: 45, porte: "grande" },
  { nome: "Cane Corso", especie: "cachorro", aliases: ["cane corso"], pesoKg: 50, porte: "grande" },
  { nome: "Akita", especie: "cachorro", aliases: ["akita"], pesoKg: 40, porte: "grande" },
  {
    nome: "Bernese Mountain Dog",
    especie: "cachorro",
    aliases: ["bernese mountain dog", "bernese", "boiadeiro de berna"],
    pesoKg: 45,
    porte: "grande",
  },
  {
    nome: "São Bernardo",
    especie: "cachorro",
    aliases: ["sao bernardo", "saint bernard"],
    pesoKg: 70,
    porte: "grande",
  },
  {
    nome: "Dogue Alemão",
    especie: "cachorro",
    aliases: ["dogue alemao", "dogo alemao"],
    pesoKg: 70,
    porte: "grande",
  },
  {
    nome: "Malamute do Alasca",
    especie: "cachorro",
    aliases: ["malamute do alasca", "malamute"],
    pesoKg: 40,
    porte: "grande",
  },
  { nome: "Weimaraner", especie: "cachorro", aliases: ["weimaraner"], pesoKg: 35, porte: "grande" },
  { nome: "Dálmata", especie: "cachorro", aliases: ["dalmata"], pesoKg: 25, porte: "medio" },
  {
    nome: "Setter Irlandês",
    especie: "cachorro",
    aliases: ["setter irlandes", "irish setter"],
    pesoKg: 30,
    porte: "grande",
  },
  { nome: "Pointer", especie: "cachorro", aliases: ["pointer"], pesoKg: 25, porte: "medio" },
  { nome: "Vizsla", especie: "cachorro", aliases: ["vizsla"], pesoKg: 25, porte: "medio" },
  {
    nome: "Shar Pei",
    especie: "cachorro",
    aliases: ["shar pei", "sharpei"],
    pesoKg: 23,
    porte: "medio",
  },
  {
    nome: "Bull Terrier",
    especie: "cachorro",
    aliases: ["bull terrier"],
    pesoKg: 28,
    porte: "grande",
  },
  {
    nome: "Basset Hound",
    especie: "cachorro",
    aliases: ["basset hound", "basset"],
    pesoKg: 25,
    porte: "medio",
  },
  {
    nome: "Galgo (Greyhound)",
    especie: "cachorro",
    aliases: ["galgo", "greyhound"],
    pesoKg: 30,
    porte: "grande",
  },
  { nome: "Whippet", especie: "cachorro", aliases: ["whippet"], pesoKg: 15, porte: "medio" },
  {
    nome: "Vira-lata pequeno",
    especie: "cachorro",
    aliases: ["vira-lata pequeno", "vira lata pequeno", "srd pequeno"],
    pesoKg: 8,
    porte: "pequeno",
  },
  {
    nome: "Vira-lata médio",
    especie: "cachorro",
    aliases: ["vira-lata medio", "vira lata medio", "srd medio"],
    pesoKg: 18,
    porte: "medio",
  },
  { nome: "Maine Coon", especie: "gato", aliases: ["maine coon"], pesoKg: 7.5, porte: "gato" },
  { nome: "Ragdoll", especie: "gato", aliases: ["ragdoll"], pesoKg: 6, porte: "gato" },
  { nome: "Persa", especie: "gato", aliases: ["persa"], pesoKg: 4.5, porte: "gato" },
  { nome: "Siamês", especie: "gato", aliases: ["siames", "siamesa"], pesoKg: 4, porte: "gato" },
  { nome: "Sphynx", especie: "gato", aliases: ["sphynx"], pesoKg: 4, porte: "gato" },
  { nome: "Bengal", especie: "gato", aliases: ["bengal"], pesoKg: 5, porte: "gato" },
  { nome: "Angorá", especie: "gato", aliases: ["angora"], pesoKg: 4, porte: "gato" },
];

export function listarRacasPesoBase(): RacaPesoBase[] {
  const caes = PESO_ADULTO_RACAS_CSV.map((raca) => ({
    nome: raca.nome,
    especie: "cachorro" as const,
    pesoKg: raca.pesoKg,
    porte: raca.porte,
  }));
  const gatos = PESO_MEDIO_POR_RACA.filter((raca) => raca.especie === "gato").map((raca) => ({
    nome: raca.nome,
    especie: raca.especie,
    pesoKg: raca.pesoKg,
    porte: raca.porte,
  }));
  return [...caes, ...gatos];
}

const CONSUMO_G_POR_KG_DIA: Record<
  RacaoLinhaRecompra,
  Record<RacaoFaseRecompra, Record<RacaoPorteRecompra, number>>
> = {
  fresh_meat: {
    filhote: { toy: 19, pequeno: 19, medio: 18, grande: 17, gigante: 17, gato: 21 },
    adulto: { toy: 15, pequeno: 15, medio: 14, grande: 13, gigante: 13, gato: 14 },
    senior: { toy: 14, pequeno: 14, medio: 13, grande: 12, gigante: 12, gato: 13 },
    castrado: { toy: 15, pequeno: 15, medio: 14, grande: 13, gigante: 13, gato: 12 },
  },
  pro_life: {
    filhote: { toy: 20, pequeno: 20, medio: 19, grande: 18, gigante: 18, gato: 22 },
    adulto: { toy: 16, pequeno: 16, medio: 15, grande: 14, gigante: 14, gato: 15 },
    senior: { toy: 15, pequeno: 15, medio: 14, grande: 13, gigante: 13, gato: 14 },
    castrado: { toy: 16, pequeno: 16, medio: 15, grande: 14, gigante: 14, gato: 13 },
  },
  generica: {
    filhote: { toy: 20, pequeno: 20, medio: 19, grande: 18, gigante: 18, gato: 22 },
    adulto: { toy: 16, pequeno: 16, medio: 15, grande: 14, gigante: 14, gato: 15 },
    senior: { toy: 15, pequeno: 15, medio: 14, grande: 13, gigante: 13, gato: 14 },
    castrado: { toy: 16, pequeno: 16, medio: 15, grande: 14, gigante: 14, gato: 13 },
  },
};

function detalhesTecnicos(produto?: ProdutoRecompraInfo | null) {
  return produto?.detalhes_tecnicos ?? produto?.detalhesTecnicos ?? null;
}

export function normalizarTextoRecompra(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function ehRacaoParaRecompra(produto?: ProdutoRecompraInfo | null): boolean {
  const text = normalizarTextoRecompra(
    [produto?.nome, produto?.categoria, detalhesTecnicos(produto)?.tipoProduto]
      .filter(Boolean)
      .join(" "),
  );

  if (/\b(snack|petisco|biscoito|bifinho|osso|mordedor)\b/.test(text)) return false;

  return /\bracao\b|\bracoes\b|premier|golden|formula natural|n&d|gran ?(plus|nature)|special dog|special cat|bino|bionatural|bob dog|catsy/.test(
    text,
  );
}

export function racaSlug(value: string): string {
  return normalizarTextoRecompra(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function aliasesRaca(nome: string): string[] {
  const base = normalizarTextoRecompra(nome);
  const aliases = new Set(
    [base, base.replace(/\([^)]*\)/g, " "), ...base.split("/"), base.match(/\(([^)]*)\)/)?.[1]]
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => value.replace(/[^a-z0-9]+/g, " ").trim()),
  );

  return Array.from(aliases).filter(Boolean);
}

function parseDateOnly(value?: string | null): Date | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isFinite(date.getTime()) ? date : null;
}

function mesesEntreDatas(inicio: Date, fim: Date): number {
  const dias = (fim.getTime() - inicio.getTime()) / 86_400_000;
  if (!Number.isFinite(dias)) return 0;
  return Math.max(0, dias / 30.4375);
}

function interpolarCurva(porte: RacaoPorteCachorro, idadeMeses: number): number {
  const curva = CURVA_CRESCIMENTO_PCT[porte];
  if (idadeMeses <= curva[0][0]) return curva[0][1];

  for (let i = 1; i < curva.length; i += 1) {
    const [mesAtual, pctAtual] = curva[i];
    if (idadeMeses <= mesAtual) {
      const [mesAnterior, pctAnterior] = curva[i - 1];
      const ratio = (idadeMeses - mesAnterior) / (mesAtual - mesAnterior);
      return pctAnterior + (pctAtual - pctAnterior) * ratio;
    }
  }

  return curva[curva.length - 1][1];
}

function porteVisual(porte: RacaoPorteRecompra): "pequeno" | "medio" | "grande" {
  if (porte === "toy") return "pequeno";
  if (porte === "gigante") return "grande";
  if (porte === "gato") return "pequeno";
  return porte;
}

export function classificarLinhaRacao(produto?: ProdutoRecompraInfo | null): RacaoLinhaRecompra {
  const text = normalizarTextoRecompra(
    [
      produto?.nome,
      produto?.categoria,
      detalhesTecnicos(produto)?.marca,
      detalhesTecnicos(produto)?.linha,
      detalhesTecnicos(produto)?.tipoProduto,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (text.includes("fresh meat")) return "fresh_meat";
  if (/\bpro\b/.test(text) || text.includes(" pro ") || text.includes("life")) {
    return "pro_life";
  }

  return "generica";
}

export function classificarFaseRacao(produto?: ProdutoRecompraInfo | null): RacaoFaseRecompra {
  const text = normalizarTextoRecompra(
    [
      produto?.nome,
      produto?.categoria,
      detalhesTecnicos(produto)?.linha,
      detalhesTecnicos(produto)?.idade,
      detalhesTecnicos(produto)?.tipoProduto,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (text.includes("filhote") || text.includes("puppy") || text.includes("junior")) {
    return "filhote";
  }
  if (text.includes("castrado") || text.includes("neutered")) return "castrado";
  if (text.includes("senior")) return "senior";

  return "adulto";
}

export function normalizarPorteRacao(
  especie: "cachorro" | "gato",
  porte?: string | null,
): RacaoPorteRecompra {
  if (especie === "gato") return "gato";

  const text = normalizarTextoRecompra(porte ?? "");
  if (text.includes("toy")) return "toy";
  if (text.includes("mini") || text.includes("pequeno") || text.includes("peq")) return "pequeno";
  if (text.includes("medio") || text.includes("med")) return "medio";
  if (text.includes("gigante") || text.includes("giant")) return "gigante";
  if (text.includes("grande") || text.includes("large") || text.includes("maxi")) return "grande";

  return "medio";
}

export function pesoPadraoPorPorte(porte: RacaoPorteRecompra): number {
  return PESO_MEDIO_POR_PORTE[porte];
}

export function inferirPesoRacaoKg(produto?: ProdutoRecompraInfo | null, quantidade = 1): number {
  const origem = `${detalhesTecnicos(produto)?.peso ?? ""} ${produto?.nome ?? ""}`;
  const kg = origem.match(/(\d+(?:[,.]\d+)?)\s*kg/i);
  if (kg) return Number(kg[1].replace(",", ".")) * quantidade;

  const g = origem.match(/(\d+(?:[,.]\d+)?)\s*g\b/i);
  if (g) return (Number(g[1].replace(",", ".")) / 1000) * quantidade;

  return 0;
}

export function calcularDiasRecompraRacao(pesoRacaoKg: number, consumoDiarioG: number): number {
  if (!Number.isFinite(pesoRacaoKg) || pesoRacaoKg <= 0) return 30;
  if (!Number.isFinite(consumoDiarioG) || consumoDiarioG <= 0) return 30;
  return Math.max(1, Math.round((pesoRacaoKg * 1000) / consumoDiarioG));
}

/** Valida o ciclo digitado pelo operador. Vazio/null remove o ajuste manual. */
export function normalizarCicloManual(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const dias = Math.round(Number(value));
  if (!Number.isFinite(dias) || dias < 1 || dias > 365) {
    throw new Error("O ciclo deve ficar entre 1 e 365 dias");
  }
  return dias;
}

/** O ajuste manual do operador sempre vence o ciclo calculado automaticamente. */
export function cicloEfetivoRecompra(diasCalculados: number, diasManual?: number | null): number {
  if (typeof diasManual === "number" && diasManual > 0) return Math.round(diasManual);
  return Math.max(1, Math.round(diasCalculados));
}

export function pesoMedioPorRaca(
  especie: "cachorro" | "gato",
  raca?: string | null,
): { pesoKg: number; porte: RacaoPorteRecompra } | null {
  const text = normalizarTextoRecompra(raca ?? "");
  if (!text) return null;

  if (especie === "cachorro") {
    const slugInformado = racaSlug(raca ?? "");
    const matchCsv = PESO_ADULTO_RACAS_CSV.flatMap((item) =>
      aliasesRaca(item.nome).map((alias) => ({ item, alias })),
    )
      .sort((a, b) => b.alias.length - a.alias.length)
      .find(
        ({ item, alias }) => slugInformado === racaSlug(item.nome) || text.includes(alias),
      )?.item;

    if (matchCsv) return { pesoKg: matchCsv.pesoKg, porte: matchCsv.porte };
  }

  const match = PESO_MEDIO_POR_RACA.flatMap((item) =>
    item.especie === especie ? item.aliases.map((alias) => ({ item, alias })) : [],
  )
    .sort((a, b) => b.alias.length - a.alias.length)
    .find(({ alias }) => text.includes(alias))?.item;

  return match ? { pesoKg: match.pesoKg, porte: match.porte } : null;
}

export function pesoAtualKg(
  pet: Pick<
    PetDetalhe,
    | "especie"
    | "raca"
    | "porte"
    | "pesoKg"
    | "pesoKgMedidoEm"
    | "nascimento"
    | "dataNascimentoEstimada"
    | "idadeAdultaConfirmada"
    | "racaSlug"
  >,
  hoje: Date | string = new Date(),
): { pesoKg?: number; porte?: RacaoPorteRecompra; origem?: PetConsumoEstimado["pesoOrigem"] } {
  const especie = pet.especie ?? "cachorro";
  const pesoInformado =
    typeof pet.pesoKg === "number" && Number.isFinite(pet.pesoKg) && pet.pesoKg > 0
      ? Number(pet.pesoKg)
      : undefined;

  if (especie === "gato") {
    return {
      pesoKg: pesoInformado ?? PESO_MEDIO_POR_PORTE.gato,
      porte: "gato",
      origem: pesoInformado ? "informado" : "porte",
    };
  }

  const nascimento = parseDateOnly(pet.dataNascimentoEstimada ?? pet.nascimento);
  const pesoRaca =
    pesoMedioPorRaca("cachorro", pet.racaSlug ?? pet.raca) ??
    (pet.porte
      ? {
          pesoKg: pesoPadraoPorPorte(normalizarPorteRacao("cachorro", pet.porte)),
          porte: normalizarPorteRacao("cachorro", pet.porte),
        }
      : null);

  if (pesoInformado && (pet.idadeAdultaConfirmada || !nascimento)) {
    return { pesoKg: pesoInformado, porte: pesoRaca?.porte, origem: "informado" };
  }

  const medidoEm = parseDateOnly(pet.pesoKgMedidoEm);
  if (pesoInformado && medidoEm && nascimento && medidoEm >= nascimento) {
    return { pesoKg: pesoInformado, porte: pesoRaca?.porte, origem: "medido" };
  }

  if (!nascimento) {
    if (pesoRaca) return { pesoKg: pesoRaca.pesoKg, porte: pesoRaca.porte, origem: "raca" };
    return pesoInformado ? { pesoKg: pesoInformado, origem: "informado" } : {};
  }

  const idadeMeses = mesesEntreDatas(nascimento, typeof hoje === "string" ? new Date(hoje) : hoje);
  const porteNormalizado = normalizarPorteRacao("cachorro", pet.porte ?? "medio");
  const porte =
    (pesoRaca?.porte === "gato" ? undefined : pesoRaca?.porte) ??
    (porteNormalizado === "gato" ? "medio" : porteNormalizado);
  const pesoAdulto = pesoRaca?.pesoKg ?? pesoPadraoPorPorte(porte);

  if (pet.idadeAdultaConfirmada || idadeMeses >= 24) {
    return { pesoKg: Number(pesoAdulto.toFixed(2)), porte, origem: pesoRaca ? "raca" : "porte" };
  }

  return {
    pesoKg: Number((pesoAdulto * interpolarCurva(porte, idadeMeses)).toFixed(2)),
    porte,
    origem: "crescimento",
  };
}

export function consumoDiarioPetRacao(params: {
  produto?: ProdutoRecompraInfo | null;
  pet: Pick<
    PetDetalhe,
    | "nome"
    | "especie"
    | "raca"
    | "porte"
    | "pesoKg"
    | "pesoKgMedidoEm"
    | "nascimento"
    | "dataNascimentoEstimada"
    | "idadeAdultaConfirmada"
    | "racaSlug"
  >;
  especiePadrao: "cachorro" | "gato";
  portePadrao: "pequeno" | "medio" | "grande";
  hoje?: Date | string;
}): PetConsumoEstimado {
  const especie = params.pet.especie ?? params.especiePadrao;
  const raca = params.pet.raca?.trim() || undefined;
  const pesoCalculado = pesoAtualKg({ ...params.pet, especie }, params.hoje);
  const pesoRaca = pesoMedioPorRaca(especie, params.pet.racaSlug ?? raca);
  const porte =
    pesoCalculado.porte ??
    pesoRaca?.porte ??
    normalizarPorteRacao(especie, params.pet.porte ?? params.portePadrao);
  const pesoInformado =
    typeof params.pet.pesoKg === "number" &&
    Number.isFinite(params.pet.pesoKg) &&
    params.pet.pesoKg > 0 &&
    pesoCalculado.origem !== "crescimento";
  const pesoKg = pesoCalculado.pesoKg ?? pesoRaca?.pesoKg ?? pesoPadraoPorPorte(porte);
  const pesoOrigem = pesoCalculado.origem ?? (pesoRaca ? "raca" : "porte");
  const linha = classificarLinhaRacao(params.produto);
  const fase = classificarFaseRacao(params.produto);
  const consumoPorKg = CONSUMO_G_POR_KG_DIA[linha][fase][porte];

  return {
    nome: params.pet.nome.trim() || "Pet",
    especie,
    porte: porteVisual(porte),
    pesoKg,
    pesoInformado,
    pesoOrigem,
    raca,
    consumoDiaG: Math.round(pesoKg * consumoPorKg),
    linha,
    fase,
  };
}
