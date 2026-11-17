-- Records each user's acceptance of the PDPA notice. Additive only: existing
-- users get NULLs, so they are shown the notice on their next login.
ALTER TABLE "users" ADD COLUMN     "pdpaAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "pdpaVersion" VARCHAR(20);
