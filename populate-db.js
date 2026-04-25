require('dotenv').config();
const mongoose = require('mongoose');
const chalk = require('chalk').default;
const User = require('./models/User');
const Post = require('./models/Post');
const Question = require('./models/Question');
const SiteSettings = require('./models/SiteSettings');

const MONGODB_URI = process.env.MONGODB_URI;
const TEST_PASSWORD = 'senha123';
const isHeavyMode = process.argv.includes('--heavy');

const baseCandidates = [
  { username: 'ana.carvalho', fullName: 'Ana Carvalho', email: 'ana.carvalho@example.com', gender: 'feminino', classGroup: 'Sta Ines - 1 Serie A' },
  { username: 'bruno.melo', fullName: 'Bruno Melo', email: 'bruno.melo@example.com', gender: 'masculino', classGroup: 'Sta Ines - 1 Serie A' },
  { username: 'clara.souza', fullName: 'Clara Souza', email: 'clara.souza@example.com', gender: 'feminino', classGroup: 'Palmares - 1 Serie B' },
  { username: 'davi.rocha', fullName: 'Davi Rocha', email: 'davi.rocha@example.com', gender: 'masculino', classGroup: 'Palmares - 1 Serie B' },
  { username: 'elisa.neves', fullName: 'Elisa Neves', email: 'elisa.neves@example.com', gender: 'feminino', classGroup: 'Sta Ines - 2 Serie A' },
  { username: 'felipe.lima', fullName: 'Felipe Lima', email: 'felipe.lima@example.com', gender: 'masculino', classGroup: 'Sta Ines - 2 Serie A' },
  { username: 'gabriela.pinto', fullName: 'Gabriela Pinto', email: 'gabriela.pinto@example.com', gender: 'feminino', classGroup: 'Palmares - 2 Serie C' },
  { username: 'henrique.costa', fullName: 'Henrique Costa', email: 'henrique.costa@example.com', gender: 'masculino', classGroup: 'Palmares - 2 Serie C' },
  { username: 'isabela.freitas', fullName: 'Isabela Freitas', email: 'isabela.freitas@example.com', gender: 'feminino', classGroup: 'Sta Ines - 9 ano A' },
  { username: 'joao.ribeiro', fullName: 'João Ribeiro', email: 'joao.ribeiro@example.com', gender: 'masculino', classGroup: 'Sta Ines - 9 ano A' },
  { username: 'karina.almeida', fullName: 'Karina Almeida', email: 'karina.almeida@example.com', gender: 'feminino', classGroup: 'Palmares - 9 ano B' },
  { username: 'lucas.gomes', fullName: 'Lucas Gomes', email: 'lucas.gomes@example.com', gender: 'masculino', classGroup: 'Palmares - 9 ano B' },
  { username: 'mariana.teixeira', fullName: 'Mariana Teixeira', email: 'mariana.teixeira@example.com', gender: 'feminino', classGroup: 'Sta Ines - 8 ano A' },
  { username: 'nicolas.martins', fullName: 'Nicolas Martins', email: 'nicolas.martins@example.com', gender: 'masculino', classGroup: 'Sta Ines - 8 ano A' }
];

const testStaff = [
  {
    username: 'orientador.teste',
    fullName: 'Orientador de Teste',
    email: 'orientador.teste@example.com',
    password: TEST_PASSWORD,
    gender: 'prefiro-nao-informar',
    role: 'teacher',
    classGroup: 'Orientação',
    country: 'Brasil',
    termsAccepted: true,
    termsAcceptedAt: new Date(),
    isTestData: true
  },
  {
    username: 'coordenacao.teste',
    fullName: 'Coordenação de Teste',
    email: 'coordenacao.teste@example.com',
    password: TEST_PASSWORD,
    gender: 'prefiro-nao-informar',
    role: 'coordinator',
    classGroup: 'Coordenação',
    country: 'Brasil',
    termsAccepted: true,
    termsAcceptedAt: new Date(),
    isTestData: true
  },
  {
    username: 'imprensa.teste',
    fullName: 'Imprensa de Teste',
    email: 'imprensa.teste@example.com',
    password: TEST_PASSWORD,
    gender: 'prefiro-nao-informar',
    role: 'press',
    classGroup: 'Imprensa',
    country: 'Brasil',
    termsAccepted: true,
    termsAcceptedAt: new Date(),
    isTestData: true
  }
];

const defaultDelegationPlans = [
  { usernames: ['ana.carvalho', 'bruno.melo'], teamSize: 2, first: 2, second: 6, third: 1, committee: 2, country: 'Canadá' },
  { usernames: ['clara.souza', 'davi.rocha'], teamSize: 2, first: 3, second: 2, third: 5, committee: 3, country: 'Chile' },
  { usernames: ['elisa.neves', 'felipe.lima'], teamSize: 2, first: 1, second: 4, third: 6, committee: 1, country: 'França' },
  { usernames: ['gabriela.pinto', 'henrique.costa'], teamSize: 2, first: 6, second: 2, third: 3, committee: 6, country: 'Reino Unido' },
  { usernames: ['isabela.freitas', 'joao.ribeiro'], teamSize: 2, first: 5, second: 7, third: 1, committee: 5, country: 'Itália' },
  { usernames: ['karina.almeida', 'lucas.gomes'], teamSize: 2, first: 4, second: 7, third: 2, committee: 4, country: 'Argentina' },
  { usernames: ['mariana.teixeira', 'nicolas.martins'], teamSize: 2, first: 7, second: 4, third: 5, committee: 7, country: 'México' }
];

const heavyCandidateTarget = 72;
const heavyClassGroupsFundamental = [
  'Sta Ines - 8 ano A',
  'Sta Ines - 8 ano B',
  'Palmares - 9 ano A',
  'Palmares - 9 ano B'
];
const heavyClassGroupsEm = [
  'Sta Ines - Ensino Medio 1 Serie A',
  'Sta Ines - Ensino Medio 2 Serie A',
  'Palmares - Ensino Medio 2 Serie B',
  'Palmares - Ensino Medio 3 Serie A'
];
const countryPool = [
  'Alemanha', 'Austrália', 'Áustria', 'Bélgica', 'Bolívia', 'Canadá', 'Chile', 'Colômbia', 'Coreia do Sul', 'Costa Rica',
  'Dinamarca', 'Egito', 'Espanha', 'Estados Unidos', 'Finlândia', 'França', 'Gana', 'Grécia', 'Índia', 'Indonésia',
  'Irlanda', 'Israel', 'Itália', 'Japão', 'Marrocos', 'México', 'Nigéria', 'Noruega', 'Nova Zelândia', 'Países Baixos',
  'Panamá', 'Paraguai', 'Peru', 'Polônia', 'Portugal', 'Quênia', 'Reino Unido', 'República Tcheca', 'Suécia', 'Suíça',
  'Tailândia', 'Tunísia', 'Turquia', 'Ucrânia', 'Uruguai', 'Vietnã'
];

function normalizeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getEducationSegmentFromClassGroup(classGroup = '') {
  const normalized = normalizeText(classGroup);

  if (
    normalized.includes('8o') ||
    normalized.includes('8 ano') ||
    normalized.includes('9o') ||
    normalized.includes('9 ano') ||
    normalized.includes('8 e 9') ||
    normalized.includes('8/9')
  ) {
    return 'fundamental';
  }

  if (
    normalized.includes('ensino medio') ||
    normalized.includes('medio') ||
    /\bem\b/.test(normalized) ||
    /\b[123]\s*serie\b/.test(normalized)
  ) {
    return 'em';
  }

  return '';
}

function getFundamentalYear(classGroup = '') {
  const normalized = normalizeText(classGroup);
  if (normalized.includes('8 ano') || normalized.includes('8o') || normalized.includes('8º')) {
    return 8;
  }
  if (normalized.includes('9 ano') || normalized.includes('9o') || normalized.includes('9º')) {
    return 9;
  }
  return null;
}

function buildHeavyCandidates(existingCandidates) {
  const generated = [];
  const remaining = Math.max(heavyCandidateTarget - existingCandidates.length, 0);
  const fundamentalCount = Math.floor(remaining / 2);
  const emCount = remaining - fundamentalCount;
  const baseIndex = 1;

  for (let i = 0; i < fundamentalCount; i += 1) {
    const seq = baseIndex + i;
    generated.push({
      username: `teste.fund.${String(seq).padStart(3, '0')}`,
      fullName: `Candidato Fundamental ${seq}`,
      email: `teste.fund.${String(seq).padStart(3, '0')}@example.com`,
      gender: i % 2 === 0 ? 'feminino' : 'masculino',
      classGroup: heavyClassGroupsFundamental[i % heavyClassGroupsFundamental.length]
    });
  }

  for (let i = 0; i < emCount; i += 1) {
    const seq = baseIndex + i;
    generated.push({
      username: `teste.em.${String(seq).padStart(3, '0')}`,
      fullName: `Candidato Ensino Medio ${seq}`,
      email: `teste.em.${String(seq).padStart(3, '0')}@example.com`,
      gender: i % 2 === 0 ? 'feminino' : 'masculino',
      classGroup: heavyClassGroupsEm[i % heavyClassGroupsEm.length]
    });
  }

  return generated;
}

function getUniqueCommitteeChoices(seed) {
  const values = [];
  let offset = 0;

  while (values.length < 3) {
    const candidate = ((seed + offset) % 7) + 1;
    if (!values.includes(candidate)) {
      values.push(candidate);
    }
    offset += 2;
  }

  return values;
}

function buildPairPlansFromMembers(members, startOffset = 0) {
  const plans = [];
  let offset = startOffset;

  for (let index = 0; index + 1 < members.length; index += 2) {
    const pair = [members[index], members[index + 1]];
    const [first, second, third] = getUniqueCommitteeChoices(offset);
    plans.push({
      usernames: pair.map((member) => member.username),
      teamSize: 2,
      first,
      second,
      third,
      committee: first,
      country: countryPool[offset % countryPool.length]
    });
    offset += 1;
  }

  return plans;
}

function buildHeavyDelegationPlans(allCandidates) {
  const fundamentalCandidates = allCandidates.filter((candidate) => getEducationSegmentFromClassGroup(candidate.classGroup) === 'fundamental');
  const emCandidates = allCandidates.filter((candidate) => getEducationSegmentFromClassGroup(candidate.classGroup) === 'em');

  const fundamental8 = fundamentalCandidates.filter((candidate) => getFundamentalYear(candidate.classGroup) === 8);
  const fundamental9 = fundamentalCandidates.filter((candidate) => getFundamentalYear(candidate.classGroup) === 9);
  const fundamentalsOther = fundamentalCandidates.filter((candidate) => ![8, 9].includes(getFundamentalYear(candidate.classGroup)));

  const mixedFundamentalPairs = [];
  const stack8 = [...fundamental8];
  const stack9 = [...fundamental9];
  while (stack8.length && stack9.length) {
    mixedFundamentalPairs.push(stack8.shift(), stack9.shift());
  }

  const remainingFundamental = [...stack8, ...stack9, ...fundamentalsOther];
  const fundamentalPlans = [
    ...buildPairPlansFromMembers(mixedFundamentalPairs, 0),
    ...buildPairPlansFromMembers(remainingFundamental, Math.ceil(mixedFundamentalPairs.length / 2))
  ];

  const emPlans = buildPairPlansFromMembers(emCandidates, fundamentalPlans.length);
  return [...fundamentalPlans, ...emPlans];
}

const testPosts = [
  {
    title: 'Comunicado de teste da coordenação',
    excerpt: 'Post criado automaticamente para validar listagem e permissões do blog.',
    content: 'Este conteúdo faz parte da massa de testes da plataforma MaxOnu 2026.',
    authorName: 'coordenacao.teste',
    authorRole: 'coordinator',
    published: true,
    isTestData: true
  },
  {
    title: 'Cobertura experimental da imprensa',
    excerpt: 'Exemplo de publicação criada pelo script de popular banco.',
    content: 'Use este post para testar cards, imagens opcionais e permissões de publicação.',
    authorName: 'imprensa.teste',
    authorRole: 'press',
    published: true,
    isTestData: true
  }
];

const testQuestions = [
  {
    question: 'Como funciona a alocação final dos comitês na MaxOnu?',
    answer: 'Sem Resposta ainda!',
    answered: false
  },
  {
    question: 'Quando a coordenação libera os países das delegações?',
    answer: 'Sem Resposta ainda!',
    answered: false
  }
];

function createCandidatePayload(base, index) {
  return {
    username: base.username,
    fullName: base.fullName,
    email: base.email,
    password: TEST_PASSWORD,
    gender: base.gender,
    role: 'candidate',
    classGroup: base.classGroup,
    country: '',
    committee: null,
    partner: '',
    registration: {
      firstChoice: null,
      secondChoice: null,
      thirdChoice: null,
      teamSize: 2,
      submittedAt: null
    },
    invitations: [],
    delegationMembers: [],
    termsAccepted: true,
    termsAcceptedAt: new Date(Date.now() - (index + 1) * 3600000),
    isTestData: true
  };
}

async function createOrResetTestUser(payload) {
  const existing = await User.findOne({ $or: [{ username: payload.username }, { email: payload.email }] });
  if (!existing) {
    const user = new User(payload);
    await user.save();
    return user;
  }

  Object.assign(existing, payload);
  await existing.save();
  return existing;
}

async function seedDelegations(usersByUsername, plans) {
  let applied = 0;

  for (const plan of plans) {
    const members = plan.usernames
      .map((username) => usersByUsername.get(username))
      .filter(Boolean);

    if (members.length !== plan.usernames.length) {
      continue;
    }

    const ids = members.map((member) => member._id);
    const memberNames = members.map((member) => member.fullName).join(' e ');
    const submittedAt = new Date(Date.now() - (applied + 2) * 86400000);

    for (const member of members) {
      member.delegationMembers = ids.filter((id) => String(id) !== String(member._id));
      member.partner = memberNames;
      member.country = plan.country;
      member.committee = plan.committee;
      member.registration = {
        firstChoice: plan.first,
        secondChoice: plan.second,
        thirdChoice: plan.third,
        teamSize: plan.teamSize,
        submittedAt
      };
      member.invitations = [];
      await member.save();
    }

    applied += 1;
  }

  return applied;
}

async function populateDatabase() {
  try {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI não está configurada no .env.');
    }

    console.log(chalk.blue(`Iniciando população ${isHeavyMode ? 'heavy' : 'padrão'} do banco para testes...`));
    await mongoose.connect(MONGODB_URI);
    console.log(chalk.green('MongoDB conectado.'));

    const candidates = isHeavyMode
      ? [...baseCandidates, ...buildHeavyCandidates(baseCandidates)]
      : baseCandidates;
    const delegationPlans = isHeavyMode
      ? buildHeavyDelegationPlans(candidates)
      : defaultDelegationPlans;

    const usersByUsername = new Map();
    let createdCandidates = 0;
    for (let index = 0; index < candidates.length; index += 1) {
      const payload = createCandidatePayload(candidates[index], index);
      const user = await createOrResetTestUser(payload);
      usersByUsername.set(user.username, user);
      createdCandidates += 1;
    }

    let createdStaff = 0;
    for (const payload of testStaff) {
      const user = await createOrResetTestUser(payload);
      usersByUsername.set(user.username, user);
      createdStaff += 1;
    }

    const seededDelegations = await seedDelegations(usersByUsername, delegationPlans);

    await Post.deleteMany({ isTestData: true });
    await Post.insertMany(testPosts);

    await Question.deleteMany({});
    await Question.insertMany(testQuestions);

    await SiteSettings.findOneAndUpdate(
      { singletonKey: 'main' },
      {
        singletonKey: 'main',
        publicDelegationsReleased: false,
        registrationManuallyClosed: false
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(chalk.blue('\nResumo da população:'));
    console.log(chalk.gray(`Modo: ${isHeavyMode ? 'heavy' : 'padrão'}`));
    console.log(chalk.gray(`Candidatos de teste preparados: ${createdCandidates}`));
    console.log(chalk.gray(`Equipe de teste preparada: ${createdStaff}`));
    console.log(chalk.gray(`Delegações com inscrição aplicada: ${seededDelegations}`));
    console.log(chalk.gray(`Posts de teste: ${testPosts.length}`));
    console.log(chalk.gray(`Perguntas pendentes de teste: ${testQuestions.length}`));
    console.log(chalk.gray(`Senha padrão dos usuários de teste: ${TEST_PASSWORD}`));
    process.exit(0);
  } catch (error) {
    console.error(chalk.red('Erro ao popular banco de dados de teste:'));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

populateDatabase();
