// This should be the first event acccording to etherscan but it isn't.... price oracle is. weird
import { Address, BigDecimal } from '@graphprotocol/graph-ts'
import { PriceUpdated } from '../types/Oracle/PriceOracle'
import { PriceOracle } from '../types/Oracle/PriceOracle'
import {
  priceOracleAddress,
  ADDRESS_ZERO,
  zeroBD,
  exponentToBigDecimal,
  cETHAddress,
  mantissaFactorBD,
} from './helpers'
import { Comptroller, Market } from '../types/schema'

function getETHPrice(): BigDecimal {
  let comptroller = Comptroller.load('1')
  let oracleAddress = comptroller.priceOracle as Address
  let oracle = PriceOracle.bind(oracleAddress)
  let ethPriceInUSD = oracle
    .getUnderlyingPrice(Address.fromString(cETHAddress))
    .toBigDecimal()
    .div(mantissaFactorBD)
  return ethPriceInUSD
}

function getAddressBySymbol(symbol: string): Address {
  let oracle = PriceOracle.bind(Address.fromString(priceOracleAddress))
  let tokenConfig = oracle.try_getTokenConfigBySymbol(symbol)
  if (tokenConfig.reverted) {
    return Address.fromString(ADDRESS_ZERO)
  }
  return tokenConfig.value.underlying
}

export function handleNewPrice(event: PriceUpdated): void {
  let price = event.params.price
  let marketAddress = getAddressBySymbol(event.params.symbol)
  if (marketAddress.equals(Address.fromString(ADDRESS_ZERO))) {
    return
  }
  let market = Market.load(marketAddress.toHexString())
  if (market == null) {
    return
  }
  let mantissaDecimalFactor = 18 - market.underlyingDecimals + 18
  let bdFactor = exponentToBigDecimal(mantissaDecimalFactor)
  let underlyingPrice = price.toBigDecimal().div(bdFactor)

  let blockNumber = event.block.number.toI32()
  let ethPriceInUSD = getETHPrice()

  // if cETH, we only update USD price
  if (event.params.symbol == 'ETH') {
    market.underlyingPriceUSD = ethPriceInUSD.truncate(market.underlyingDecimals)
  } else {
    market.underlyingPrice = ethPriceInUSD.equals(zeroBD)
      ? ethPriceInUSD
      : underlyingPrice.div(ethPriceInUSD).truncate(market.underlyingDecimals)
    // if USDT, we only update ETH price
    if (event.params.symbol != 'USDT') {
      market.underlyingPriceUSD = underlyingPrice.truncate(market.underlyingDecimals)
    }
  }
  market.save()
}
