const path = require('path');

/**
 * Middleware que fornece rotas clean (sem .html)
 * Mapeia URLs sem extensão para seus arquivos HTML correspondentes
 */
function cleanUrlsMiddleware(publicDir) {
  const routeMap = {
    '/': 'index.html',
    '/blog': 'blog.html',
    '/guias': 'guias.html',
    '/faq': 'perguntas-comuns.html',
    '/perguntas': 'perguntas-comuns.html', // alias alternativo
    '/inscricao': 'inscricao.html',
    '/registro': 'inscricao.html', // alias alternativo
    '/delegacoes': 'delegacoes.html',
    '/dashboard': 'dashboard.html',
    '/perfil': 'profile.html',
    '/profile': 'profile.html', // alias
    '/login': 'login.html',
    '/admin': 'admin.html',
    '/imprensa': 'imprensa.html',
    '/imprensa-dashboard': 'imprensa-dashboard.html',
    '/orientadores': 'orientadores.html',
    '/coordenacao': 'coordenacao.html',
    '/dpos': 'dpos.html',
    '/regras': 'regras.html',
    '/blog-post': 'create-post.html'
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
