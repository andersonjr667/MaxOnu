# MaxOnu 2026

MaxOnu 2026 is a simulation of United Nations debates organized by Colégio Maximus. This event provides students with the opportunity to develop essential skills in diplomacy, negotiation, and international relations.

## Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Technologies Used](#technologies-used)
- [Setup and Installation](#setup-and-installation)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Contributing](#contributing)
- [License](#license)

## Project Overview

MaxOnu 2026 is a web application that simulates UN debates. It includes features such as user registration and login, a dashboard for administrators, and a public interface for viewing information about the event, teams, and committees.

## Features

- User registration and login
- Admin dashboard for managing questions
- Public pages for event information, team details, and committees
- Responsive design with a hamburger menu for small screens
- In-memory fallback for database operations when MongoDB is unavailable

## Technologies Used

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express.js
- **Database**: MongoDB
- **Authentication**: JWT (JSON Web Tokens)
- **Styling**: CSS (with custom properties for theming)
- **Deployment**: Render.com

## Setup and Installation

1. **Clone the repository**:
    ```bash
    git clone https://github.com/your-username/maxonu2026.git
    cd maxonu2026
    ```

2. **Install dependencies**:
    ```bash
    npm install
    ```

3. **Create a `.env` file** in the root directory and add the following environment variables:
    ```plaintext
    PORT=3000
    MONGODB_URI=your-mongodb-uri
    JWT_SECRET=your-jwt-secret
    ```

## Environment Variables

- `PORT`: The port on which the server will run.
- `MONGODB_URI`: The connection string for your MongoDB database.
- `JWT_SECRET`: The secret key used for signing JWT tokens.

## Render Deploy

1. Create a new `Web Service` on Render connected to this repository.
2. Render can detect [render.yaml](/workspace/c:\Users\User\OneDrive\Área de Trabalho\Nova pasta (6)\Geral\Codes\HTML\MaxOnu2025\render.yaml) automatically, or you can configure manually with:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/health`
3. Add these environment variables in Render:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `NODE_ENV=production`
4. Keep MongoDB accessible from Render. If you use MongoDB Atlas, allow Render's outbound IPs or use the recommended secure access method from Atlas.
5. After deploy, test:
   - `/health`
   - login
   - profile edit
   - registration flow

The app now requires `MONGODB_URI` and `JWT_SECRET` to start, which is safer for production and avoids a partially broken deploy.

## Running the Application

1. **Start the server**:
    ```bash
    npm start
    ```

2. **Access the application**:
    Open your browser and navigate to `http://localhost:3000`.

## Project Structure

```
maxonu2026/
├── models/
│   ├── Question.js
│   └── User.js
├── public/
│   ├── css/
│   │   └── styles.css
│   ├── images/
│   ├── js/
│   │   ├── auth.js
│   │   ├── countdown.js
│   │   ├── includes.js
│   │   └── questions.js
│   ├── blog.html
│   ├── dashboard.html
│   ├── delegacao-agnu-8-9.html
│   ├── delegacao-agnu-em.html
│   ├── delegacao-csnu-8-9.html
│   ├── delegacao-csnu-em.html
│   ├── delegacao-oea-8-9.html
│   ├── delegacao-oea-em.html
│   ├── delegacoes.html
│   ├── dpos.html
│   ├── footer.html
│   ├── guias.html
│   ├── header.html
│   ├── index.html
│   ├── instagram.html
│   ├── login.html
│   ├── perguntas-comuns.html
│   └── regras.html
├── .env
├── .gitignore
├── package.json
├── README.md
└── server.js
```

## API Endpoints

### User Authentication

- **POST** `/api/register`
    - Registers a new user.
    - Request body: `{ "username": "string", "email": "string", "password": "string" }`
    - Response: `{ "message": "Usuário registrado com sucesso" }`

- **POST** `/api/login`
    - Logs in a user.
    - Request body: `{ "username": "string", "password": "string" }`
    - Response: `{ "token": "string", "isAdmin": "boolean" }`

### Questions

- **POST** `/api/questions`
    - Creates a new question.
    - Request body: `{ "question": "string" }`
    - Response: `{ "question": "object" }`

- **GET** `/api/questions`
    - Retrieves all answered questions.
    - Response: `[ { "question": "object" } ]`

- **GET** `/api/questions/pending`
    - Retrieves all pending questions.
    - Response: `[ { "question": "object" } ]`

- **PUT** `/api/questions/:id/answer`
    - Updates a question with an answer.
    - Request body: `{ "answer": "string" }`
    - Response: `{ "question": "object" }`

- **PUT** `/api/questions/:id`
    - Updates a question and its answer.
    - Request body: `{ "question": "string", "answer": "string" }`
    - Response: `{ "question": "object" }`

- **DELETE** `/api/questions/:id`
    - Deletes a question.
    - Response: `{ "message": "Pergunta excluída com sucesso" }`

### Admin Check

- **GET** `/api/check-admin`
    - Checks if the user is an admin.
    - Response: `{ "isAdmin": "boolean" }`

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request with your changes.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
