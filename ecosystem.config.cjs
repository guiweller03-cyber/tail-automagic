module.exports = {
  apps: [
    {
      name: "mundo-pet-automacao",
      script: "npm",
      args: "run automation",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3001,
      },
      max_memory_restart: "512M",
      time: true,
    },
  ],
};
