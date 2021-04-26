import { AnswerUpdated } from '../types/Comptroller/PriceAggregatorProxy'
import { PriceAggregator, Market } from '../types/schema'
import { exponentToBigDecimal, zeroBD } from './helpers'

// mainnet
let ethAggregatorAddress = '0xd3fcd40153e56110e6eeae13e12530e26c9cb4fd'

export function handleAnswerUpdated(event: AnswerUpdated): void {
  let aggregatorAddress = event.address.toHexString()
  let aggregator = PriceAggregator.load(aggregatorAddress)
  if (aggregator == null) {
    return
  }

  var price = event.params.current
    .toBigDecimal()
    .div(exponentToBigDecimal(aggregator.Decimals))
    .truncate(aggregator.Decimals)

  aggregator.currentValue = price
  aggregator.roundId = event.params.roundId
  aggregator.updatedAt = event.params.updatedAt
  aggregator.save()

  let market = Market.load(aggregator.marketId)
  if (market == null) {
    return
  }

  market.underlyingPriceUSD = price
  if (aggregatorAddress != ethAggregatorAddress) {
    let ethAggregator = PriceAggregator.load(ethAggregatorAddress)
    if (ethAggregator != null && ethAggregator.currentValue > zeroBD) {
      market.underlyingPrice = price.div(ethAggregator.currentValue).truncate(18)
    }
  }
  market.save()
}
