export interface OrderMatchEntity {
  id: string;
  leftOrderHash: string;
  rightOrderHash: string;
  leftMaker: string;
  rightMaker: string;
  newLeftFill: string;
  newRightFill: string;
  txFrom: string;
  txValue: string;
  blockNumber: number;
  blockTimestamp: number;
  leftAssetClass: string;
  rightAssetClass: string;
  leftAssetData: string;
  rightAssetData: string;
}

export interface OrderCancelEntity {
  id: string;
  leftOrderHash: string;
  leftMaker: string;
  txFrom: string;
  txValue: string;
  blockNumber: number;
  blockTimestamp: number;
  leftAssetClass: string;
  rightAssetClass: string;
  leftAssetData: string;
  rightAssetData: string;
}

export enum EventTypesEnum {
  MATCH = 'match',
  CANCEL = 'cancel',
}