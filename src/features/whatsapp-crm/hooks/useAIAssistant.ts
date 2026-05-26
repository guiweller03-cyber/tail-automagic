import { useCallback, useEffect, useState } from "react";

const KEY = "wcrm:ai-assistant";

export function useAIAssistant() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(KEY) !== "0";
  });

  useEffect(() => {
    window.localStorage.setItem(KEY, enabled ? "1" : "0");
  }, [enabled]);

  const toggleAIAssistant = useCallback(() => setEnabled((v) => !v), []);

  return { aiEnabled: enabled, toggleAIAssistant, setAIEnabled: setEnabled };
}
