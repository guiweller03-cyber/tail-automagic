import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Dashboard } from "@/pages/Dashboard";
import { carregarDashboard } from "@/lib/crm-supabase";

const dashboardQueryKey = ["crm", "dashboard"] as const;

const fetchDashboard = createServerFn({ method: "GET" }).handler(() => carregarDashboard());

export const Route = createFileRoute("/")({
  component: DashboardRoute,
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData({
      queryKey: dashboardQueryKey,
      queryFn: fetchDashboard,
      staleTime: 15_000,
    });
  },
});

function DashboardRoute() {
  const data = Route.useLoaderData();
  return <Dashboard data={data} />;
}
