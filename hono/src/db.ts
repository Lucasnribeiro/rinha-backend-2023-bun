import postgres from "postgres";

const sql = postgres({
  user: 'postgres',
  host: 'postgres',
  database: 'rinha',
  password: 'admin',
});

export default sql