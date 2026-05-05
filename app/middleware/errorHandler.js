const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  if (req.xhr || req.headers.accept?.includes('json')) {
    return res.status(status).json({ success: false, message });
  }
  req.flash('error', message);
  res.redirect('back');
};

module.exports = errorHandler;