/* eslint-disable prefer-const */ // to satisfy AS compiler

// For each division by 10, add one to exponent to truncate one significant figure
import { Address, BigDecimal, BigInt, Bytes } from '@graphprotocol/graph-ts'
import {
  AccountCToken,
  Account,
  AccountCTokenTransaction,
  Comptroller,
  PriceAggregator,
} from '../types/schema'

export function exponentToBigDecimal(decimals: i32): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = 0; i < decimals; i++) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}

export let mantissaFactor = 18
export let cTokenDecimals = 8
export let mantissaFactorBD: BigDecimal = exponentToBigDecimal(18)
export let cTokenDecimalsBD: BigDecimal = exponentToBigDecimal(8)
export let zeroBI = BigInt.fromI32(0)
export let zeroBD = BigDecimal.fromString('0')
// todo: 修改comptroller address
export let comptrollerAddress = '0xb5d53ec97bed54fe4c2b77f275025c3fc132d770'
// todo: 修改price feed address
export let priceOracleAddress = '0x9ff795a1fb46f869b9158ef0579a613177d68b26'
// todo: 原生币的slToken地址
export let cETHAddress = '0xc597f86424eeb6599ea40f999dbb739e3aca5d82'
export let ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

// export let priceContractMap = new Map([
//   ["",""],
// ])

export function createAccountCToken(
  cTokenStatsID: string,
  symbol: string,
  account: string,
  marketID: string,
): AccountCToken {
  let cTokenStats = new AccountCToken(cTokenStatsID)
  cTokenStats.symbol = symbol
  cTokenStats.market = marketID
  cTokenStats.account = account
  cTokenStats.accrualBlockNumber = BigInt.fromI32(0)
  cTokenStats.cTokenBalance = zeroBD
  cTokenStats.totalUnderlyingSupplied = zeroBD
  cTokenStats.totalUnderlyingRedeemed = zeroBD
  cTokenStats.accountBorrowIndex = zeroBD
  cTokenStats.totalUnderlyingBorrowed = zeroBD
  cTokenStats.totalUnderlyingRepaid = zeroBD
  cTokenStats.storedBorrowBalance = zeroBD
  cTokenStats.enteredMarket = false
  return cTokenStats
}

export function createAccount(accountID: string): Account {
  let account = new Account(accountID)
  account.countLiquidated = 0
  account.countLiquidator = 0
  account.hasBorrowed = false
  account.save()
  return account
}

export function updateCommonCTokenStats(
  marketID: string,
  marketSymbol: string,
  accountID: string,
  tx_hash: Bytes,
  timestamp: BigInt,
  blockNumber: BigInt,
  logIndex: BigInt,
): AccountCToken {
  let cTokenStatsID = marketID.concat('-').concat(accountID)
  let cTokenStats = AccountCToken.load(cTokenStatsID)
  if (cTokenStats == null) {
    cTokenStats = createAccountCToken(cTokenStatsID, marketSymbol, accountID, marketID)
  }
  getOrCreateAccountCTokenTransaction(
    cTokenStatsID,
    tx_hash,
    timestamp,
    blockNumber,
    logIndex,
  )
  cTokenStats.accrualBlockNumber = blockNumber
  return cTokenStats as AccountCToken
}

export function getOrCreateAccountCTokenTransaction(
  accountID: string,
  txHash: Bytes,
  timestamp: BigInt,
  block: BigInt,
  logIndex: BigInt,
): AccountCTokenTransaction {
  let id = accountID
    .concat('-')
    .concat(txHash.toHexString())
    .concat('-')
    .concat(logIndex.toString())
  let transaction = AccountCTokenTransaction.load(id)

  if (transaction == null) {
    transaction = new AccountCTokenTransaction(id)
    transaction.account = accountID
    transaction.tx_hash = txHash
    transaction.timestamp = timestamp
    transaction.block = block
    transaction.logIndex = logIndex
    transaction.save()
  }

  return transaction as AccountCTokenTransaction
}

export function initPriceAggregator(): void {
  createPriceAggregator(
    '0xd3fcd40153e56110e6eeae13e12530e26c9cb4fd',
    '0xc597f86424eeb6599ea40f999dbb739e3aca5d82',
    8,
    'ETH / USD',
  )
  createPriceAggregator(
    '0x7104ac4abcecf1680f933b04c214b0c491d43ecc',
    '0x09a7fb5e4499e61c7cf53acb8df7b2a8e4fb36f9',
    8,
    'BTC / USD',
  )
  createPriceAggregator(
    '0x4588ec4ddcf1d8dbcb5a1273d22f8485885c45a4',
    '0x2918231f262f764dbb5753a95bd7684fdb313ea4',
    8,
    'DAI / USD',
  )
}

function createPriceAggregator(
  address: string,
  marketId: string,
  decimals: i32,
  pair: string,
): void {
  let priceAggregator = PriceAggregator.load(address)
  if (priceAggregator != null) {
    return
  }
  priceAggregator = new PriceAggregator(address)
  priceAggregator.marketId = marketId
  priceAggregator.Decimals = decimals
  priceAggregator.pair = pair
  priceAggregator.currentValue = zeroBD
  priceAggregator.updatedAt = zeroBI
  priceAggregator.roundId = zeroBI

  priceAggregator.save()
}
