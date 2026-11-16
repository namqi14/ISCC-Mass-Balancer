-- Own migration on purpose: Postgres does not allow a newly added enum value to
-- be used in the same transaction that adds it, and the next migration's
-- lng_lots table defaults to it.
ALTER TYPE "Unit" ADD VALUE 'MMBTU';
