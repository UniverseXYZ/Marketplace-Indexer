import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { MarketplaceIndexer } from './order.entity';
import { OrderMatchEntity } from './order.types';
import { AppConfig } from '../configuration/configuration.service';
import R from 'ramda';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OrdersService {
  private currentBlockNumber = 0;
  private currentTxHash: string;

  constructor(
    @InjectRepository(MarketplaceIndexer)
    private readonly marketplaceIndexerRepository: Repository<MarketplaceIndexer>,
    private readonly config: AppConfig,
    private httpService: HttpService,
  ) {}

  /**
   *
   * #1 Get the current latesed blocktime from database
   * #2 Query thegraph api for the next one
   * #3 Save new event to database
   * #4 Send event to marketplace backend by calling its internal endpoint
   */
  @Cron(CronExpression.EVERY_SECOND)
  public async updateOrderStatus() {
    if (this.currentBlockNumber <= 0) {
      const existingEvent = await this.getLatestEvent();
      console.log(
        `Read from database existing block number: ${existingEvent?.blockNumber}, tx hash: ${existingEvent?.txHash}`,
      );
      this.currentBlockNumber = existingEvent?.blockNumber ?? 1;
      this.currentTxHash = existingEvent?.txHash ?? '';
    }

    const newEvent = await this.querySubgraph(
      this.currentBlockNumber,
      this.currentTxHash,
    );
    if (!newEvent) {
      return;
    }

    console.log(`Got new event, tx hash: ${newEvent.id}`);

    const savedEvent = await this.saveNewEvent(newEvent);
    this.currentBlockNumber = savedEvent.blockNumber;
    this.currentTxHash = savedEvent.txHash;

    await this.syncToMarketplace(savedEvent);
  }

  private async syncToMarketplace(event: MarketplaceIndexer) {
    await firstValueFrom(
      this.httpService.put(
        `${this.config.values.ORDERBOOK_URL}/internal/orders/${event.leftOrderHash}/match`,
        {
          txHash: event.txHash,
          leftMaker: event.leftMaker,
          rightMaker: event.rightMaker,
          leftOrderHash: event.leftOrderHash,
          rightOrderHash: event.rightOrderHash,
          newLeftFill: event.newLeftFill,
          newRightFill: event.newRightFill,
        },
      ),
    );
  }

  private async getLatestEvent() {
    const existingEvent = await this.marketplaceIndexerRepository.findOne({
      select: ['blockNumber', 'txHash'],
      order: { blockNumber: 'DESC' },
    });
    return existingEvent;
  }

  private async saveNewEvent(newEvent: OrderMatchEntity) {
    const newData = this.marketplaceIndexerRepository.create({
      txHash: newEvent.id,
      txFrom: newEvent.txFrom,
      txValue: newEvent.txValue,
      blockNumber: newEvent.blockNumber,
      blockTimestamp: newEvent.blockTimestamp,
      leftOrderHash: newEvent.leftOrderHash,
      rightOrderHash: newEvent.rightOrderHash,
      leftMaker: newEvent.leftMaker,
      rightMaker: newEvent.rightMaker,
      newLeftFill: newEvent.newLeftFill,
      newRightFill: newEvent.newRightFill,
      leftAssetClass: newEvent.leftAssetClass,
      rightAssetClass: newEvent.rightAssetClass,
      leftAssetData: newEvent.leftAssetData,
      rightAssetData: newEvent.rightAssetData,
    });
    try {
      const savedEvent = await this.marketplaceIndexerRepository.save(newData);
      return savedEvent;
    } catch (error) {
      console.log(error);
    }
  }

  private async querySubgraph(
    currentBlockNumber: number,
    txHash: string,
  ): Promise<OrderMatchEntity> {
    const queryString = `{
      orderMatchEntities(first: 1, orderBy: blockNumber, orderDirection: asc, where: {blockNumber_gte: ${currentBlockNumber}, id_not: \"${txHash}\"}) {
        id
        txFrom
        txValue
        blockNumber
        blockTimestamp
        leftOrderHash
        rightOrderHash
        leftMaker
        rightMaker
        newLeftFill
        newRightFill
        leftAssetClass
        rightAssetClass
        leftAssetData
        rightAssetData
      } 
    }`;

    try {
      const result = await firstValueFrom(
        this.httpService.post(this.config.values.SUBGRAPH_ORDERBOOK_ENDPOINT, {
          query: queryString,
        }),
      );
      if (result?.data?.data?.orderMatchEntities?.length) {
        return result.data.data.orderMatchEntities[0];
      } else {
        return;
      }
    } catch (error) {
      console.log(error);
    }
  }
}
