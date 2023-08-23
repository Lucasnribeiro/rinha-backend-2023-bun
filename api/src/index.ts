import { Elysia, t } from "elysia";
import { Redis } from "ioredis";
import sql from "./db";

const app = new Elysia();
const client = new Redis({
  host: "redis",
  port: 6379,
});

app
  .get("/pessoas/:id", async ({params: {id}, set}) => {

    const cachedData = await client.get(`pessoa:${id}`);
    if (cachedData !== undefined) {

        
        return cachedData;
    }

    const pessoa = await sql`
      select * from pessoas where id = ${id}
    `

    if (pessoa.count > 0) {
        await client.set(`pessoa:${id}`, JSON.stringify(pessoa[0]));
    }

    if(pessoa.count === 0){
      set.status = 404

        return {}
    }


    return pessoa[0]
  })
  .get("/pessoas", async ({query, set }) => {
    
    if(!query.t){
      set.status = 400
      return {}
    }

    if(typeof query.t === 'string'){
      const cachedData = await client.get(`pessoas:${query.t}`);
      if (cachedData) {

          return JSON.parse(cachedData);
      }

      const pessoas = await sql`
        SELECT id, nome, apelido, nascimento, stack
        FROM pessoas
        WHERE search ILIKE ${query.t}
        LIMIT 50 
      `
      if (pessoas.count > 0) {
          // Store data in Redis cache
          await client.set(`pessoas:${query.t}`, JSON.stringify(pessoas));
      }

      
      return pessoas 
    }

  })
  .get("/contagem-pessoas", async (set) => {
    const pessoas = await sql`
      select count(*) as count from pessoas
    `
    return pessoas[0].count
  })
  .onError(({ code, error, set }) => {

      if(error.message === 'duplicate key value violates unique constraint "pessoas_apelido_key"'){
        set.status = 422
        return {
          message: 'name already exists'
        }
      }

      if(code !== "VALIDATION"){
        console.log("error:   " + error.message)
      }

      if(code === 'VALIDATION'){

        if(error.message.startsWith("Invalid body, 'apelido': Expected string")){
          set.status = 400
          return "apelid"
        }
        if(error.message.startsWith("Invalid body, 'stack/")){
          set.status = 400
          return "stack"
        }
        if(error.message.startsWith("Invalid body, 'nome': Expected string")){
          set.status = 400
          return "nome"
        }
        if(error.message.startsWith("Invalid body, 'nascimento': Expected string")){
          set.status = 400
          return "nascimento"
        }
        if(error.message.startsWith("Invalid body, 'stack': Expected array")){
          set.status = 400
          return "array"
        }

        set.status = 422
        return {}
      }
    
  })
  .post("/pessoas", async ({ body, set }) => {

    const cachedData = await client.get(`apelido:${body.apelido}`);
    if (cachedData) {
      set.status = 422
      return { message: "Apelido já cadastrado"}
    } 

    if(body.stack !== undefined){
      const allStringsWithinMaxLength = body.stack.every(str => str.length <= 32);

      if (!allStringsWithinMaxLength) {
        set.status = 400
        return {message: "stack max lenght"}
      } 
    }

    try {
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
      await Promise.all([
        client.set(`pessoa:${pessoa[0].id}`, JSON.stringify(pessoa[0])),
        client.set(`apelido:${pessoa[0].apelido}`, 'true')
      ])

      
      set.status = 201
      set.headers = {
        'Location': `/pessoas/${pessoa[0].id}`
      }
      return {}
    }catch(e: any){
      if(e.message == 'duplicate key value violates unique constraint "pessoas_apelido_key"'){
        set.status = 422
        return { message: "Apelido já cadastrado"}
      }
    }
   }, 
   {
    body: t.Object({
      nome: t.String({maxLength: 100}),
      apelido: t.String({maxLength: 32}),
      nascimento: t.String({format: 'date', default: 'YYYY-MM-DD'}),
      stack: t.Optional(t.Array(t.String({ maxLength: 32}), {minItems: 1}, )),
    }),
  })
  // .onRequest(({request}) => { console.log(`request: ${request.method} ${request.url} }` )})
  // .onResponse((c) => {console.log("response" + c.request)})
  .listen(3000)

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
