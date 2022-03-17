import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EventTypesEnum } from './order.types';

@Entity('marketplace-indexer')
export class MarketplaceIndexer {
  @Column()
  @PrimaryColumn()
  txHash: string;
  @Column()
  txFrom: string;
  @Column()
  txValue: string;

  @Column()
  @Index({ unique: false })
  blockNumber: number;
  @Column()
  @Index({ unique: false })
  blockTimestamp: number;

  @Column({
    type: 'enum',
    enum: EventTypesEnum,
  })
  type: EventTypesEnum;

  @Column()
  @Index({ unique: false })
  leftOrderHash: string;
  @Column({
    nullable: true,
  })
  @Index({ unique: false })
  rightOrderHash: string;

  @Column()
  @Index({ unique: false })
  leftMaker: string;
  @Column({
    nullable: true,
  })
  rightMaker: string;
  @Column({
    nullable: true,
  })
  newLeftFill: string;
  @Column({
    nullable: true,
  })
  newRightFill: string;
  @Column()
  leftAssetClass: string;
  @Column()
  rightAssetClass: string;
  @Column()
  leftAssetData: string;
  @Column()
  rightAssetData: string;

  @Column({
    nullable: true,
    default: null,
  })
  orderbookStatus: string;

  @CreateDateColumn()
  createdAt: Date;
  @UpdateDateColumn()
  updatedAt: Date;
}
