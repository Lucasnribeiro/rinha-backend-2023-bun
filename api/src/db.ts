import postgres from "postgres";

const sql = postgres({
  user: 'postgres',
  host: 'postgres',
  database: 'rinha',
  password: 'admin',
  max: 30,

});

export default sql