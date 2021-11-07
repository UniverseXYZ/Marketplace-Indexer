import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @Column()
  @Index({ unique: false })
  leftOrderHash: string;
  @Column()
  @Index({ unique: false })
  rightOrderHash: string;

  @Column()
  @Index({ unique: false })
  leftMaker: string;
  @Column()
  rightMaker: string;
  @Column()
  newLeftFill: string;
  @Column()
  newRightFill: string;
  @Column()
  leftAssetClass: string;
  @Column()
  rightAssetClass: string;
  @Column()
  leftAssetData: string;
  @Column()
  rightAssetData: string;

  @CreateDateColumn()
  createdAt: Date;
  @UpdateDateColumn()
  updatedAt: Date;
}
