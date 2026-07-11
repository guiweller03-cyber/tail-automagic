import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type NotifiableMessage = {
  role?: string;
  content?: string;
  fromMe?: boolean;
  at?: string;
};

export type NotifiableConversation = {
  id: string;
  cliente: string;
  telefone?: string;
  historico?: NotifiableMessage[];
};

type PermissionState = NotificationPermission | "unsupported";

/** Quantidade de mensagens novas detectadas para uma conversa num refresh. */
export type MessageDelta = { id: string; delta: number };

const STORAGE_KEY = "whatsapp-ia-notificacoes";
const MAX_TOASTS_POR_CICLO = 4;

function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Mensagem recebida do cliente (nao enviada por nos nem pela IA). */
function isIncoming(message: NotifiableMessage): boolean {
  if (message.fromMe) return false;
  const role = String(message.role ?? "").toLowerCase();
  return role !== "assistant" && role !== "ai";
}

/**
 * Assinatura das mensagens recebidas de uma conversa. Muda sempre que chega uma
 * nova mensagem do cliente (conta + ultima mensagem), permitindo detectar novidades
 * entre dois refreshes sem disparar para mensagens enviadas por nos ou pela IA.
 */
function incomingSignature(historico: NotifiableMessage[] | undefined): {
  sig: string;
  count: number;
  last: NotifiableMessage | null;
} {
  if (!Array.isArray(historico) || historico.length === 0) return { sig: "", count: 0, last: null };

  let count = 0;
  let last: NotifiableMessage | null = null;
  for (const message of historico) {
    if (isIncoming(message)) {
      count += 1;
      last = message;
    }
  }

  if (!last) return { sig: "", count: 0, last: null };
  return { sig: `${count}|${last.at ?? ""}|${last.content ?? ""}`, count, last };
}

/** Beep curto gerado via Web Audio API (sem precisar de arquivo de audio). */
function playBeep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.42);
    oscillator.onended = () => {
      void ctx.close();
    };
  } catch {
    /* audio bloqueado pelo navegador, ignora */
  }
}

/**
 * Notifica o operador quando chega uma nova mensagem de cliente na WhatsApp IA.
 * Avisa dentro do painel (som + toast + titulo da aba piscando) e via notificacao
 * nativa do navegador quando a permissao foi concedida.
 */
export function useMessageNotifications() {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<PermissionState>("default");

  const enabledRef = useRef(false);
  const signaturesRef = useRef(new Map<string, { sig: string; count: number }>());
  const initializedRef = useRef(false);

  const baseTitleRef = useRef("");
  const unseenRef = useRef(0);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Carrega preferencia salva e o estado de permissao atual.
  useEffect(() => {
    if (!isNotificationSupported()) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    try {
      setEnabled(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* localStorage indisponivel */
    }
  }, []);

  const stopFlash = useCallback(() => {
    if (flashTimerRef.current != null) {
      window.clearInterval(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    unseenRef.current = 0;
    if (baseTitleRef.current) {
      document.title = baseTitleRef.current;
    }
  }, []);

  const startFlash = useCallback(() => {
    if (typeof document === "undefined") return;
    if (!baseTitleRef.current) baseTitleRef.current = document.title;
    if (flashTimerRef.current != null) return;

    let showAlert = true;
    flashTimerRef.current = window.setInterval(() => {
      const total = unseenRef.current;
      document.title = showAlert
        ? `(${total}) ${total === 1 ? "Nova mensagem" : "Novas mensagens"}`
        : baseTitleRef.current;
      showAlert = !showAlert;
    }, 1000);
  }, []);

  // Para de piscar o titulo assim que a aba volta ao foco.
  useEffect(() => {
    const onFocus = () => stopFlash();
    const onVisible = () => {
      if (document.visibilityState === "visible") stopFlash();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      stopFlash();
    };
  }, [stopFlash]);

  const toggle = useCallback(async () => {
    if (enabledRef.current) {
      setEnabled(false);
      try {
        window.localStorage.setItem(STORAGE_KEY, "0");
      } catch {
        /* ignore */
      }
      stopFlash();
      return;
    }

    // Ligando: pede permissao do navegador se ainda nao foi decidida.
    if (isNotificationSupported() && Notification.permission === "default") {
      try {
        const result = await Notification.requestPermission();
        setPermission(result);
      } catch {
        /* ignore */
      }
    } else if (isNotificationSupported()) {
      setPermission(Notification.permission);
    }

    setEnabled(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }, [stopFlash]);

  const showBrowserNotification = useCallback(
    (conversa: NotifiableConversation, preview: string) => {
      if (!isNotificationSupported() || Notification.permission !== "granted") return;
      try {
        const notification = new Notification(`Nova mensagem · ${conversa.cliente}`, {
          body: preview,
          tag: `whatsapp-ia-${conversa.id}`,
          renotify: true,
        } as NotificationOptions);
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } catch {
        /* alguns navegadores exigem service worker; ignora */
      }
    },
    [],
  );

  /**
   * Compara a lista atual de conversas com o que foi visto no refresh anterior,
   * dispara os avisos de mensagens novas e retorna quantas mensagens novas cada
   * conversa recebeu (delta) para alimentar o contador de nao lidas. Chame apos
   * cada refresh.
   */
  const notify = useCallback(
    (conversas: NotifiableConversation[], activeId?: string | null): MessageDelta[] => {
      const signatures = signaturesRef.current;

      // Primeiro ciclo: apenas registra o estado atual, sem alertar mensagens antigas.
      if (!initializedRef.current) {
        for (const conversa of conversas) {
          const { sig, count } = incomingSignature(conversa.historico);
          if (sig) signatures.set(conversa.id, { sig, count });
        }
        initializedRef.current = true;
        return [];
      }

      const novas: Array<{
        conversa: NotifiableConversation;
        message: NotifiableMessage | null;
        delta: number;
      }> = [];
      for (const conversa of conversas) {
        const { sig, count, last } = incomingSignature(conversa.historico);
        if (!sig) continue;
        const prev = signatures.get(conversa.id);
        signatures.set(conversa.id, { sig, count });
        if (!prev) {
          // Conversa nova surgindo depois da carga inicial: tudo e novidade.
          novas.push({ conversa, message: last, delta: count });
        } else if (prev.sig !== sig) {
          novas.push({ conversa, message: last, delta: Math.max(1, count - prev.count) });
        }
      }

      const deltas: MessageDelta[] = novas.map(({ conversa, delta }) => ({
        id: conversa.id,
        delta,
      }));

      if (!enabledRef.current || novas.length === 0) return deltas;

      const focused = typeof document !== "undefined" && document.hasFocus();
      // Se a aba esta em foco e a mensagem e da conversa aberta, nao precisa alertar.
      const relevantes = novas.filter(({ conversa }) => !(focused && conversa.id === activeId));
      if (relevantes.length === 0) return deltas;

      playBeep();
      if (!focused) {
        unseenRef.current += relevantes.reduce((total, item) => total + item.delta, 0);
        startFlash();
      }

      for (const { conversa, message } of relevantes.slice(0, MAX_TOASTS_POR_CICLO)) {
        const preview =
          String(message?.content ?? "")
            .trim()
            .slice(0, 120) || "Nova mensagem recebida";
        toast(`💬 ${conversa.cliente}`, { description: preview });
        showBrowserNotification(conversa, preview);
      }

      const restantes = relevantes.length - MAX_TOASTS_POR_CICLO;
      if (restantes > 0) {
        toast(
          `+${restantes} ${restantes === 1 ? "nova conversa" : "novas conversas"} com mensagens`,
        );
      }

      return deltas;
    },
    [showBrowserNotification, startFlash],
  );

  return {
    enabled,
    permission,
    supported: permission !== "unsupported",
    toggle,
    notify,
  };
}
