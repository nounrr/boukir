import 'dotenv/config';
import mysql from 'mysql2/promise';
// local
// const pool = mysql.createPool({
//   host: process.env.DB_HOST || 'localhost',
//   port: Number(process.env.DB_PORT || 3307),
//   user: process.env.DB_USER || 'root',
//   password: process.env.DB_PASSWORD || 'rootroot@',
//   database: process.env.DB_NAME || 'boukir',
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
// });
// prod

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'boukir',
  password: process.env.DB_PASSWORD || 'Ton46-l,yk,hbMotDePasse',
  database: process.env.DB_NAME || 'boukir',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;
