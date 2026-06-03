import { useCallback, useEffect, useRef, useState } from "react";

export function useAIAssistant(initialStatus: boolean = true) {
  const [enabled, setEnabled] = useState<boolean>(initialStatus);
  const [saving, setSaving] = useState(false);
  const latestEnabled = useRef(initialStatus);

  useEffect(() => {
    latestEnabled.current = enabled;
  }, [enabled]);

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      try {
        const response = await fetch("/api/crm/conversas?ia=status", { cache: "no-store" });
        if (!response.ok) return;

        const status = (await response.json()) as { globalDesativada?: boolean };
        if (!active) return;

        const nextEnabled = status.globalDesativada !== true;
        latestEnabled.current = nextEnabled;
        setEnabled(nextEnabled);
      } catch (e) {
        console.error(e);
      }
    }

    loadStatus();

    return () => {
      active = false;
    };
  }, []);

  const toggleAIAssistant = useCallback(async () => {
    if (saving) return;

    const previousState = latestEnabled.current;
    const newState = !previousState;

    setSaving(true);
    setEnabled(newState);
    latestEnabled.current = newState;

    try {
      const response = await fetch("/api/crm/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "global", desativada: !newState })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(errorBody || `Falha ao atualizar IA (${response.status})`);
      }

      const status = (await response.json()) as { globalDesativada?: boolean };
      const savedEnabled = status.globalDesativada !== true;
      latestEnabled.current = savedEnabled;
      setEnabled(savedEnabled);
    } catch (e) {
      console.error(e);
      latestEnabled.current = previousState;
      setEnabled(previousState);
    } finally {
      setSaving(false);
    }
  }, [saving]);

  return { aiEnabled: enabled, toggleAIAssistant, setAIEnabled: setEnabled, aiSaving: saving };
}
