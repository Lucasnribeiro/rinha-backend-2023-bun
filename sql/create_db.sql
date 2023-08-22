CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION ARRAY_TO_STRING_IMMUTABLE (
  arr TEXT[],
  sep TEXT
) RETURNS TEXT IMMUTABLE PARALLEL SAFE LANGUAGE SQL AS $$
SELECT ARRAY_TO_STRING(arr, sep) $$;

CREATE TABLE pessoas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(100) NOT NULL,
  apelido VARCHAR(32) NOT NULL,
  nascimento DATE NOT NULL,
  stack VARCHAR(32)[],
  search TEXT GENERATED ALWAYS AS (
    nome || ' ' || apelido || ' ' || COALESCE(ARRAY_TO_STRING_IMMUTABLE(stack, ' '), '')
  ) STORED,
  CONSTRAINT unique_apelid UNIQUE (apelido)
);

CREATE INDEX pessoas_search_index ON pessoas USING GIST (search gist_trgm_ops);