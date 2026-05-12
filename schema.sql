-- Run this in the Supabase SQL editor

-- Human receiver decisions (human evaluates simulated applicant)
create table receiver_decisions (
  id                    bigint generated always as identity primary key,
  session_id            uuid        not null,
  round                 int         not null,
  field                 text        not null,
  applicant_id          text        not null,
  applicant_writing_help text       not null,
  applicant_is_expert   boolean     not null,
  human_decision        text        not null,  -- 'expert' | 'non-expert'
  correct               boolean     not null,
  receiver_payoff       int         not null,
  applicant_payoff      int         not null,
  created_at            timestamptz not null default now()
);

-- Human sender rounds (human writes pitch, AI evaluates)
create table sender_rounds (
  id            bigint generated always as identity primary key,
  session_id    uuid        not null,
  round         int         not null,
  field         text        not null,
  writing_help  text        not null,  -- 'none' | 'grammar' | 'both'
  question_ids  text[]      not null,
  is_expert     boolean     not null,
  pitch         text        not null,
  ai_decision   text        not null,  -- 'expert' | 'non-expert'
  correct       boolean     not null,
  sender_payoff int         not null,
  ai_payoff     int         not null,
  created_at    timestamptz not null default now()
);

-- Enable Row Level Security (allow anonymous inserts from the browser)
alter table receiver_decisions enable row level security;
alter table sender_rounds      enable row level security;

create policy "anon insert receiver_decisions"
  on receiver_decisions for insert to anon with check (true);

create policy "anon insert sender_rounds"
  on sender_rounds for insert to anon with check (true);
