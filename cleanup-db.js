require('dotenv').config();
const mongoose = require('mongoose');
const chalk = require('chalk').default;
const User = require('./models/User');
const Post = require('./models/Post');
const Question = require('./models/Question');
const SiteSettings = require('./models/SiteSettings');
const DpoSubmission = require('./models/DpoSubmission');

const MONGODB_URI = process.env.MONGODB_URI;

async function cleanupDatabase() {
  try {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI não está configurada no .env.');
    }

    console.log(chalk.blue('Iniciando limpeza completa do ambiente de testes...'));
    await mongoose.connect(MONGODB_URI);
    console.log(chalk.green('MongoDB conectado.'));

    const before = {
      users: await User.countDocuments(),
      posts: await Post.countDocuments(),
      questions: await Question.countDocuments(),
      dpoSubmissions: await DpoSubmission.countDocuments()
    };

    const testUserRemoval = await User.deleteMany({ isTestData: true });
    const testPostRemoval = await Post.deleteMany({ isTestData: true });

    const nonAdminReset = await User.updateMany(
      { role: { $ne: 'admin' } },
      {
        $set: {
          committee: null,
          country: '',
          partner: '',
          delegationMembers: [],
          invitations: [],
          registration: {
            firstChoice: null,
            secondChoice: null,
            thirdChoice: null,
            teamSize: 2,
            submittedAt: null
          }
        }
      }
    );

    const adminReset = await User.updateMany(
      { role: 'admin' },
      {
        $set: {
          committee: null,
          country: '',
          partner: '',
          delegationMembers: [],
          invitations: [],
          registration: {
            firstChoice: null,
            secondChoice: null,
            thirdChoice: null,
            teamSize: 2,
            submittedAt: null
          }
        }
      }
    );

    const postsRemoval = await Post.deleteMany({});
    const questionsRemoval = await Question.deleteMany({});
    const dpoRemoval = await DpoSubmission.deleteMany({});

    await SiteSettings.findOneAndUpdate(
      { singletonKey: 'main' },
      {
        singletonKey: 'main',
        publicDelegationsReleased: false,
        registrationManuallyClosed: false
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const after = {
      users: await User.countDocuments(),
      posts: await Post.countDocuments(),
      questions: await Question.countDocuments(),
      dpoSubmissions: await DpoSubmission.countDocuments()
    };

    console.log(chalk.green('\nLimpeza concluída com sucesso.'));
    console.log(chalk.gray(`Usuários totais antes: ${before.users} | depois: ${after.users}`));
    console.log(chalk.gray(`Posts antes: ${before.posts} | depois: ${after.posts}`));
    console.log(chalk.gray(`Perguntas antes: ${before.questions} | depois: ${after.questions}`));
    console.log(chalk.gray(`DPOs antes: ${before.dpoSubmissions} | depois: ${after.dpoSubmissions}`));
    console.log(chalk.gray(`Usuários de teste removidos: ${testUserRemoval.deletedCount}`));
    console.log(chalk.gray(`Posts de teste removidos: ${testPostRemoval.deletedCount}`));
    console.log(chalk.gray(`Usuários não-admin resetados: ${nonAdminReset.modifiedCount}`));
    console.log(chalk.gray(`Usuários admin resetados: ${adminReset.modifiedCount}`));
    console.log(chalk.gray(`Posts removidos no reset final: ${postsRemoval.deletedCount}`));
    console.log(chalk.gray(`Perguntas removidas: ${questionsRemoval.deletedCount}`));
    console.log(chalk.gray(`Envios de DPO removidos: ${dpoRemoval.deletedCount}`));
    console.log(chalk.gray('Configurações da plataforma resetadas (inscrições abertas e liberação pública desligada).'));
    process.exit(0);
  } catch (error) {
    console.error(chalk.red('Erro ao limpar dados de teste:'));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

cleanupDatabase();
