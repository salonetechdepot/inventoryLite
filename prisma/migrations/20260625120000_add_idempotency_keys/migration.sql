CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "route" VARCHAR(100) NOT NULL,
    "response_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_keys_user_route_key_unique" ON "idempotency_keys"("user_id", "route", "key");
CREATE INDEX "idx_idempotency_keys_created_at" ON "idempotency_keys"("created_at");

ALTER TABLE "idempotency_keys"
ADD CONSTRAINT "idempotency_keys_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
