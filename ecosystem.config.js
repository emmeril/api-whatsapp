module.exports = {
  apps: [
    {
      name: 'api-whatsapp',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      exp_backoff_restart_delay: 100,
      restart_delay: 3000,
      watch: false,
      max_memory_restart: '700M',
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
