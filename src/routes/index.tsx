import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

// Render the shell at "/" too via a wrapper component
function Home() {
  return <AppShell />;
}

export const Route = createFileRoute("/")({
  component: Home,
});
