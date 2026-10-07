# Noor

This version runs with **Express + JWT + bcrypt + in-memory storage**. MongoDB is NOT required.

## Run

```bash
npm install
npm run dev
```

Then open:

http://localhost:3000

API health:

http://localhost:3000/api/health

## Important

Data is stored only in server memory. Restarting the server clears registered users, periods, chats, notifications, profiles, and mentor-created webinars.

This is ideal for a demo/hackathon prototype when you do not want MongoDB yet.

Passwords are hashed with bcrypt and authentication uses JWT. Do not use the in-memory storage architecture for production.
