var cluster = require('cluster');
if (cluster.isMaster) {
  cluster.fork();

  cluster.on('exit', function(worker, code, signal) {
    cluster.fork();
  });
}

if (cluster.isWorker) {
    // put your code here
    // -- HANDLE INITIAL SETUP -- //

    require('./helpers/server')
    require("dotenv").config();

    const config = require('./config.json')
    const { getTokenAndContract, getPairContract, calculatePrice, calculatePriceSixAndEighteen, calculatePriceNineAndEighteen, calculatePriceSixAndNine, getEstimatedReturn, getReserves } = require('./helpers/helpers')
    const { uFactory, uRouter, sFactory, sRouter, qFactory, qRouter, web3, arbitrage } = require('./helpers/initialization')

    // -- .ENV VALUES HERE -- //

    const arbFor = process.env.ARB_FOR // This is the address of token we are attempting to arbitrage (TOKEN_1)
    const arbAgainst = process.env.ARB_AGAINST // TOKEN_2
    const account = process.env.ACCOUNT // Account to recieve profit
    const units = process.env.UNITS // Used for price display/reporting
    const difference = process.env.PRICE_DIFFERENCE
    const gas = process.env.GAS_LIMIT
    const estimatedGasCost = process.env.GAS_PRICE // Estimated Gas

    let uPair, sPair, amount
    let isExecuting = false

    const main = async () => {
        const { token0Contract, token1Contract, token0, token1 } = await getTokenAndContract(arbFor, arbAgainst)
        uPair = await getPairContract(qFactory, token0.address, token1.address)
        sPair = await getPairContract(sFactory, token0.address, token1.address)


        uPair.events.Swap({}, async () => {
            if (!isExecuting) {
                isExecuting = true

                const priceDifference = await checkPrice('Quickswap', token0, token1)
                const routerPath = await determineDirection(priceDifference)

                if (!routerPath) {
                    console.log(`No Arbitrage Currently Available\n`)
                    console.log(`-----------------------------------------\n`)
                    isExecuting = false
                    return
                }

                const isProfitable = await determineProfitability(routerPath, token0Contract, token0, token1)

                if (!isProfitable) {
                    console.log(`No Arbitrage Currently Available\n`)
                    console.log(`-----------------------------------------\n`)
                    isExecuting = false
                    return
                }

                const receipt = await executeTrade(routerPath, token0Contract, token1Contract)

                isExecuting = false
            }
        })

        sPair.events.Swap({}, async () => {
            if (!isExecuting) {
                isExecuting = true

                const priceDifference = await checkPrice('Sushiswap', token0, token1)
                const routerPath = await determineDirection(priceDifference)

                if (!routerPath) {
                    console.log(`No Arbitrage Currently Available\n`)
                    console.log(`-----------------------------------------\n`)
                    isExecuting = false
                    return
                }

                const isProfitable = await determineProfitability(routerPath, token0Contract, token0, token1)

                if (!isProfitable) {
                    console.log(`No Arbitrage Currently Available\n`)
                    console.log(`-----------------------------------------\n`)
                    isExecuting = false
                    return
                }

                const receipt = await executeTrade(routerPath, token0Contract, token1Contract)

                isExecuting = false
            }
        })

        console.log("Waiting for swap event...")

    }

    const checkPrice = async (exchange, token0, token1) => {
        isExecuting = true

        console.log(`Swap Initiated on ${exchange}, Checking Price...\n`)

        const currentBlock = await web3.eth.getBlockNumber()

        const priceMode = parseInt(process.env.PRICE_MODE);

        var uPrice = await calculatePrice(uPair)
        var sPrice = await calculatePrice(sPair)

        switch (priceMode) {
            case 0:
                console.log("---------\nPRICE_MODE=0\n---------")
                uPrice = await calculatePrice(uPair)
                sPrice = await calculatePrice(sPair)
                break;
            case 1:
                console.log("---------\nPRICE_MODE=1\n---------")
                uPrice = await calculatePriceSixAndEighteen(uPair)
                sPrice = await calculatePriceSixAndEighteen(sPair)
                break;
            case 2:
                console.log("---------\nPRICE_MODE=2\n---------")
                uPrice = await calculatePriceNineAndEighteen(uPair)
                sPrice = await calculatePriceNineAndEighteen(sPair)
                break;
            case 3:
                console.log("---------\nPRICE_MODE=3\n---------")
                uPrice = await calculatePriceSixAndNine(uPair)
                sPrice = await calculatePriceSixAndNine(sPair)
                break;
        }


        const uFPrice = Number(uPrice).toFixed(units)
        const sFPrice = Number(sPrice).toFixed(units)
        const priceDifference = (((uFPrice - sFPrice) / sFPrice) * 100).toFixed(2)

        console.log(`Current Block: ${currentBlock}`)
        console.log(`-----------------------------------------`)
        console.log(`QUICKSWAP | ${token1.symbol}/${token0.symbol}\t | ${uFPrice}`)
        console.log(`SUSHISWAP | ${token1.symbol}/${token0.symbol}\t | ${sFPrice}\n`)
        console.log(`Percentage Difference: ${priceDifference}%\n`)

        if (isNaN(priceDifference)) {
            console.log("It is recommended that you pick a new token pair until a solution is discovered!")
            return 0;
        }

        return priceDifference
    }

    const determineDirection = async (priceDifference) => {
        console.log(`Determining Direction...\n`)

        if (priceDifference >= difference) {

            console.log(`Potential Arbitrage Direction:\n`)
            console.log(`Buy\t -->\t Quickswap`)
            console.log(`Sell\t -->\t Sushiswap\n`)
            return [qRouter, sRouter]

        } else if (priceDifference <= -(difference)) {

            console.log(`Potential Arbitrage Direction:\n`)
            console.log(`Buy\t -->\t Sushiswap`)
            console.log(`Sell\t -->\t Quickswap\n`)
            return [sRouter, qRouter]

        } else {
            return null
        }
    }

    const determineProfitability = async (_routerPath, _token0Contract, _token0, _token1) => {
        console.log(`Determining Profitability...\n`)

        // This is where you can customize your conditions on whether a profitable trade is possible.
        // This is a basic example of trading TOKEN_1/TOKEN_2...

        let reserves, exchangeToBuy, exchangeToSell

        if (_routerPath[0]._address == qRouter._address) {
            reserves = await getReserves(sPair)
            exchangeToBuy = 'Quickswap'
            exchangeToSell = 'Sushiswap'
        } else {
            reserves = await getReserves(uPair)
            exchangeToBuy = 'Sushiswap'
            exchangeToSell = 'Quickswap'
        }

        console.log(`Reserves on ${_routerPath[1]._address}`)
        console.log(`TOKEN_2: ${Number(web3.utils.fromWei(reserves[0].toString(), 'ether')).toFixed(0)}`)
        console.log(`TOKEN_1: ${web3.utils.fromWei(reserves[1].toString(), 'ether')}\n`)

        
        try {
            
            console.log("reserves[0]: ", reserves[0])
            console.log("path thing: ", [_token0.address, _token1.address])
            console.log("input toWei: ", web3.utils.toWei('0.000000001').toString())
            //console.log("Factoring in for decimals...")
            //var inputValue = 1000
            //inputValue = ((inputValue * 10**-12)*10**18).toString()
            //console.log("Input will be 1000 Dai\nWei Equivalent: ", inputValue)
	    //console.log("Inputting reserves...")

            let result = await _routerPath[0].methods.getAmountsIn(web3.utils.toWei('0.000000001').toString(), [_token0.address, _token1.address]).call()
	    //let result = await _routerPath[0].methods.getAmountsIn(inputValue, [_token0.address, _token1.address]).call()
            
            const token0In = result[0] // TOKEN_1
            const token1In = result[1] // TOKEN_2
            //console.log("RESULTS: ", result) //RESULTS:  [ '655', '1000000' ]
                                            //            token0In token1In
            //console.log("The error is NOT in getAmountsIn")
            result = await _routerPath[1].methods.getAmountsOut(token1In, [_token1.address, _token0.address]).call()
            //console.log("The error is NOT in getAmountsOut")
            console.log(`Estimated amount of TOKEN_1 needed to buy enough TOKEN_2 on ${exchangeToBuy}\t\t| ${token0In}`) // ${web3.utils.fromWei(token0In, 'ether')}
            console.log(`Estimated amount of TOKEN_1 returned after swapping TOKEN_2 on ${exchangeToSell}\t| ${result[1]}\n`)

            

            let { amountIn, amountOut } = await getEstimatedReturn(token0In, _routerPath, _token0, _token1)


            console.log("amountIn: ", amountIn)
            console.log("amountOut: ", amountOut)
            //amountOut = amountOut * 10**12
            //console.log("amountOut_Compensated: ", amountOut)
            /*
            Estimated amount of TOKEN_1 needed to buy enough TOKEN_2 on Sushiswap		| 15449766885308215
            Estimated amount of TOKEN_1 returned after swapping TOKEN_2 on Quickswap	| 15280137682949115

            amountIn:  0.015449766885308216
            amountOut:  0.015280137682949115

            */

            let ethBalanceBefore = await web3.eth.getBalance(account)
            ethBalanceBefore = web3.utils.fromWei(ethBalanceBefore, 'ether')
            const ethBalanceAfter = ethBalanceBefore - estimatedGasCost //- (token0In * 0.0009)

            const amountDifference = amountOut - amountIn
            let wethBalanceBefore = await _token0Contract.methods.balanceOf(account).call()
            wethBalanceBefore = web3.utils.fromWei(wethBalanceBefore, 'ether')

            const wethBalanceAfter = amountDifference + Number(wethBalanceBefore)
            const wethBalanceDifference = wethBalanceAfter - Number(wethBalanceBefore)

            const totalGained = wethBalanceDifference - Number(estimatedGasCost)

            const data = {
                'ETH Balance Before': ethBalanceBefore,
                'ETH Balance After': ethBalanceAfter,
                'ETH Spent (gas)': estimatedGasCost,
                '-': {},
                'TOKEN_1 Balance BEFORE': wethBalanceBefore,
                'TOKEN_1 Balance AFTER': wethBalanceAfter,
                'TOKEN_1 Gained/Lost': wethBalanceDifference,
                '-': {},
                'Total Gained/Lost': totalGained
            }

            console.table(data)
            console.log()

            if (amountOut < amountIn) {
                return false
            }

            amount = token0In
            return true

        } catch (error) {
            console.log(error) // console.log(error.data.stack) 
            console.log(`\nError occured while trying to determine profitability...\n`)
            console.log(`This can typically happen because an issue with reserves, see README for more information.\n`)
            return false
        }
    }

    const executeTrade = async (_routerPath, _token0Contract, _token1Contract) => {
        console.log(`Attempting Arbitrage...\n`)

        let startOnQuickswap

        if (_routerPath[0]._address == qRouter._address) {
            startOnQuickswap = true
        } else {
            startOnQuickswap = false
        }

        // Fetch token balance before
        const balanceBefore = await _token0Contract.methods.balanceOf(account).call()
        const ethBalanceBefore = await web3.eth.getBalance(account)

        /*
        if (config.PROJECT_SETTINGS.isDeployed) {
            //await _token0Contract.methods.approve(arbitrage._address, amount).send({ from: account }) // WE DONT NEED THIS BECAUSE OF THE FLASHLOAN
            await arbitrage.methods.executeTrade(startOnQuickswap, _token0Contract._address, _token1Contract._address, amount).send({ from: account, gas: gas })
        }
        */

        // data: ABI byte string containing the data of the function call on a contract
        if (config.PROJECT_SETTINGS.isDeployed) {
            const approvalTransaction = {
                'from' : account,
                'to' : _token0Contract._address,
                'data' : _token0Contract.methods.approve(arbitrage._address, amount).encodeABI()
            }
            const transaction = {
                'from' : account,
                'to' : _token0Contract._address,
                'data' : arbitrage.methods.executeTrade(startOnQuickswap, _token0Contract._address, _token1Contract._address, amount).encodeABI(),
                'gas' : gas
                
            }
            const signedApprovalTx = await web3.eth.accounts.signTransaction(approvalTransaction, process.env.DEPLOYMENT_ACCOUNT_KEY)
            const signedTx = await web3.eth.accounts.signTransaction(transaction, process.env.DEPLOYMENT_ACCOUNT_KEY)
            //await arbitrage.methods.executeTrade(startOnQuickswap, _token0Contract._address, _token1Contract._address, amount).send({ from: account, gas: gas })
            await web3.eth.sendSignedTransaction(signedApprovalTx.rawTransaction)
            await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
        }



        console.log(`Trade Complete:\n`)

        // Fetch token balance after
        const balanceAfter = await _token0Contract.methods.balanceOf(account).call()
        const ethBalanceAfter = await web3.eth.getBalance(account)

        const balanceDifference = balanceAfter - balanceBefore
        const totalSpent = ethBalanceBefore - ethBalanceAfter

        const data = {
            'ETH Balance Before': web3.utils.fromWei(ethBalanceBefore, 'ether'),
            'ETH Balance After': web3.utils.fromWei(ethBalanceAfter, 'ether'),
            'ETH Spent (gas)': web3.utils.fromWei((ethBalanceBefore - ethBalanceAfter).toString(), 'ether'),
            '-': {},
            'TOKEN_1 Balance BEFORE': web3.utils.fromWei(balanceBefore.toString(), 'ether'),
            'TOKEN_1 Balance AFTER': web3.utils.fromWei(balanceAfter.toString(), 'ether'),
            'TOKEN_1 Gained/Lost': web3.utils.fromWei(balanceDifference.toString(), 'ether'),
            '-': {},
            'Total Gained/Lost': `${web3.utils.fromWei((balanceDifference - totalSpent).toString(), 'ether')} ETH`
        }

        console.table(data)
    }

    main()

}
