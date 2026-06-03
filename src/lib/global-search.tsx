import { createContext, useContext } from "react";

type GlobalSearchContextValue = {
  query: string;
  setQuery: (query: string) => void;
};

export const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null);

export function useGlobalSearch() {
  const context = useContext(GlobalSearchContext);

  if (!context) {
    return { query: "", setQuery: () => undefined };
  }

  return context;
}
