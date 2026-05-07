const mongoose = require('mongoose');
const chalk = require('chalk');
const chalkSafe = chalk?.default ? chalk.default : chalk;


const connectDB = async (maxRetries = 10, delay = 5000) => {
  let retries = 0;
  const connectWithRetry = async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log(chalkSafe.green('🗄️ MongoDB connected successfully'));
    } catch (err) {
      retries++;
      console.error(chalkSafe.red(`MongoDB connection error (${retries}/${maxRetries}):`), err.message);
      if (retries < maxRetries) {
        console.log(chalkSafe.gray(`Retrying in ${delay}ms...`));
        setTimeout(connectWithRetry, delay * Math.pow(1.5, retries)); // exponential backoff
      } else {
        console.log(chalk.yellow('Max retries reached. Running without DB (implement fallback if needed)'));
      }
    }
  };
  connectWithRetry();

  mongoose.connection.on('error', (err) => console.error(chalkSafe.red('DB error:'), err));
  mongoose.connection.on('disconnected', () => console.log(chalkSafe.yellow('DB disconnected, reconnecting...')) && connectWithRetry());
};

module.exports = connectDB;

