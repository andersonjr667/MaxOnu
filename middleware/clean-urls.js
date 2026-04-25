const fs = require('fs');
const path = require('path');

/**
 * Middleware que fornece rotas clean (sem .html)
 * Mapeia URLs sem extensão para seus arquivos HTML correspondentes
 */
function cleanUrlsMiddleware(publicDir) {
  const routeMap = {
    '/': 'index.html',
    '/blog': 'blog.html',
    '/imprensa': 'imprensa.html',
    '/instagram': 'instagram.html',
    '/guias': 'guias.html',
    '/orientadores': 'orientadores.html',
    '/coordenacao': 'coordenacao.html',
    '/dashboard': 'dashboard.html',
    '/admin': 'admin.html',
    '/admin-sync': 'admin-sync.html',
    '/faq': 'perguntas-comuns.html',
    '/perguntas': 'perguntas-comuns.html', // alias alternativo
    '/perguntas-comuns': 'perguntas-comuns.html',
    '/inscricao': 'inscricao.html',
    '/registro': 'inscricao.html', // alias alternativo
    '/delegacoes': 'delegacoes.html',
    '/perfil': 'profile.html',
    '/profile': 'profile.html', // alias
    '/login': 'login.html',
    '/forgot-password': 'forgot-password.html',
    '/reset-password': 'forgot-password.html',
    '/two-factor-auth': 'two-factor-auth.html',
    '/verify-2fa-login': 'verify-2fa-login.html',
    '/imprensa-dashboard': 'imprensa-dashboard.html',
    '/dpos': 'dpos.html',
    '/regras': 'regras.html',
    '/blog-post': 'create-post.html',
    '/create-post': 'create-post.html',
    '/termos-de-uso': 'termos-de-uso.html'
  };

  return (req, res, next) => {
    // Apenas processa requisições GET e HEAD
    if (!/^(GET|HEAD)$/.test(req.method)) {
      return next();
    }

    // Se a rota está no mapa, serve o arquivo correspondente
    if (routeMap.hasOwnProperty(req.path)) {
      const filePath = path.join(publicDir, routeMap[req.path]);
      return res.sendFile(filePath, (err) => {
        if (err) {
          next();
        }
      });
    }

    if (!path.extname(req.path)) {
      const candidateFile = path.join(publicDir, `${req.path.replace(/^\/+/, '')}.html`);
      if (fs.existsSync(candidateFile)) {
        return res.sendFile(candidateFile, (err) => {
          if (err) {
            next();
          }
        });
      }
    }

    // Se a rota tem .html, redireciona para versão sem .html
    if (req.path.endsWith('.html')) {
      const newPath = req.path.replace(/\.html$/, '');
      // Se o resultado é vazio, redireciona para /
      const redirectPath = newPath === '' ? '/' : newPath;
      return res.redirect(301, redirectPath);
    }

    next();
  };
}

module.exports = cleanUrlsMiddleware;
