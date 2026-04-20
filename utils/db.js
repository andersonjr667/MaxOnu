const mongoose = require('mongoose');
const chalk = require('chalk');

const connectDB = async (maxRetries = 10, delay = 5000) => {
  let retries = 0;
  const connectWithRetry = async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log(chalk.green('🗄️ MongoDB connected successfully'));
    } catch (err) {
      retries++;
      console.error(chalk.red(`MongoDB connection error (${retries}/${maxRetries}):`), err.message);
      if (retries < maxRetries) {
        console.log(chalk.gray(`Retrying in ${delay}ms...`));
        setTimeout(connectWithRetry, delay * Math.pow(1.5, retries)); // exponential backoff
      } else {
        console.log(chalk.yellow('Max retries reached. Running without DB (implement fallback if needed)'));
      }
    }
  };
  connectWithRetry();

  mongoose.connection.on('error', (err) => console.error(chalk.red('DB error:'), err));
  mongoose.connection.on('disconnected', () => console.log(chalk.yellow('DB disconnected, reconnecting...')) && connectWithRetry());
};

module.exports = connectDB;

