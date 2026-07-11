module.exports = {
  apps: [
    {
      name: "mundo-pet-automacao",
      script: "npm",
      args: "run automation",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3001,
      },
      max_memory_restart: "512M",
      time: true,
    },
    {
      // Agendador de follow-ups: processo separado, Node puro (sem aliases
      // "@/", sem tsx) para nao depender da resolucao de path que falha para
      // o mundo-pet-automacao em alguns setups de VPS. Ver followups-worker.mjs.
      name: "followups-worker",
      script: "followups-worker.mjs",
      cwd: __dirname,
      node_args: "--env-file=.env",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "256M",
      time: true,
    },
  ],
};
