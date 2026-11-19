import { camposClienteBusca, correspondeBusca } from "./crm-search";
export {
  normalizarBusca as normalizarBuscaConversa,
  digitosBusca as digitosBuscaConversa,
  telefoneCorrespondeBusca,
} from "./crm-search";

type ConversaPesquisavel = {
  cliente?: string | null;
  telefone?: string | null;
  ultima?: string | null;
  pet?: string | null;
};

/** Pesquisa tambem os pets e o nome atualizado na ficha vinculada. */
export function conversaCorrespondeBusca(
  conversa: ConversaPesquisavel,
  query: string,
  cliente?: Parameters<typeof camposClienteBusca>[0],
): boolean {
  return correspondeBusca(
    query,
    [conversa.cliente, conversa.pet, conversa.ultima, ...camposClienteBusca(cliente)],
    [conversa.telefone, cliente?.telefone],
  );
}
