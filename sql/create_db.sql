CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS pessoas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome varchar(100) NOT NULL,
    apelido varchar(32) NOT NULL UNIQUE,
    nascimento DATE NOT NULL,
    stack VARCHAR(32)[] 
);

CREATE INDEX IF NOT EXISTS term_search_index_apelido ON pessoas
    USING gin(to_tsvector('english', apelido));
    
CREATE INDEX IF NOT EXISTS term_search_index_nome ON pessoas
    USING gin(to_tsvector('english', nome));
