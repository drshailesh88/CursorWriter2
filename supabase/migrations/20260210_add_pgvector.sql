-- Enable pgvector extension
create extension if not exists vector;

-- Paper chunk embeddings table
create table if not exists paper_embeddings (
  id uuid default gen_random_uuid() primary key,
  paper_id text not null,
  chunk_id text not null unique,
  chunk_text text not null,
  chunk_index integer not null,
  section text,
  page_number integer,
  paper_title text,
  authors text,
  year integer,
  embedding vector(1536) not null,
  model text default 'text-embedding-3-small',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for fast retrieval
create index if not exists idx_paper_embeddings_paper_id on paper_embeddings(paper_id);
create index if not exists idx_paper_embeddings_chunk_id on paper_embeddings(chunk_id);

-- IVFFlat index for fast similarity search (cosine distance)
create index if not exists idx_paper_embeddings_vector on paper_embeddings
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Function for similarity search
create or replace function match_paper_chunks(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 20,
  filter_paper_ids text[] default null
)
returns table (
  id uuid,
  paper_id text,
  chunk_id text,
  chunk_text text,
  chunk_index integer,
  section text,
  page_number integer,
  paper_title text,
  authors text,
  year integer,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    pe.id,
    pe.paper_id,
    pe.chunk_id,
    pe.chunk_text,
    pe.chunk_index,
    pe.section,
    pe.page_number,
    pe.paper_title,
    pe.authors,
    pe.year,
    1 - (pe.embedding <=> query_embedding) as similarity
  from paper_embeddings pe
  where
    (filter_paper_ids is null or pe.paper_id = any(filter_paper_ids))
    and 1 - (pe.embedding <=> query_embedding) > match_threshold
  order by pe.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Research session persistence table
create table if not exists research_sessions (
  id text primary key,
  user_id text not null,
  topic text not null,
  mode text not null,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'clarifying',
  progress integer default 0,
  clarifications jsonb default '[]'::jsonb,
  perspectives jsonb default '[]'::jsonb,
  sources jsonb default '[]'::jsonb,
  citation_graph jsonb default '{}'::jsonb,
  synthesis jsonb,
  quality_metrics jsonb,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_research_sessions_user_id on research_sessions(user_id);
create index if not exists idx_research_sessions_status on research_sessions(status);
