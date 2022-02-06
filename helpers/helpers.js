require("dotenv").config();
const config = require("../config.json")

const Big = require('big.js');
const Web3 = require('web3');
let web3

if (!config.PROJECT_SETTINGS.isLocal) {
    //web3 = new Web3(`wss://polygon-mainnet.infura.io/v3/${process.env.INFURA_API_KEY }`)
    web3 = new Web3(`wss://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`)
} else {
    web3 = new Web3('ws://127.0.0.1:7545')
}

const { ChainId, Token } = require("@uniswap/sdk")
const IUniswapV2Pair = require("@uniswap/v2-core/build/IUniswapV2Pair.json") // This isn't the V3 version, does that matter?
const quickSwapPair = require("../qSwapFactory.json")
const IERC20 = require('@openzeppelin/contracts/build/contracts/ERC20.json');
const { sFactory, qFactory } = require("./initialization");

async function getTokenAndContract(_token0Address, _token1Address) {
    const token0Contract = new web3.eth.Contract(IERC20.abi, _token0Address)
    const token1Contract = new web3.eth.Contract(IERC20.abi, _token1Address)

    const token0 = new Token(
        ChainId.MAINNET,
        _token0Address,
        18,
        await token0Contract.methods.symbol().call(),
        await token0Contract.methods.name().call()
    )

    const token1 = new Token(
        ChainId.MAINNET,
        _token1Address,
        18,
        await token1Contract.methods.symbol().call(),
        await token1Contract.methods.name().call()
    )

    return { token0Contract, token1Contract, token0, token1 }
}

async function getPairAddress(_V2Factory, _token0, _token1) {
    const pairAddress = await _V2Factory.methods.getPair(_token0, _token1).call()
    return pairAddress
}

async function getPairContract(_V2Factory, _token0, _token1) {
    const pairAddress = await getPairAddress(_V2Factory, _token0, _token1)
    const pairContract = new web3.eth.Contract(IUniswapV2Pair.abi, pairAddress)
    return pairContract
}

async function getReserves(_pairContract) {
    const reserves = await _pairContract.methods.getReserves().call()
    return [reserves.reserve0, reserves.reserve1]
}

async function calculatePrice(_pairContract) {
    const [reserve0, reserve1] = await getReserves(_pairContract)
    return Big(reserve0).div(Big(reserve1)).toString()

}

async function calculatePriceSixAndEighteen(_pairContract) {
    const [reserve0, reserve1] = await getReserves(_pairContract)
    return ((Big(reserve0).div(Big(reserve1))) * (10 ** 12)).toString()
}

async function calculatePriceNineAndEighteen(_pairContract) {
    const [reserve0, reserve1] = await getReserves(_pairContract)
    return ((Big(reserve0).div(Big(reserve1))) * (10 ** 9)).toString()
}

async function calculatePriceSixAndNine(_pairContract) {
    const [reserve0, reserve1] = await getReserves(_pairContract)
    return ((Big(reserve0).div(Big(reserve1))) * (10 ** 3)).toString()
}

function calculateDifference(uPrice, sPrice) {
    return (((uPrice - sPrice) / sPrice) * 100).toFixed(2)
}

async function getEstimatedReturn(amount, _routerPath, _token0, _token1) {
    const trade1 = await _routerPath[0].methods.getAmountsOut(amount, [_token0.address, _token1.address]).call()
    const trade2 = await _routerPath[1].methods.getAmountsOut(trade1[1], [_token1.address, _token0.address]).call()

    const amountIn = Number(web3.utils.fromWei(trade1[0], 'ether'))
    const amountOut = Number(web3.utils.fromWei(trade2[1], 'ether'))

    return { amountIn, amountOut }
}

module.exports = {
    getTokenAndContract,
    getPairAddress,
    getPairContract,
    getReserves,
    calculatePrice,
    calculatePriceSixAndEighteen,
    calculatePriceNineAndEighteen,
    calculatePriceSixAndNine,
    calculateDifference,
    getEstimatedReturn
}