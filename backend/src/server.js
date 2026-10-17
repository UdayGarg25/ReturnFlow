import 'dotenv/config';
import http from 'http';
import app from './app.js';
import pool from "./config/db.js";

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

pool.query("SELECT NOW()", (err, result) => {
    if (err) {
        console.error("Database connection failed:", err.message);
    } else {
        console.log("Database connected:", result.rows[0]);
    }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
