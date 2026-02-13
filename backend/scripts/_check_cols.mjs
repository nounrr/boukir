import mysql from 'mysql2/promise';
import 'dotenv/config';
const c = await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'boukir'});
const [r] = await c.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='boukir' AND TABLE_NAME='product_variants' ORDER BY ORDINAL_POSITION");
console.log(r.map(x=>x.COLUMN_NAME).join('\n'));
await c.end();
