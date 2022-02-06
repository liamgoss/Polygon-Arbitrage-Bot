require("dotenv").config();
const config = require('../config.json')
const HDWalletProvider = require('@truffle/hdwallet-provider');
const Web3 = require('web3')
let web3

if (!config.PROJECT_SETTINGS.isLocal) {
    let provider = new HDWalletProvider({
        privateKeys: [process.env.DEPLOYMENT_ACCOUNT_KEY],
        providerOrUrl: `wss://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    })
    web3 = new Web3(provider)   
} else {
    web3 = new Web3('ws://127.0.0.1:7545')
}

const UniswapV3Router = require('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json')
const UniswapV3Factory = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json")
const SushiswapFactory = require("../sushiFactory_ABI.json")
const SushiswapRouter = require("../sushiROUTER_ABI.json")
const qSwapFactory = require("../qSwapFactory.json")
const qSwapRouter = require("../quickSwapRouter_ABI.json")

const uFactory = new web3.eth.Contract(UniswapV3Factory.abi, config.UNISWAP.FACTORY_ADDRESS) // UNISWAP FACTORY CONTRACT
//const uRouter = new web3.eth.Contract(UniswapV3Router.abi, config.UNISWAP.V3_ROUTER_02_ADDRESS) // UNISWAP ROUTER CONTRACT
const uRouter = new web3.eth.Contract(qSwapRouter.abi, config.QUICKSWAP.V3_ROUTER_02_ADDRESS) // UNISWAP ROUTER CONTRACT

const sFactory = new web3.eth.Contract(SushiswapFactory.abi, config.SUSHISWAP.FACTORY_ADDRESS) // SUSHISWAP FACTORY CONTRACT
const sRouter = new web3.eth.Contract(SushiswapRouter.abi, config.SUSHISWAP.V3_ROUTER_02_ADDRESS) // SUSHISWAP ROUTER CONTRACT

const qFactory = new web3.eth.Contract(qSwapFactory.abi, config.QUICKSWAP.FACTORY_ADDRESS) // QUICKSWAP FACTORY CONTRACT
const qRouter = new web3.eth.Contract(qSwapRouter.abi, config.QUICKSWAP.V3_ROUTER_02_ADDRESS)
const IArbitrage = require('../build/contracts/Flashloan.json')
//const arbitrage = new web3.eth.Contract(IArbitrage.abi, IArbitrage.networks[1].address);
const arbitrage = new web3.eth.Contract(IArbitrage.abi, "0x601F064dB72129d5E58412A158Fa2b35a2Fd302f");

module.exports = {
    uFactory,
    uRouter,
    sFactory,
    sRouter,
    qFactory,
    qRouter,
    web3,
    arbitrage
}