// Ponto de entrada: só sobe o servidor, agenda tarefas e trata encerramento.
const { PORT } = require('./src/config');
const { app, assinaturaRouter } = require('./src/app');
const { iniciarJobs } = require('./src/jobs');

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

const servidor = app.listen(PORT, () => console.log(`MinutoCerto servidor na porta ${PORT}`));
servidor.requestTimeout = 60000;
servidor.headersTimeout = 30000;
servidor.keepAliveTimeout = 65000;

const parar = iniciarJobs(assinaturaRouter);

function encerrar(sinal) {
  console.log(`[${sinal}] encerrando...`);
  parar();
  servidor.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));