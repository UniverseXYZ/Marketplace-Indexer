import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Repository, IsNull, Not } from 'typeorm';
import { MarketplaceIndexer } from './order.entity';
import { OrderMatchEntity, OrderCancelEntity } from './order.types';
import { AppConfig } from '../configuration/configuration.service';
import R, { insert, where } from 'ramda';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { EventTypesEnum } from './order.types';
import { ethers } from 'ethers';

@Injectable()
export class OrdersService implements OnModuleInit {
  private currentMatchBlockNumber = 0;
  private isMatchEventsInProcess = false;

  private currentCancelBlockNumber = 0;
  private isCancelEventsInProcess = false;

  private logger = new Logger(this.constructor.name);

  constructor(
    @InjectRepository(MarketplaceIndexer)
    private readonly marketplaceIndexerRepository: Repository<MarketplaceIndexer>,
    private readonly config: AppConfig,
    private httpService: HttpService,
    private schedulerRegistry: SchedulerRegistry,
  ) {}

  /**
   * This method executes on the module initialization and starts
   * the Indexer's cron job.
   */
  public onModuleInit() {
    const orderStatusCronJob = new CronJob(
      this.config.values.SUBGRAPH_POLLING_CRON,
      async () => {
        await this.updateMatchOrdersStatus();
        await this.updateCancelOrdersStatus();
      },
    );
    const orderbookStatusCronJob = new CronJob(
      CronExpression.EVERY_HOUR,
      async () => {
        await this.ensureDeliveryToMarketplace(EventTypesEnum.MATCH);
        await this.ensureDeliveryToMarketplace(EventTypesEnum.CANCEL);
      },
    );

    this.schedulerRegistry.addCronJob(
      'Polling the subgraph, wait and see...',
      orderStatusCronJob,
    );
    this.schedulerRegistry.addCronJob(
      'Making sure match & cancel events are sent to the Orderbook.',
      orderbookStatusCronJob,
    );
    orderStatusCronJob.start();
    orderbookStatusCronJob.start();
  }

  /**
   *
   * #1 Get the current latesed blocktime from database
   * #2 Query thegraph api for the next one
   * #3 Save new event to database
   * #4 Send event to marketplace backend by calling its internal endpoint
   */
  // @Cron(CronExpression.EVERY_5_SECONDS)
  public async updateMatchOrdersStatus() {
    if (!this.isMatchEventsInProcess) {
      this.isMatchEventsInProcess = true;

      if (this.currentMatchBlockNumber <= 0) {
        const latestMatchEvent = await this.getLatestEvent(
          EventTypesEnum.MATCH,
        );
        this.logger.log(
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
            this.logger.log(
              `Got new Match event, tx hash: ${newMatchEvent.id}`,
            );

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
          this.logger.error('Error processing new Match events: ' + e);
        }
      }

      this.isMatchEventsInProcess = false;
    } else {
      this.logger.log('Match events are in process, skipping ...');
    }
  }

  public async updateCancelOrdersStatus() {
    // Pulling & processing Cancel events from the subgraph
    if (!this.isCancelEventsInProcess) {
      this.isCancelEventsInProcess = true;

      if (this.currentCancelBlockNumber <= 0) {
        const latestCancelEvent = await this.getLatestEvent(
          EventTypesEnum.CANCEL,
        );
        this.logger.log(
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
            this.logger.log(
              `Got new Cancel event, tx hash: ${newCancelEvent.id}`,
            );
            const savedCancelEvent = await this.saveNewEvent(
              newCancelEvent,
              EventTypesEnum.CANCEL,
            );
            this.currentCancelBlockNumber = savedCancelEvent.blockNumber;

            eventsToSync.push(savedCancelEvent);
          }

          await this.syncToMarketplace(eventsToSync);
        } catch (e) {
          this.logger.error('Error processing new Cancel events: ' + e);
        }
      }

      this.isCancelEventsInProcess = false;
    } else {
      this.logger.log('Cancel events are in process, skipping ...');
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
  //     this.logger.error(e);
  //   }
  // }

  private async syncToMarketplace(events: MarketplaceIndexer[]) {
    if (events.length) {
      try {
        if (EventTypesEnum.MATCH === events[0].type) {
          const matchResult = await firstValueFrom(
            this.httpService.put(
              `${this.config.values.ORDERBOOK_URL}/internal/orders/match`,
              {
                events: events,
              },
            ),
          );
          await this.udateOrderbookStatus(matchResult.data);
        } else if (EventTypesEnum.CANCEL === events[0].type) {
          const cancelResult = await firstValueFrom(
            this.httpService.put(
              `${this.config.values.ORDERBOOK_URL}/internal/orders/cancel`,
              {
                events: events,
              },
            ),
          );
          await this.udateOrderbookStatus(cancelResult.data);
        }
      } catch (e) {
        this.logger.error(e);
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
      this.logger.error(error);
    }
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
      this.logger.error(error);
    }

    return value;
  }

  /**
   * Makes a GraphQL request to the subgraph to get the Cancel event which has not yet been
   * saved into the marketplace-indexer table.
   * Return the Cancel event data.
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
      this.logger.error(e);
    }

    return value;
  }

  /**
   * Updates the orderbookStatus property of the entries in the
   * marketplace-indexer table.
   * @param events - object as follows: {
   *  'txHash1': 'success',
   *  'txHash2': 'not found',
   *  'txHash3': 'error: ',
   *  ...
   * }
   * @returns void
   * @throws {Error}
   */
  private async udateOrderbookStatus(events) {
    const txHashes = Object.keys(events);
    if (Array.isArray(txHashes) && ethers.utils.isHexString(txHashes[0])) {
      for (const txHash of txHashes) {
        try {
          await this.marketplaceIndexerRepository
            .createQueryBuilder()
            .update(MarketplaceIndexer)
            .set({
              orderbookStatus: events[txHash],
            })
            .where({
              txHash: txHash,
            })
            .execute();
        } catch (e) {
          this.logger.error('Error updating orderbookStatus: ' + e);
        }
      }
    } else {
      throw new Error(
        `udateOrderbookStatus: Invalid events input format. Expected txHashes as keys, got ${JSON.stringify(
          events,
        )}`,
      );
    }
  }

  /**
   * This methos is intented to be called by a cron job and
   * its purpose is to find all events from the marketplace-indexer
   * table with orderbookStatus != success or != not found
   * and send its statuses once again.
   * Thus the Indexer sends match and cancel events if it failed to
   * send it before for any reason.
   */
  private async ensureDeliveryToMarketplace(eventType: EventTypesEnum) {
    this.logger.log(
      `Running extra synchronization of ${eventType} events to the Marketplace...`,
    );
    const events = await this.marketplaceIndexerRepository
      .createQueryBuilder()
      .select([
        'mi.type',
        'mi.txHash',
        'mi.leftOrderHash',
        'mi.leftMaker',
        'mi.rightMaker',
      ])
      .from(MarketplaceIndexer, 'mi')
      .where(
        `
        mi.type = :type AND
        mi.orderbookStatus IS NULL
      `,
        {
          type: eventType,
        },
      )
      .take(50)
      .getMany();
    this.logger.log(
      `Found ${events.length} ${eventType} events which require synchronization.`,
    );
    await this.syncToMarketplace(events);
    this.logger.log(
      `Completed extra synchronization of ${eventType} events to the Marketplace.`,
    );
  }
}
