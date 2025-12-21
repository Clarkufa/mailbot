module.exports = {
  apps: [
    {
      name: 'mailbot',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
