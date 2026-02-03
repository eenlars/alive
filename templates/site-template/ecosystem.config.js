module.exports = {
  apps: [
    {
      name: "vite-template",
      script: "bun",
      args: "run dev",
      interpreter: "none",
      cwd: "./user",
      watch: ["src/", "index.html", "vite.config.ts", "tailwind.config.ts", "postcss.config.js"],
      ignore_watch: ["node_modules", "dist", "bun.lock", "pnpm-lock.yaml"],
      env: {
        NODE_ENV: "development",
        PORT: 8080,
      },
    },
  ],
}
