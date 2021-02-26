/* eslint-disable prefer-const */ // to satisfy AS compiler

// For each division by 10, add one to exponent to truncate one significant figure
import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import { Market, Comptroller } from '../types/schema'
// PriceOracle is valid from Comptroller deployment until block 8498421
import { PriceOracle } from '../types/templates/CToken/PriceOracle'
import { Comptroller as ComptrollerContract } from '../types/Comptroller/Comptroller'
import { ERC20 } from '../types/templates/CToken/ERC20'
import { CToken } from '../types/templates/CToken/CToken'

import {
  exponentToBigDecimal,
  mantissaFactor,
  priceOracleAddress,
  mantissaFactorBD,
  cTokenDecimalsBD,
  zeroBD,
  zeroBI,
  cETHAddress,
  comptrollerAddress,
} from './helpers'

// todo: 修改
let cUSDTAddress = '0x2394de3827e233298fff0fdf6aa261070bfe013d'
let daiAddress = '0x6b175474e89094c44da98b954eedeac495271d0f'

// Used for all cERC20 contracts
function getTokenPrice(
  blockNumber: i32,
  eventAddress: Address,
  underlyingAddress: Address,
  underlyingDecimals: i32,
): BigDecimal {
  let comptroller = Comptroller.load('1')
  let oracleAddress = comptroller.priceOracle as Address
  if (comptroller == null) {
    oracleAddress = Address.fromString(priceOracleAddress)
  }

  let mantissaDecimalFactor = 18 - underlyingDecimals + 18
  let bdFactor = exponentToBigDecimal(mantissaDecimalFactor)
  let oracle2 = PriceOracle.bind(oracleAddress)
  let underlyingPrice = oracle2.try_getUnderlyingPrice(eventAddress)
  let price = zeroBI
  if (!underlyingPrice.reverted) {
    price = underlyingPrice.value
  }
  return price.toBigDecimal().div(bdFactor)
}

// Returns the price of USDT in eth. i.e. 0.005 would mean ETH is $200
function getUSDTpriceETH(): BigDecimal {
  let comptroller = Comptroller.load('1')
  let oracleAddress = comptroller.priceOracle as Address
  if (comptroller == null) {
    oracleAddress = Address.fromString(priceOracleAddress)
  }
  let usdPrice: BigDecimal

  let oracle2 = PriceOracle.bind(oracleAddress)
  let mantissaDecimalFactorUSDC = 18 - 6 + 18
  let bdFactorUSDT = exponentToBigDecimal(mantissaDecimalFactorUSDC)
  let underlyingPrice = oracle2.try_getUnderlyingPrice(Address.fromString(cUSDTAddress))
  let price = zeroBI
  if (!underlyingPrice.reverted) {
    price = underlyingPrice.value
  }
  usdPrice = price.toBigDecimal().div(bdFactorUSDT)
  return usdPrice
}

function getSashimiSpeed(cTokenAddress: string): BigDecimal {
  let contract = ComptrollerContract.bind(Address.fromString(comptrollerAddress))
  let sashimiSpeed = BigDecimal.fromString('0')
  let resp = contract.try_sashimiSpeeds(Address.fromString(cTokenAddress))
  if (!resp.reverted) {
    sashimiSpeed = resp.value.toBigDecimal().div(BigDecimal.fromString('1e18'))
  }
  return sashimiSpeed
}

function getRate(apy: BigInt): BigDecimal {
  return apy
    .toBigDecimal()
    .times(BigDecimal.fromString('2102400'))
    .div(mantissaFactorBD)
    .truncate(mantissaFactor)
}

export function createMarket(marketAddress: string): Market {
  let market: Market
  let contract = CToken.bind(Address.fromString(marketAddress))

  // It is CETH, which has a slightly different interface
  if (marketAddress == cETHAddress) {
    market = new Market(marketAddress)
    market.underlyingAddress = Address.fromString(
      '0x0000000000000000000000000000000000000000',
    )
    market.underlyingDecimals = 18
    market.underlyingPrice = BigDecimal.fromString('1')
    // todo: 原生币种信息
    market.underlyingName = 'Ether'
    market.underlyingSymbol = 'ETH'
    market.underlyingPriceUSD = zeroBD
    // It is all other CERC20 contracts
  } else {
    market = new Market(marketAddress)
    let underlyingAddress = contract.try_underlying()
    if (underlyingAddress.reverted) {
      market.underlyingAddress = Address.fromString(
        '0x0000000000000000000000000000000000000000',
      )
    } else {
      market.underlyingAddress = underlyingAddress.value
    }
    let underlyingContract = ERC20.bind(market.underlyingAddress as Address)
    market.underlyingDecimals = underlyingContract.decimals()
    if (market.underlyingAddress.toHexString() != daiAddress) {
      market.underlyingName = underlyingContract.name()
      market.underlyingSymbol = underlyingContract.symbol()
    } else {
      market.underlyingName = 'Dai Stablecoin v1.0 (DAI)'
      market.underlyingSymbol = 'DAI'
    }
    market.underlyingPriceUSD = zeroBD
    market.underlyingPrice = zeroBD
    if (marketAddress == cUSDTAddress) {
      market.underlyingPriceUSD = BigDecimal.fromString('1')
    }
  }

  let interestRateModelAddress = contract.try_interestRateModel()
  let reserveFactor = contract.try_reserveFactorMantissa()
  market.sashimiSpeed = getSashimiSpeed(marketAddress)
  market.accrueInterest = zeroBD
  market.cash = zeroBD
  market.volume = zeroBD
  market.volumeUSD = zeroBD
  market.collateralFactor = zeroBD
  market.exchangeRate = zeroBD
  market.interestRateModelAddress = interestRateModelAddress.reverted
    ? Address.fromString('0x0000000000000000000000000000000000000000')
    : interestRateModelAddress.value
  market.name = contract.name()
  market.reserves = zeroBD
  let borrowRatePerBlock = BigInt.fromI32(0)
  let borrowRateFromChain = contract.try_borrowRatePerBlock()
  if (!borrowRateFromChain.reverted) {
    borrowRatePerBlock = borrowRateFromChain.value
  }

  // Must convert to BigDecimal, and remove 10^18 that is used for Exp in Compound Solidity
  market.borrowRate = getRate(borrowRatePerBlock)

  // This fails on only the first call to cZRX. It is unclear why, but otherwise it works.
  // So we handle it like this.
  let supplyRatePerBlock = contract.try_supplyRatePerBlock()
  if (supplyRatePerBlock.reverted) {
    log.info('***CALL FAILED*** : cERC20 supplyRatePerBlock() reverted', [])
    market.supplyRate = zeroBD
  } else {
    market.supplyRate = getRate(supplyRatePerBlock.value)
  }
  market.symbol = contract.symbol()
  market.totalBorrows = zeroBD
  market.totalSupply = zeroBD
  market.accrualBlockNumber = 0
  market.blockTimestamp = 0
  market.borrowIndex = zeroBD
  market.reserveFactor = reserveFactor.reverted ? BigInt.fromI32(0) : reserveFactor.value

  return market
}

// Only to be used after block 10678764, since it's aimed to fix the change to USD based price oracle.
function getETHinUSD(blockNumber: i32): BigDecimal {
  let comptroller = Comptroller.load('1')
  let oracleAddress = comptroller.priceOracle as Address
  let oracle = PriceOracle.bind(oracleAddress)
  let ethPriceInUSD = oracle
    .getUnderlyingPrice(Address.fromString(cETHAddress))
    .toBigDecimal()
    .div(mantissaFactorBD)
  return ethPriceInUSD
}

export function updateMarket(
  marketAddress: Address,
  blockNumber: i32,
  blockTimestamp: i32,
): Market {
  let marketID = marketAddress.toHexString()
  let market = Market.load(marketID)
  if (market == null) {
    market = createMarket(marketID)
  }

  // Only updateMarket if it has not been updated this block
  if (market.accrualBlockNumber != blockNumber) {
    let contractAddress = Address.fromString(market.id)
    let contract = CToken.bind(contractAddress)
    let ethPriceInUSD = getETHinUSD(blockNumber)

    // if cETH, we only update USD price
    if (market.id == cETHAddress) {
      market.underlyingPriceUSD = ethPriceInUSD.truncate(market.underlyingDecimals)
    } else {
      let tokenPriceUSD = getTokenPrice(
        blockNumber,
        contractAddress,
        market.underlyingAddress as Address,
        market.underlyingDecimals,
      )
      market.underlyingPrice = ethPriceInUSD.equals(zeroBD)
        ? ethPriceInUSD
        : tokenPriceUSD.div(ethPriceInUSD).truncate(market.underlyingDecimals)
      // if USDT, we only update ETH price
      if (market.id != cUSDTAddress) {
        market.underlyingPriceUSD = tokenPriceUSD.truncate(market.underlyingDecimals)
      }
    }
    market.sashimiSpeed = getSashimiSpeed(marketAddress.toHexString())
    market.accrualBlockNumber = contract.accrualBlockNumber().toI32()
    market.blockTimestamp = blockTimestamp
    market.totalSupply = contract
      .totalSupply()
      .toBigDecimal()
      .div(cTokenDecimalsBD)

    /* Exchange rate explanation
       In Practice
        - If you call the cDAI contract on etherscan it comes back (2.0 * 10^26)
        - If you call the cUSDC contract on etherscan it comes back (2.0 * 10^14)
        - The real value is ~0.02. So cDAI is off by 10^28, and cUSDC 10^16
       How to calculate for tokens with different decimals
        - Must div by tokenDecimals, 10^market.underlyingDecimals
        - Must multiply by ctokenDecimals, 10^8
        - Must div by mantissa, 10^18
     */
    market.exchangeRate = contract
      .exchangeRateStored()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .times(cTokenDecimalsBD)
      .div(mantissaFactorBD)
      .truncate(mantissaFactor)
    market.borrowIndex = contract
      .borrowIndex()
      .toBigDecimal()
      .div(mantissaFactorBD)
      .truncate(mantissaFactor)

    market.reserves = contract
      .totalReserves()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)
    market.totalBorrows = contract
      .totalBorrows()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)
    market.cash = contract
      .getCash()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)

    let borrowRatePerBlock = BigInt.fromI32(0)
    let borrowRateFromChain = contract.try_borrowRatePerBlock()
    if (!borrowRateFromChain.reverted) {
      borrowRatePerBlock = borrowRateFromChain.value
    }

    // Must convert to BigDecimal, and remove 10^18 that is used for Exp in Compound Solidity
    market.borrowRate = getRate(borrowRatePerBlock)

    // This fails on only the first call to cZRX. It is unclear why, but otherwise it works.
    // So we handle it like this.
    let supplyRatePerBlock = contract.try_supplyRatePerBlock()
    if (supplyRatePerBlock.reverted) {
      log.info('***CALL FAILED*** : cERC20 supplyRatePerBlock() reverted', [])
      market.supplyRate = zeroBD
    } else {
      market.supplyRate = getRate(supplyRatePerBlock.value)
    }
    market.save()
  }
  return market as Market
}
