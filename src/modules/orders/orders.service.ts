import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { MarketplaceIndexer } from './order.entity';
import { OrderMatchEntity, OrderCancelEntity } from './order.types';
import { AppConfig } from '../configuration/configuration.service';
import R from 'ramda';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { EventTypesEnum } from './order.types';

@Injectable()
export class OrdersService {
  private currentMatchBlockNumber = 0;
  private currentMatchTxHash: string;

  private currentCancelBlockNumber = 0;
  private currentCancelTxHash: string;

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
  // @Cron(CronExpression.EVERY_SECOND)
  @Cron(CronExpression.EVERY_5_SECONDS)
  public async updateOrderStatus() {

    /**
     * @TODO there's no mechanism to ensure that events from the indexer 
     * always find their way to the orderbook BE bc if the syncToMarketplace() 
     * was unsuccessful, it does not repeat a try in the next iteration.
     * In the same time, the Indexer has to move forward with indexing the events and not be stale.
     */
    
    // Pulling & processing Match events from the subgraph
    if (this.currentMatchBlockNumber <= 0) {
      const latestMatchEvent = await this.getLatestEvent(EventTypesEnum.MATCH);
      console.log(`Latest Match event in our DB, block number: ${latestMatchEvent?.blockNumber}, tx hash: ${latestMatchEvent?.txHash}`);
      this.currentMatchBlockNumber = latestMatchEvent?.blockNumber ?? 1;
      this.currentMatchTxHash = latestMatchEvent?.txHash ?? '';
    }
    const newMatchEvent = await this.querySubgraph(this.currentMatchBlockNumber, this.currentMatchTxHash);
    if (newMatchEvent) {
      console.log(`Got new Match event, tx hash: ${newMatchEvent.id}`);
      const savedMatchEvent = await this.saveNewEvent(newMatchEvent, EventTypesEnum.MATCH);
      this.currentMatchBlockNumber = savedMatchEvent.blockNumber;
      this.currentMatchTxHash = savedMatchEvent.txHash;

      await this.syncToMarketplace(savedMatchEvent);
    }

    // Pulling & processing Cancel events from the subgraph
    if (this.currentCancelBlockNumber <= 0) {
      const latestCancelEvent = await this.getLatestEvent(EventTypesEnum.CANCEL);
      console.log(`Latest Cancel event in our DB, block number: ${latestCancelEvent?.blockNumber}, tx hash: ${latestCancelEvent?.txHash}`);
      this.currentCancelBlockNumber = latestCancelEvent?.blockNumber ?? 1;
      this.currentCancelTxHash = latestCancelEvent?.txHash ?? '';
    }
    const newCancelEvent = await this.querySubgraphCancelEvents(this.currentCancelBlockNumber, this.currentCancelTxHash);
    if(newCancelEvent) {
      console.log(`Got new Cancel event, tx hash: ${newCancelEvent.id}`);
      const savedCancelEvent = await this.saveNewEvent(newCancelEvent, EventTypesEnum.CANCEL);
      this.currentCancelBlockNumber = savedCancelEvent.blockNumber;
      this.currentCancelTxHash = savedCancelEvent.txHash;

      await this.syncToMarketplace(savedCancelEvent);
    }
  }

  private async syncToMarketplace(event: MarketplaceIndexer) {
    try {
      if(EventTypesEnum.MATCH === event.type) {
        await firstValueFrom(
          this.httpService.put(
            `${this.config.values.ORDERBOOK_URL}/internal/orders/match`,
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
      } else if (EventTypesEnum.CANCEL === event.type) {
        await firstValueFrom(
          this.httpService.put(
            `${this.config.values.ORDERBOOK_URL}/internal/orders/cancel`,
            {
              txHash: event.txHash,
              leftMaker: event.leftMaker,
              leftOrderHash: event.leftOrderHash,
            },
          ),
        );
      }
    } catch(e) {
      console.log(e)
    }
    
  }

  private async getLatestEvent(eventType: EventTypesEnum) {
    const existingEvent = await this.marketplaceIndexerRepository.findOne({
      select: ['blockNumber', 'txHash'],
      order: { blockNumber: 'DESC' },
      where: {
        type: eventType,
      }
    });
    return existingEvent;
  }

  private async saveNewEvent(newEvent: any, eventType: EventTypesEnum) {
    let newData;
    if(EventTypesEnum.MATCH === eventType) {
      newData = this.marketplaceIndexerRepository.create({
        txHash: newEvent.id,
        txFrom: newEvent.txFrom,
        txValue: newEvent.txValue,
        blockNumber: newEvent.blockNumber,
        blockTimestamp: newEvent.blockTimestamp,
        type: eventType,
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
    } else if(EventTypesEnum.CANCEL === eventType) {
      newData = await this.marketplaceIndexerRepository.create({
        txHash: newEvent.id,
        txFrom: newEvent.txFrom,
        txValue: newEvent.txValue,
        blockNumber: newEvent.blockNumber,
        blockTimestamp: newEvent.blockTimestamp,
        type: EventTypesEnum.CANCEL,
        leftOrderHash: newEvent.leftOrderHash,
        leftMaker: newEvent.leftMaker,
        leftAssetClass: newEvent.leftAssetClass,
        rightAssetClass: newEvent.rightAssetClass,
        leftAssetData: newEvent.leftAssetData,
        rightAssetData: newEvent.rightAssetData,
      });
    }
    
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

  /**
   * Makes a GraphQL request to the subgraph to get the Cancel event which has not yet been 
   * saved into the marketplace-indexer table.
   * Return the Cancel event data.
   * @param currentBlockNumber 
   * @param txHash 
   * @returns Promise<OrderCancelEntity>
   */
  private async querySubgraphCancelEvents(currentBlockNumber: number, txHash: string): Promise<OrderCancelEntity> {
    const queryString = `{
      orderCancelEntities(first: 1, orderBy: blockNumber, orderDirection: asc, where: {blockNumber_gte: ${currentBlockNumber}, id_not: \"${txHash}\"}) {
        id
        txFrom
        txValue
        blockNumber
        blockTimestamp
        leftOrderHash
        leftMaker
        leftAssetClass
        rightAssetClass
        leftAssetData
        rightAssetData
      } 
    }`;

    try {
      const result = await firstValueFrom(this.httpService.post(this.config.values.SUBGRAPH_ORDERBOOK_ENDPOINT, {
          query: queryString,
        }));      
      if(result?.data?.data?.orderCancelEntities?.length) {
        return result.data.data.orderCancelEntities[0];
      }
    } catch(e) {
      console.log(e);
    }
  }

}
