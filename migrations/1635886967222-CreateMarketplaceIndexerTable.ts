import {MigrationInterface, QueryRunner} from "typeorm";

export class CreateMarketplaceIndexerTable1635886967222 implements MigrationInterface {
    name = 'CreateMarketplaceIndexerTable1635886967222'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "marketplace-indexer" ("tx_hash" character varying NOT NULL, "tx_from" character varying NOT NULL, "tx_value" character varying NOT NULL, "block_number" integer NOT NULL, "block_timestamp" integer NOT NULL, "left_order_hash" character varying NOT NULL, "right_order_hash" character varying NOT NULL, "left_maker" character varying NOT NULL, "right_maker" character varying NOT NULL, "new_left_fill" character varying NOT NULL, "new_right_fill" character varying NOT NULL, "left_asset_class" character varying NOT NULL, "right_asset_class" character varying NOT NULL, "left_asset_data" character varying NOT NULL, "right_asset_data" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f23f139999b379451f6511136c9" PRIMARY KEY ("tx_hash"))`);
        await queryRunner.query(`CREATE INDEX "IDX_eeb7c62c17c06c2d5a98fb941a" ON "marketplace-indexer" ("block_number") `);
        await queryRunner.query(`CREATE INDEX "IDX_1865651eec708e9ca3b9d85b54" ON "marketplace-indexer" ("block_timestamp") `);
        await queryRunner.query(`CREATE INDEX "IDX_71d5dcb061324ba7ddb6fcb15e" ON "marketplace-indexer" ("left_order_hash") `);
        await queryRunner.query(`CREATE INDEX "IDX_0e8750758e27c9a68463293a31" ON "marketplace-indexer" ("right_order_hash") `);
        await queryRunner.query(`CREATE INDEX "IDX_401b76372340c9678e296b52dd" ON "marketplace-indexer" ("left_maker") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_401b76372340c9678e296b52dd"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0e8750758e27c9a68463293a31"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_71d5dcb061324ba7ddb6fcb15e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1865651eec708e9ca3b9d85b54"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_eeb7c62c17c06c2d5a98fb941a"`);
        await queryRunner.query(`DROP TABLE "marketplace-indexer"`);
    }

}
