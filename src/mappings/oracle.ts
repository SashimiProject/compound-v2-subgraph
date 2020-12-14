// This should be the first event acccording to etherscan but it isn't.... price oracle is. weird
import { Address } from '@graphprotocol/graph-ts'
import { PriceUpdated } from '../types/Oracle/PriceOracle'
import { PriceOracle } from '../types/Oracle/PriceOracle'
import { createMarket, getETHinUSD } from './markets'
import { priceOracleAddress, ADDRESS_ZERO, zeroBD, exponentToBigDecimal } from './helpers'
import { Market } from '../types/schema'
import { CToken } from '../types/templates/CToken/CToken'

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
    market = createMarket(marketAddress.toHexString())
  }
  let mantissaDecimalFactor = 18 - market.underlyingDecimals + 18
  let bdFactor = exponentToBigDecimal(mantissaDecimalFactor)
  let underlyingPrice = price.toBigDecimal().div(bdFactor)

  let blockNumber = event.block.number.toI32()
  let ethPriceInUSD = getETHinUSD(blockNumber)

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
}
