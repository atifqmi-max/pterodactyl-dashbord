function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) return next();
  req.flash('error', 'Please login first.');
  return res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.is_admin) return next();
  req.flash('error', 'Admins only.');
  return res.redirect('/dashboard');
}

module.exports = { isAuthenticated, isAdmin };
