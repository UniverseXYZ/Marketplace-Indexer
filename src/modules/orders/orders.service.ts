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

  private currentCancelBlockNumber = 0;

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
     * @TODO consider there's a lot of events simultaneously, then the current logic
     * would pull all those events one by one with a 5 seconds interval.
     * We need a logic to process evets faster.
     */

    /**
     * @TODO there's no mechanism to ensure that events from the indexer
     * always find their way to the orderbook BE bc if the syncToMarketplace()
     * was unsuccessful, it does not repeat a try in the next iteration.
     * In the same time, the Indexer has to move forward with indexing the events and not be stale.
     */

    // Pulling & processing Match events from the subgraph
    if (this.currentMatchBlockNumber <= 0) {
      const latestMatchEvent = await this.getLatestEvent(EventTypesEnum.MATCH);
      console.log(
        `Latest block number with a Match event in our DB: ${latestMatchEvent?.blockNumber}`,
      );
      this.currentMatchBlockNumber = latestMatchEvent?.blockNumber ?? 1;
    }
    const matchTxHashesInCurrentBlock =
      await this.getTxHashesByEventTypeAndBlockNumber(
        EventTypesEnum.MATCH,
        this.currentMatchBlockNumber,
      );
    const newMatchEvent = await this.querySubgraphMatchEvents(
      this.currentMatchBlockNumber,
      matchTxHashesInCurrentBlock,
    );
    if (newMatchEvent) {
      console.log(`Got new Match event, tx hash: ${newMatchEvent.id}`);
      const savedMatchEvent = await this.saveNewEvent(
        newMatchEvent,
        EventTypesEnum.MATCH,
      );
      this.currentMatchBlockNumber = savedMatchEvent.blockNumber;

      await this.syncToMarketplace(savedMatchEvent);
    }

    // Pulling & processing Cancel events from the subgraph
    if (this.currentCancelBlockNumber <= 0) {
      const latestCancelEvent = await this.getLatestEvent(
        EventTypesEnum.CANCEL,
      );
      console.log(
        `Latest block number with a Cancel event in our DB: ${latestCancelEvent?.blockNumber}`,
      );
      this.currentCancelBlockNumber = latestCancelEvent?.blockNumber ?? 1;
    }
    const cancelTxHashesInCurrentBlock =
      await this.getTxHashesByEventTypeAndBlockNumber(
        EventTypesEnum.CANCEL,
        this.currentCancelBlockNumber,
      );
    const newCancelEvent = await this.querySubgraphCancelEvents(
      this.currentCancelBlockNumber,
      cancelTxHashesInCurrentBlock,
    );
    if (newCancelEvent) {
      console.log(`Got new Cancel event, tx hash: ${newCancelEvent.id}`);
      const savedCancelEvent = await this.saveNewEvent(
        newCancelEvent,
        EventTypesEnum.CANCEL,
      );
      this.currentCancelBlockNumber = savedCancelEvent.blockNumber;

      await this.syncToMarketplace(savedCancelEvent);
    }
  }

  private async syncToMarketplace(event: MarketplaceIndexer) {
    try {
      if (EventTypesEnum.MATCH === event.type) {
        await firstValueFrom(
          this.httpService.put(
            `${this.config.values.ORDERBOOK_URL}/v1/internal/orders/match`,
            {
              txHash: event.txHash,
              leftMaker: event.leftMaker,
              rightMaker: event.rightMaker,
              leftOrderHash: event.leftOrderHash,
              rightOrderHash: event.rightOrderHash,
              newLeftFill: event.newLeftFill,
              newRightFill: event.newRightFill,
              txFrom: event.txFrom,
            },
          ),
        );
      } else if (EventTypesEnum.CANCEL === event.type) {
        await firstValueFrom(
          this.httpService.put(
            `${this.config.values.ORDERBOOK_URL}/v1/internal/orders/cancel`,
            {
              txHash: event.txHash,
              leftMaker: event.leftMaker,
              leftOrderHash: event.leftOrderHash,
            },
          ),
        );
      }
    } catch (e) {
      console.log(e);
    }
  }

  private async getLatestEvent(eventType: EventTypesEnum) {
    const existingEvent = await this.marketplaceIndexerRepository.findOne({
      select: ['blockNumber'],
      order: { blockNumber: 'DESC' },
      where: {
        type: eventType,
      },
    });
    return existingEvent;
  }

  /**
   * Returns array of transaction's hashes of specified event type in the specified block number
   * from the Indexer table (marketplace-indexer).
   * @param eventType
   * @param currentBlockNumber
   * @returns {Promise<string[]>}
   */
  private async getTxHashesByEventTypeAndBlockNumber(
    eventType: EventTypesEnum,
    currentBlockNumber: number,
  ): Promise<string[]> {
    const value = [];
    const events = await this.marketplaceIndexerRepository.find({
      select: ['txHash'],
      where: {
        type: eventType,
        blockNumber: currentBlockNumber,
      },
    });
    for (const event of events) {
      value.push(event.txHash);
    }

    return value;
  }

  private async saveNewEvent(newEvent: any, eventType: EventTypesEnum) {
    let newData;
    if (EventTypesEnum.MATCH === eventType) {
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
    } else if (EventTypesEnum.CANCEL === eventType) {
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

  private async querySubgraphMatchEvents(
    currentBlockNumber: number,
    txHashes: string[],
  ): Promise<OrderMatchEntity> {
    const formattedTxHashes = `\"${txHashes.join(`\", \"`)}\"`;
    const queryString = `{
      orderMatchEntities(first: 1, orderBy: blockNumber, orderDirection: asc, where: {blockNumber_gte: ${currentBlockNumber}, id_not_in: [${formattedTxHashes}]}) {
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
   * @param txHashes
   * @returns Promise<OrderCancelEntity>
   */
  private async querySubgraphCancelEvents(
    currentBlockNumber: number,
    txHashes: string[],
  ): Promise<OrderCancelEntity> {
    const formattedTxHashes = `\"${txHashes.join(`\", \"`)}\"`;
    const queryString = `{
      orderCancelEntities(first: 1, orderBy: blockNumber, orderDirection: asc, where: {blockNumber_gte: ${currentBlockNumber}, id_not_in: [${formattedTxHashes}]}) {
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
      const result = await firstValueFrom(
        this.httpService.post(this.config.values.SUBGRAPH_ORDERBOOK_ENDPOINT, {
          query: queryString,
        }),
      );
      if (result?.data?.data?.orderCancelEntities?.length) {
        return result.data.data.orderCancelEntities[0];
      }
    } catch (e) {
      console.log(e);
    }
  }
}
