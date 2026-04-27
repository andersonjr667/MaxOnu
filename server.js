require('dotenv').config();

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = process.env.npm_lifecycle_event === 'dev' ? 'development' : 'production';
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const chalk = require('chalk').default;
const figlet = require('figlet');
const User = require('./models/User');
const authRoutes = require('./routes/auth');
const delegationRoutes = require('./routes/delegations');
const postRoutes = require('./routes/posts');
const questionRoutes = require('./routes/questions');
const userRoutes = require('./routes/users');
const exportRoutes = require('./routes/export');
const settingsRoutes = require('./routes/settings');
const dpoRoutes = require('./routes/dpos');
const { shareMetaMiddleware } = require('./middleware/share-meta');
const cleanUrlsMiddleware = require('./middleware/clean-urls');
const { COMMITTEE_REVEAL_DATE } = require('./utils/event-config');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const publicDir = path.join(__dirname, 'public');
const parsedEnvPort = Number.parseInt(process.env.PORT, 10);
const DEFAULT_PORT = Number.isInteger(parsedEnvPort) ? parsedEnvPort : 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEFAULT_ADMIN = {
  username: 'andersonjr0667',
  fullName: 'Anderson (Admin)',
  password: '152070an',
  email: 'alsj1520@gmail.com',
  role: 'admin',
  classGroup: 'Administracao'
};
let serverInstance;
let PORT = DEFAULT_PORT;
const COMMITTEE_PAGES = new Set([
  '/delegacao-agnu-8-9.html',
  '/delegacao-agnu-em.html',
  '/delegacao-csnu-8-9.html',
  '/delegacao-csnu-em.html',
  '/delegacao-oea-8-9.html',
  '/delegacao-oea-em.html'
]);
const COMMITTEE_DATA = [
  {
    id: 1,
    displayName: 'Conselho de Direitos Humanos (CDH - 2026)',
    shortTitle: '(CDH - 2026)',
    title: 'O Paradoxo da Hiperconectividade: Regulamentação da Vigilância Massiva, Ética da Inteligência Artificial e Proteção da Democracia na Era do Big Data'
  },
  {
    id: 2,
    displayName: 'Assembleia Geral das Nações Unidas (AGNU)',
    shortTitle: '(AGNU)',
    title: 'Guerra, Multipolaridade e Disputas Territoriais: Desafios à Soberania, Segurança Global e Justiça Internacional no Século XXI'
  },
  {
    id: 3,
    displayName: 'Alto Comissariado das Nações Unidas para Refugiados (ACNUR)',
    shortTitle: '(ACNUR - Alto Comissariado das Nações Unidas para Refugiados)',
    title: 'Proteção e garantia de direitos de pessoas em situação de mobilidade humana em contextos de crises humanitárias'
  },
  {
    id: 4,
    displayName: 'Bioética e Genética Humana',
    shortTitle: 'Bioética e Genética Humana',
    title: 'Impactos globais da tecnologia de manipulação e edição genética e seus desafios éticos quanto à dignidade humana e aos direitos das futuras gerações'
  },
  {
    id: 5,
    displayName: 'Nova Ordem Global',
    shortTitle: 'Nova Ordem Global',
    title: 'A Nova Ordem Global em Disputa: Recursos Estratégicos, Poder e os Limites do Capitalismo no Século XXI'
  },
  {
    id: 6,
    displayName: 'Conselho de Direitos Humanos das Nações Unidas (UNHRC)',
    shortTitle: '(UNHRC - Conselho de Direitos Humanos das Nações Unidas)',
    title: 'Identidade, memória e poder: disputas culturais e garantia de direitos em um mundo globalizado'
  },
  {
    id: 7,
    displayName: 'Organização das Nações Unidas para as Mulheres (ONU Mulheres)',
    shortTitle: '(ONU MULHERES)',
    title: ''
  }
];

function isDbReady() {
  return mongoose.connection.readyState === 1;
}

function buildRateLimitMessage(message) {
  return {
    error: message,
    retryAfter: '15 minutes'
  };
}

function createApiLimiter(options) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
    handler: (req, res) => {
      res.status(429).json(buildRateLimitMessage(options.message));
    }
  });
}

function setStaticCacheHeaders(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const longCacheExtensions = new Set(['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.pdf']);

  if (longCacheExtensions.has(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    return;
  }

  if (ext === '.html') {
    res.setHeader('Cache-Control', 'public, max-age=300');
  }
}

async function ensureAdminUser() {
  const existingUser = await User.findOne({
    $or: [
      { username: DEFAULT_ADMIN.username },
      { email: DEFAULT_ADMIN.email }
    ]
  });

  if (!existingUser) {
    const adminUser = new User(DEFAULT_ADMIN);
    await adminUser.save();
    console.log(chalk.green(`Admin user ${DEFAULT_ADMIN.username} created.`));
    return;
  }

  let hasChanges = false;

  if (existingUser.username !== DEFAULT_ADMIN.username) {
    existingUser.username = DEFAULT_ADMIN.username;
    hasChanges = true;
  }

  if (existingUser.email !== DEFAULT_ADMIN.email) {
    existingUser.email = DEFAULT_ADMIN.email;
    hasChanges = true;
  }

  if (existingUser.role !== DEFAULT_ADMIN.role) {
    existingUser.role = DEFAULT_ADMIN.role;
    hasChanges = true;
  }

  if (!existingUser.fullName || existingUser.fullName.trim() === '') {
    existingUser.fullName = DEFAULT_ADMIN.fullName;
    hasChanges = true;
  }

  const passwordMatches = await existingUser.comparePassword(DEFAULT_ADMIN.password);
  if (!passwordMatches) {
    existingUser.password = DEFAULT_ADMIN.password;
    hasChanges = true;
  }

  if (hasChanges) {
    await existingUser.save();
    console.log(chalk.green(`Admin user ${DEFAULT_ADMIN.username} synchronized.`));
  }
}

// Simplified startup banner - no complex colors to avoid issues
async function startServer(port) {
const banner = figlet.textSync('MaxOnu 2026', { horizontalLayout: 'full' });
  console.log(chalk.green.bold(banner));
  console.log(chalk.blue.bold('🚀 Starting on port ' + port));
  console.log(chalk.magenta.bold('Mode: ' + process.env.NODE_ENV));
  console.log(chalk.gray('DB Ready: ' + isDbReady()));
  console.log(chalk.gray('PID: ' + process.pid));

  serverInstance = app.listen(port, () => {
console.log(chalk.green.bold('✅ Server ready on http://localhost:' + port));
    console.log(chalk.cyan.bold('Health: http://localhost:' + port + '/health'));
  });

  serverInstance.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(chalk.yellow('Port ' + port + ' in use, trying ' + (port + 1)));
      PORT = port + 1;
      startServer(PORT);
    } else {
      console.error(chalk.red('Server error:'), err);
      process.exit(1);
    }
  });
}

// Graceful shutdown
const gracefulShutdown = () => {
  console.log(chalk.yellow('Shutting down gracefully'));
  serverInstance.close(() => {
    mongoose.connection.close(() => {
      console.log(chalk.green('DB closed'));
      process.exit(0);
    });
  });
};
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Env validation
const envSchema = Joi.object({
  JWT_SECRET: Joi.string().required(),
  MONGODB_URI: Joi.string().uri().required()
}).unknown();
const { error } = envSchema.validate(process.env);
if (error) {
  console.error(chalk.red('Env error:'), error.details[0].message);
  process.exit(1);
}

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "img-src": ["'self'", "data:", "blob:", "https://res.cloudinary.com"]
    }
  }
}));
if (!IS_PRODUCTION) {
  app.use(morgan('dev'));
}
app.use(compression({
  level: 6,
  threshold: 1024
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const publicApiLimiter = createApiLimiter({
  max: 1000,
  message: 'Muitas requisicoes em pouco tempo. Tente novamente em alguns minutos.',
  skip: (req) => req.path === '/health' || req.method !== 'GET'
});

const writeApiLimiter = createApiLimiter({
  max: 120,
  message: 'Muitas acoes enviadas em pouco tempo. Aguarde um pouco antes de tentar novamente.',
  skip: (req) => req.method === 'GET'
});

const authApiLimiter = createApiLimiter({
  max: 20,
  message: 'Muitas tentativas de autenticacao. Aguarde alguns minutos antes de tentar novamente.'
});

app.use('/api', publicApiLimiter);
app.use('/api', writeApiLimiter);
app.use(
  ['/api/login', '/api/register', '/api/check-admin', '/api/forgot-password', '/api/verify-reset-code', '/api/reset-password', '/api/verify-2fa-login'],
  authApiLimiter
);

// Health
app.get('/health', (req, res) => res.json({
  status: 'OK',
  db: isDbReady(),
  uptime: process.uptime()
}));

// Committee routes
app.get('/api/reveal-status', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({
    revealed: Date.now() >= COMMITTEE_REVEAL_DATE.getTime(),
    revealDate: COMMITTEE_REVEAL_DATE.toISOString()
  });
});

app.get('/api/committees', (req, res) => {
  const revealed = Date.now() >= COMMITTEE_REVEAL_DATE.getTime();
  res.setHeader('Cache-Control', revealed ? 'public, max-age=3600' : 'public, max-age=300');
  if (!revealed) {
    return res.status(403).json({ message: 'Sigilo' });
  }
  res.json({ revealed, committees: COMMITTEE_DATA });
});

app.use('/api', authRoutes);
app.use('/api/delegation', delegationRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/dpos', dpoRoutes);

// Share meta tags middleware para melhorar compartilhamento em redes sociais
app.use(shareMetaMiddleware(publicDir));

// Clean URLs middleware - remove extensão .html e oferece rotas amigáveis
app.use(cleanUrlsMiddleware(publicDir));

app.use((req, res, next) => {
  if (COMMITTEE_PAGES.has(req.path)) return res.redirect('/delegacoes');
  next();
});

// Static
app.use(express.static(publicDir, {
  etag: true,
  maxAge: '7d',
  setHeaders: setStaticCacheHeaders
}));

app.get('/header', (req, res) => res.sendFile(path.join(publicDir, 'header.html')));
app.get('/footer', (req, res) => res.sendFile(path.join(publicDir, 'footer.html')));

// MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(chalk.green('MongoDB connected'));
    await ensureAdminUser();
  } catch (err) {
    console.error(chalk.red('MongoDB error:'), err);
    setTimeout(connectDB, 5000);
  }
};

mongoose.connection.on('disconnected', connectDB);

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Server error' });
  }
  next(err);
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// 404
app.use((req, res) => res.status(404).sendFile(path.join(publicDir, '404.html')));

// Init
connectDB();
startServer(PORT);
