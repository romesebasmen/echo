-- Preserve Creator Loop source provenance with a real foreign key. The
-- generated column is populated only for thought-originated work, so other
-- polymorphic origin types keep their existing representation and behavior.

alter table public.creative_works
  add column thought_origin_id uuid
  generated always as (
    case
      when origin_type = 'thought' then origin_id
      else null
    end
  ) stored;

alter table public.creative_works
  add constraint creative_works_thought_origin_fk
  foreign key (thought_origin_id)
  references public.thoughts (id)
  on delete restrict
  not valid;

alter table public.creative_works
  validate constraint creative_works_thought_origin_fk;
