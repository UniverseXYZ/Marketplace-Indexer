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
