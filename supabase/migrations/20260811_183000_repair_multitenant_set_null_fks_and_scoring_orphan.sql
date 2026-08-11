BEGIN;

-- Remove only the previously verified orphan. Its parent opportunity and
-- conversation no longer exist, and oportunidad_id is NOT NULL.
DELETE FROM public.oportunidad_scoring_eventos se
WHERE se.id = 'f1485a68-b5f7-4947-8c57-29b4bac55323'::uuid
  AND NOT EXISTS (
      SELECT 1
      FROM public.oportunidades o
      WHERE o.id = se.oportunidad_id
        AND o.organizacion_id = se.organizacion_id
  )
  AND NOT EXISTS (
      SELECT 1
      FROM public.conversaciones c
      WHERE c.id = se.conversacion_id
        AND c.organizacion_id = se.organizacion_id
  );

-- Composite tenant FKs must preserve organizacion_id when the related
-- business entity is deleted. Convert only the old unqualified SET NULL
-- constraints; the already repaired partial constraints are left unchanged.
DO $$
DECLARE
    fk record;
    v_source_columns text;
    v_target_columns text;
    v_null_columns text;
    v_deferrable text;
BEGIN
    FOR fk IN
        SELECT c.oid, c.conrelid, c.confrelid, c.conname,
               c.condeferrable, c.condeferred
        FROM pg_constraint c
        WHERE c.contype = 'f'
          AND c.confdeltype = 'n'
          AND pg_get_constraintdef(c.oid) ~ 'ON DELETE SET NULL$'
          AND EXISTS (
              SELECT 1
              FROM unnest(c.conkey) AS source_key(attnum)
              JOIN pg_attribute source_attribute
                ON source_attribute.attrelid = c.conrelid
               AND source_attribute.attnum = source_key.attnum
              WHERE source_attribute.attname = 'organizacion_id'
                AND source_attribute.attnotnull
          )
          AND EXISTS (
              SELECT 1
              FROM unnest(c.confkey) AS target_key(attnum)
              JOIN pg_attribute target_attribute
                ON target_attribute.attrelid = c.confrelid
               AND target_attribute.attnum = target_key.attnum
              WHERE target_attribute.attname = 'organizacion_id'
          )
    LOOP
        SELECT
            string_agg(format('%I', source_attribute.attname), ', ' ORDER BY key_position.ord),
            string_agg(format('%I', target_attribute.attname), ', ' ORDER BY key_position.ord),
            string_agg(format('%I', source_attribute.attname), ', ' ORDER BY key_position.ord)
                FILTER (WHERE source_attribute.attname <> 'organizacion_id')
        INTO v_source_columns, v_target_columns, v_null_columns
        FROM unnest((SELECT conkey FROM pg_constraint WHERE oid = fk.oid))
            WITH ORDINALITY AS key_position(attnum, ord)
        JOIN pg_attribute source_attribute
          ON source_attribute.attrelid = fk.conrelid
         AND source_attribute.attnum = key_position.attnum
        JOIN unnest((SELECT confkey FROM pg_constraint WHERE oid = fk.oid))
            WITH ORDINALITY AS target_key(attnum, ord)
          ON target_key.ord = key_position.ord
        JOIN pg_attribute target_attribute
          ON target_attribute.attrelid = fk.confrelid
         AND target_attribute.attnum = target_key.attnum;

        v_deferrable := CASE
            WHEN fk.condeferrable AND fk.condeferred THEN ' DEFERRABLE INITIALLY DEFERRED'
            WHEN fk.condeferrable THEN ' DEFERRABLE'
            ELSE ''
        END;

        EXECUTE format(
            'ALTER TABLE %s DROP CONSTRAINT %I',
            fk.conrelid::regclass,
            fk.conname
        );

        EXECUTE format(
            'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES %s (%s) ON DELETE SET NULL (%s)%s',
            fk.conrelid::regclass,
            fk.conname,
            v_source_columns,
            fk.confrelid::regclass,
            v_target_columns,
            v_null_columns,
            v_deferrable
        );
    END LOOP;
END
$$;

COMMIT;
