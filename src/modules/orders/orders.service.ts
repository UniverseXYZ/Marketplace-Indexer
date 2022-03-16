import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Repository } from 'typeorm';
import { MarketplaceIndexer } from './order.entity';
import { OrderMatchEntity, OrderCancelEntity } from './order.types';
import { AppConfig } from '../configuration/configuration.service';
import R, { insert } from 'ramda';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { EventTypesEnum } from './order.types';

@Injectable()
export class OrdersService implements OnModuleInit {
  private currentMatchBlockNumber = 0;
  private isMatchEventsInProcess = false;

  private currentCancelBlockNumber = 0;
  private isCancelEventsInProcess = false;

  constructor(
    @InjectRepository(MarketplaceIndexer)
    private readonly marketplaceIndexerRepository: Repository<MarketplaceIndexer>,
    private schedulerRegistry: SchedulerRegistry,
    private readonly config: AppConfig,
    private httpService: HttpService,
  ) {}

  /**
   * This method executes on the module initialization and starts
   * the Indexer's cron job.
   */
  public onModuleInit() {
    const cronJob = new CronJob(
      this.config.values.SUBGRAPH_POLLING_CRON,
      () => {
        this.updateOrderStatus();
      },
    );

    this.schedulerRegistry.addCronJob(
      'Polling the subgraph, wait and see...',
      cronJob,
    );
    cronJob.start();
  }

  /**
   *
   * #1 Get the current latesed blocktime from database
   * #2 Query thegraph api for the next one
   * #3 Save new event to database
   * #4 Send event to marketplace backend by calling its internal endpoint
   */
  // @Cron(CronExpression.EVERY_5_SECONDS)
  public async updateOrderStatus() {
    /**
     * @TODO there's no mechanism to ensure that events from the indexer
     * always find their way to the orderbook BE bc if the syncToMarketplace()
     * was unsuccessful, it does not repeat a try in the next iteration.
     * In the same time, the Indexer has to move forward with indexing the events and not be stale.
     */

    // Pulling & processing Match events from the subgraph
    if (!this.isMatchEventsInProcess) {
      this.isMatchEventsInProcess = true;

      if (this.currentMatchBlockNumber <= 0) {
        const latestMatchEvent = await this.getLatestEvent(
          EventTypesEnum.MATCH,
        );
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
      const newMatchEvents = await this.querySubgraphMatchEvents(
        this.currentMatchBlockNumber,
        matchTxHashesInCurrentBlock,
      );
      if (newMatchEvents.length) {
        // try catch block is to make sure the toggle isMatchEventsInProcess will eventually be set to false!
        // one important aspect here is that in case of an exception when saving events, we need to stop the whole batch (newMatchEvents array)
        // so that it will pull the same batch and retry on the next iteration.
        // that means the Indexer does not move forward if the exception keeps being thrown, rather than
        // moving forward with some event unprocessed and the problem left being unaware of.
        try {
          // this code must run synchronously bc there may be a case when one of the promises resolves successfully and its blockNumber
          // gets into the DB and the Indexer service restarts for any reason, the next iteration will pull events starting the latest
          // blockNumber but there may be unprocesessed events with lower blockNumber in the subgraph.
          const eventsToSync = [];
          for (const newMatchEvent of newMatchEvents) {
            console.log(`Got new Match event, tx hash: ${newMatchEvent.id}`);

            // bulk insert would increase the performance but we'd loose the cool feature of .save()
            // which is "upsert" way of saving objects which is quite useful in here. note that primary key is txHash.
            // await this.marketplaceIndexerRepository
            //   .createQueryBuilder()
            //   .insert()
            //   .into(MarketplaceIndexer)
            //   .values(  array of events  )
            //   .execute();

            const savedMatchEvent = await this.saveNewEvent(
              newMatchEvent,
              EventTypesEnum.MATCH,
            );
            this.currentMatchBlockNumber = savedMatchEvent.blockNumber;

            eventsToSync.push(savedMatchEvent);
          }

          await this.syncToMarketplace(eventsToSync); // does not throw any exceptions.
        } catch (e) {
          console.log('Error processing new Match events: ' + e);
        }
      }

      this.isMatchEventsInProcess = false;
    } else {
      console.log('Match events are in process, skipping ...');
    }

    // Pulling & processing Cancel events from the subgraph
    if (!this.isCancelEventsInProcess) {
      this.isCancelEventsInProcess = true;

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
      const newCancelEvents = await this.querySubgraphCancelEvents(
        this.currentCancelBlockNumber,
        cancelTxHashesInCurrentBlock,
      );
      if (newCancelEvents.length) {
        try {
          const eventsToSync = [];
          for (const newCancelEvent of newCancelEvents) {
            console.log(`Got new Cancel event, tx hash: ${newCancelEvent.id}`);
            const savedCancelEvent = await this.saveNewEvent(
              newCancelEvent,
              EventTypesEnum.CANCEL,
            );
            this.currentCancelBlockNumber = savedCancelEvent.blockNumber;

            eventsToSync.push(savedCancelEvent);
          }

          await this.syncToMarketplace(eventsToSync);
        } catch (e) {
          console.log('Error processing new Cancel events: ' + e);
        }
      }

      this.isCancelEventsInProcess = false;
    } else {
      console.log('Cancel events are in process, skipping ...');
    }
  }

  // private async syncToMarketplace(event: MarketplaceIndexer) {
  //   try {
  //     if (EventTypesEnum.MATCH === event.type) {
  //       await firstValueFrom(
  //         this.httpService.put(
  //           `${this.config.values.ORDERBOOK_URL}/v1/internal/orders/match`,
  //           {
  //             txHash: event.txHash,
  //             leftMaker: event.leftMaker,
  //             rightMaker: event.rightMaker,
  //             leftOrderHash: event.leftOrderHash,
  //             rightOrderHash: event.rightOrderHash,
  //             newLeftFill: event.newLeftFill,
  //             newRightFill: event.newRightFill,
  //             txFrom: event.txFrom,
  //           },
  //         ),
  //       );
  //     } else if (EventTypesEnum.CANCEL === event.type) {
  //       await firstValueFrom(
  //         this.httpService.put(
  //           `${this.config.values.ORDERBOOK_URL}/v1/internal/orders/cancel`,
  //           {
  //             txHash: event.txHash,
  //             leftMaker: event.leftMaker,
  //             leftOrderHash: event.leftOrderHash,
  //           },
  //         ),
  //       );
  //     }
  //   } catch (e) {
  //     console.log(e);
  //   }
  // }

  private async syncToMarketplace(events: MarketplaceIndexer[]) {
    if(events.length) {
      try {
        if (EventTypesEnum.MATCH === events[0].type) {
          await firstValueFrom(
            this.httpService.put(
              `${this.config.values.ORDERBOOK_URL}/v1/internal/orders/match`,
              events,
            ),
          );
        } else if (EventTypesEnum.CANCEL === events[0].type) {
          await firstValueFrom(
            this.httpService.put(
              `${this.config.values.ORDERBOOK_URL}/v1/internal/orders/cancel`,
              events,
            ),
          );
        }
      } catch (e) {
        console.log(e);
      }
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
        type: EventTypesEnum.MATCH,
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

    const savedEvent = await this.marketplaceIndexerRepository.save(newData);
    return savedEvent;
  }

  private async querySubgraphMatchEvents(
    currentBlockNumber: number,
    txHashes: string[],
  ): Promise<OrderMatchEntity[]> {
    let value: OrderMatchEntity[] = [];
    const formattedTxHashes = `\"${txHashes.join(`\", \"`)}\"`;
    const queryString = `{
      orderMatchEntities(first: ${this.config.values.SUBGRAPH_POLLING_NUMBER}, orderBy: blockNumber, orderDirection: asc, where: {blockNumber_gte: ${currentBlockNumber}, id_not_in: [${formattedTxHashes}]}) {
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
        value = result.data.data.orderMatchEntities;
      }
    } catch (error) {
      console.log(error);
    }

    return value;
  }

  /**
   * Makes a GraphQL request to the subgraph to get the Cancel event which has not yet been
   * saved into the marketplace-indexer table.
   * Return the array with Cancel events data.
   * @param currentBlockNumber
   * @param txHashes
   * @returns Promise<OrderCancelEntity[]>
   */
  private async querySubgraphCancelEvents(
    currentBlockNumber: number,
    txHashes: string[],
  ): Promise<OrderCancelEntity[]> {
    let value: OrderCancelEntity[] = [];
    const formattedTxHashes = `\"${txHashes.join(`\", \"`)}\"`;
    const queryString = `{
      orderCancelEntities(first: ${this.config.values.SUBGRAPH_POLLING_NUMBER}, orderBy: blockNumber, orderDirection: asc, where: {blockNumber_gte: ${currentBlockNumber}, id_not_in: [${formattedTxHashes}]}) {
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
        value = result.data.data.orderCancelEntities;
      }
    } catch (e) {
      console.log(e);
    }

    return value;
  }
}
