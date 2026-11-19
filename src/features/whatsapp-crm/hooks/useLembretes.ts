import { useCallback, useEffect, useRef, useState } from "react";
import { hojeLembretes, type Lembrete, type LembreteInput } from "@/lib/lembretes";
import { CRM_RELOAD_EVENT } from "@/lib/crm-refresh";

const EVENTO = "crm:lembretes";
const API = "/api/crm/lembretes";

export function useLembretes(mes?: string) {
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [hoje, setHoje] = useState(hojeLembretes);
  const requestRef = useRef<AbortController | null>(null);
  const carregar = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const diaAtual = hojeLembretes();
    setHoje(diaAtual);
    const params = new URLSearchParams();
    if (mes) {
      const [ano, numeroMes] = mes.split("-").map(Number);
      const ultimoDia = new Date(ano, numeroMes, 0).getDate();
      params.set("de", `${mes}-01`);
      params.set("ate", `${mes}-${ultimoDia}`);
    } else {
      params.set("ate", diaAtual);
      params.set("pendentes", "1");
    }
    try {
      const res = await fetch(`${API}?${params}`, { cache: "no-store", signal: controller.signal });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data))
        throw new Error(data.erro || "Não foi possível carregar os lembretes");
      if (!controller.signal.aborted) {
        setLembretes(data);
        setErro("");
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setErro(error instanceof Error ? error.message : "Falha ao carregar lembretes");
    } finally {
      if (!controller.signal.aborted) setCarregando(false);
    }
  }, [mes]);

  useEffect(() => {
    setLembretes([]);
    setCarregando(true);
    void carregar();
    const refresh = () => {
      if (document.visibilityState === "visible") void carregar();
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener(EVENTO, refresh);
    window.addEventListener(CRM_RELOAD_EVENT, refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      requestRef.current?.abort();
      window.clearInterval(timer);
      window.removeEventListener(EVENTO, refresh);
      window.removeEventListener(CRM_RELOAD_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [carregar]);

  async function alterar(method: string, body?: unknown, id?: string) {
    const response = await fetch(`${API}${id ? `?id=${encodeURIComponent(id)}` : ""}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.erro || "Não foi possível salvar o lembrete");
    window.dispatchEvent(new Event(EVENTO));
  }
  return {
    lembretes,
    carregando,
    erro,
    hoje,
    carregar,
    salvar: (input: LembreteInput, id?: string) =>
      alterar(id ? "PATCH" : "POST", id ? { ...input, id, acao: "editar" } : input),
    concluir: (item: Lembrete) =>
      alterar("PATCH", { id: item.id, acao: "concluir", concluido: !item.concluido }),
    excluir: (id: string) => alterar("DELETE", undefined, id),
  };
}
