import {MigrationInterface, QueryRunner} from "typeorm";

export class MarketplaceIndexer1645480412352 implements MigrationInterface {
    name = 'MarketplaceIndexer1645480412352'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."marketplace-indexer_type_enum" AS ENUM('match', 'cancel')`);
        await queryRunner.query(`ALTER TABLE "marketplace-indexer" ADD "type" "public"."marketplace-indexer_type_enum" NOT NULL`);
        await queryRunner.query(`ALTER TABLE "marketplace-indexer" ALTER COLUMN "right_order_hash" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "marketplace-indexer" ALTER COLUMN "right_maker" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "marketplace-indexer" ALTER COLUMN "new_left_fill" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "marketplace-indexer" ALTER COLUMN "new_right_fill" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "marketplace-indexer" ALTER COLUMN "new_right_fill" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "marketplace-indexer" ALTER COLUMN "new_left_fill" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "marketplace-indexer" ALTER COLUMN "right_maker" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "marketplace-indexer" ALTER COLUMN "right_order_hash" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "marketplace-indexer" DROP COLUMN "type"`);
        await queryRunner.query(`DROP TYPE "public"."marketplace-indexer_type_enum"`);
    }

}
