const express = require('express');

const { apiAuth } = require('./middleware/auth');
const { errorHandler, notFound } = require('./middleware/error-handler');
const deviceRouter = require('./routes/device');
const commandsRouter = require('./routes/commands');
const { messagesRouter, sendMessage } = require('./routes/messages');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

app.get('/health', (req, res) => {
  res.json({ status: true, message: 'API aktif', uptime: process.uptime() });
});

app.use(apiAuth);
app.use('/device', deviceRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/commands', commandsRouter);

// Alias bergaya Fonnte agar integrasi cukup memanggil POST /send.
app.post('/send', sendMessage);

app.use(notFound);
app.use(errorHandler);

module.exports = { app };
