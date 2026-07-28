function notFound(req, res) {
  res.status(404).json({
    status: false,
    error: 'NOT_FOUND',
    message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan`,
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const statusCode = error.statusCode || error.status || 500;
  const publicMessage = statusCode >= 500
    ? 'Terjadi kesalahan pada server'
    : error.message;

  if (statusCode >= 500) {
    console.error(error);
  }

  return res.status(statusCode).json({
    status: false,
    error: error.code || 'REQUEST_FAILED',
    message: publicMessage,
  });
}

module.exports = { notFound, errorHandler };
