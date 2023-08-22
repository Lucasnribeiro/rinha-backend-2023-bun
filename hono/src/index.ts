import { isValid, parse } from 'date-fns';
import { Hono } from 'hono';
import { Redis } from 'ioredis';
import { z } from 'zod';
import sql from './db';

const app = new Hono()
const client = new Redis({
    host: "redis",
    port: 6379,
  });

app.get('/pessoas/:id', async (c) => {
    const id = c.req.param('id')

    const regexExp = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/gi;
    if(!regexExp.test(c.req.param('id'))){
      return c.json({})
    }

    const cachedData = await client.get(`pessoa:${id}`);
    if (cachedData) {
        return c.json(cachedData);
    }

    const pessoa = await sql`
        select * from pessoas where id = ${id}
    `

    // sql.end()
    if (pessoa.count > 0) {
        await client.set(`pessoa:${id}`, JSON.stringify(pessoa[0]));
    }

    if(pessoa.count === 0){
        c.status(404)
  
        return c.json({})
    }

    return c.json(pessoa[0])
})

app.get('/pessoas', async (c) => {
    const t = c.req.query('t')

    if(!t){
        c.status(400)

        return c.json({})
    }

    const cachedData = await client.get(`pessoas:${t}`);
    if (cachedData) {

        return c.json(cachedData);
    }

    const pessoas = await sql`
    SELECT id, nome, apelido, nascimento, stack
    FROM pessoas
    WHERE search ILIKE ${t}
    LIMIT 50 
  `

    if (pessoas.count > 0) {
        // Store data in Redis cache
        await client.set(`pessoas:${t}`, JSON.stringify(pessoas));
    }

    return c.json(pessoas)
})

app.get("/contagem-pessoas", async (c) => {
    const pessoas = await sql`
      select count(*) as count from pessoas
    `
    return c.json(pessoas[0].count)
})

const schema = z.object({
  nome: z.string().max(100),
  apelido: z.string().max(32),
  nascimento: z.string().refine((value) => {
    const parsedDate = parse(value, 'yyyy-MM-dd', new Date());

    return isValid(parsedDate)

  }, {
    message: "data",
  }),
  stack: z.array(z.string().max(32)).optional()
})

app.post("/pessoas", 
  // bun is bugging when cloning the json body :(
  // zValidator('json', schema, (result, c) => {    
  //   if (!result.success) {
  //     if(result.error.message === "data invalida"){
  //       return c.text('data invalida', 400)
  //     }
  //     return c.text('Invalid!', 422)
  // }}), 
  async (c) => {
    const body = await c.req.json()
    let validationError = false
    
    try{
      const validated = schema.parse(body)
    }catch(error: any){
      if (error instanceof z.ZodError) {
        validationError = error.errors.length  > 0 ? true : false
      }
    }

    if(validationError){
      c.status(400)
      return c.json("erro de validação dos dados")
    }

    const cachedData = await client.get(`apelido:${body.apelido}`);
    if (cachedData) {
      c.status(422)
      return c.json({ message: "Apelido já cadastrado"})
    } 

    const pessoa = await sql`
        insert 
        into
          pessoas
          (
            nome,
            apelido,
            nascimento,
            stack
          )  
        values
          (
            ${body.nome},
            ${body.apelido},
            ${body.nascimento},
            ${body.stack ?? []}
          )
        returning
            id, nome, apelido, to_char(nascimento, 'YYYY-MM-DD') as nascimento, stack
      ` 
    
    await client.set(`pessoa:${pessoa[0].id}`, JSON.stringify(pessoa[0]));
    await client.set(`apelido:${pessoa[0].apelido}`, 'true');

    c.status(201)
    c.header("Location", `/pessoas/${pessoa[0].id}`)
    // sql.end()
    return c.json("")
})

console.log(`hono running`)

export default  {
    port: 3000,
    fetch: app.fetch,
}
