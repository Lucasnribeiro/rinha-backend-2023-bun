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
    const regexExp = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/gi;
    if(!regexExp.test(id)){
      return {}
    }

    const cachedData = await client.get(`pessoa:${id}`);
    if (cachedData) {
        set.headers = {
          'Content-Type': 'application/json'
        } 
        
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

    set.headers = {
      'Content-Type': 'application/json'
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
          set.headers = {
              'Content-Type': 'application/json'
          };
          return JSON.parse(cachedData);
      }

      const queryTerm = `${query.t}`;
      const sanitizedSearchTerm = queryTerm.replace(/\s+/g, ' ');
      const terms = sanitizedSearchTerm.split(' ').map(term => `${term}:*`).join(' & ');
      const formattedQuery = `${terms}`;

      const pessoas = await sql`
        select *
        from pessoas
        where  
          to_tsvector('english', apelido) @@ to_tsquery( 'english', ${formattedQuery})
          or to_tsvector('english', nome) @@ to_tsquery( 'english', ${formattedQuery})
          or to_tsvector(array_to_string(stack, '')) @@ to_tsquery( 'english', ${formattedQuery})
        limit 50; 
      `
      if (pessoas.count > 0) {
          // Store data in Redis cache
          await client.set(`pessoas:${query.t}`, JSON.stringify(pessoas));
      }
      set.headers = {
        'Content-Type': 'application/json'
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

      if(code === 'VALIDATION'){

        if(error.message.startsWith("Invalid body, 'apelido': Expected string")){
          set.status = 400
          return {}
        }
        if(error.message.startsWith("Invalid body, 'stack/")){
          set.status = 400
          return {}
        }
        if(error.message.startsWith("Invalid body, 'nome': Expected string")){
          set.status = 400
          return {}
        }
        if(error.message.startsWith("Invalid body, 'nascimento': Expected string")){
          set.status = 400
          return {}
        }
        if(error.message.startsWith("Invalid body, 'stack': Expected array")){
          set.status = 400
          return {}
        }

        set.status = 422
        return {}
      }
    
  })
  .post("/pessoas", async ({ body, set }) => {

    const cachedData = await client.get(`apelido:${body.apelido}`);
    if (cachedData) {
      set.status == 422
      return { message: "Apelido já cadastrado"}
    } 

    if(body.stack !== undefined){
      const allStringsWithinMaxLength = body.stack.every(str => str.length <= 32);

      if (allStringsWithinMaxLength) {
        set.status = 400
        return {}
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
      await client.set(`pessoa:${pessoa[0].id}`, JSON.stringify(pessoa[0]));
      await client.set(`apelido:${pessoa[0].apelido}`, 'true');
      
      set.status = 201
      set.headers = {
        'Location': `/pessoas/${pessoa[0].id}`
      }
      return {}
    }catch(e: any){
      if(e.message == 'duplicate key value violates unique constraint "pessoas_apelido_key"'){
        set.status == 422
        return { message: "Apelido já cadastrado"}
      }
    }
   }, 
   {
    body: t.Object({
      nome: t.String({maxLength: 32}),
      apelido: t.String({maxLength: 100}),
      nascimento: t.String({format: 'date', default: 'YYYY-MM-DD'}),
      stack: t.Optional(t.Array(t.String({ maxLength: 32}), {minItems: 1}, )),
    }),
  })
  .listen(3000)

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
