import {MigrationInterface, QueryRunner} from "typeorm";

export class MarketplaceIndexer1647473080439 implements MigrationInterface {
    name = 'MarketplaceIndexer1647473080439'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "marketplace-indexer" ADD "orderbook_status" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "marketplace-indexer" DROP COLUMN "orderbook_status"`);
    }

}
