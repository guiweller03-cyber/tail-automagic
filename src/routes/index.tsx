import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/pages/Dashboard";
import type { DashboardData } from "@/lib/crm-supabase";

const dashboardQueryKey = ["crm", "dashboard"] as const;

async function fetchDashboard(): Promise<DashboardData | null> {
  try {
    const res = await fetch("/api/crm/dashboard", { cache: "no-store" });
    if (res.ok) return (await res.json()) as DashboardData;
  } catch {
    return null;
  }

  return null;
}

export const Route = createFileRoute("/")({
  component: Dashboard,
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData({
      queryKey: dashboardQueryKey,
      queryFn: fetchDashboard,
      staleTime: 15_000,
    });
  },
});
