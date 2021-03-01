// This should be the first event acccording to etherscan but it isn't.... price oracle is. weird
import { Address, BigDecimal, log } from '@graphprotocol/graph-ts'
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

function getPrice(
  cToken: Address,
  oracleAddress: Address,
  underlyingDecimals: i32,
): BigDecimal {
  let oracle = PriceOracle.bind(oracleAddress)
  let price = oracle.getUnderlyingPrice(cToken)
  let mantissaDecimalFactor = 18 - underlyingDecimals + 18
  let bdFactor = exponentToBigDecimal(mantissaDecimalFactor)
  return price.toBigDecimal().div(bdFactor)
}

function getAddressBySymbol(symbol: string): Address {
  let oracle = PriceOracle.bind(Address.fromString(priceOracleAddress))
  let tokenConfig = oracle.try_getTokenConfigBySymbol(symbol)
  if (tokenConfig.reverted) {
    log.debug('call get Token Config failed', [])
    return Address.fromString(ADDRESS_ZERO)
  }
  log.debug('call get Token Config success', [])
  return tokenConfig.value.slToken
}

export function handleNewPrice(event: PriceUpdated): void {
  let marketAddress = getAddressBySymbol(event.params.symbol)
  if (marketAddress.equals(Address.fromString(ADDRESS_ZERO))) {
    return
  }
  let market = Market.load(marketAddress.toHexString())
  if (market == null) {
    return
  }

  let ethPriceInUSD = getPrice(
    Address.fromString(cETHAddress),
    Address.fromString(priceOracleAddress),
    18,
  )
  let underlyingPrice = getPrice(
    marketAddress,
    Address.fromString(priceOracleAddress),
    market.underlyingDecimals,
  )

  // if cETH, we only update USD price
  // todo: 改为原生token 的symbol
  if (event.params.symbol == 'BNB') {
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
