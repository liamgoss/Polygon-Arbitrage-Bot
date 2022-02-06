// SPDX-License-Identifier: MIT
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import "./aave/FlashLoanReceiverBase.sol";
import "./aave/ILendingPoolAddressesProvider.sol";
import "./aave/ILendingPool.sol";
//import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

contract Flashloan is FlashLoanReceiverBase {
    ISwapRouter public immutable sRouter;
    ISwapRouter public immutable uRouter;

    constructor(address _addressProvider, address _sRouter, address _uRouter) FlashLoanReceiverBase(_addressProvider) public {
        // _addressProvider should be 'LendingPoolAddressesProvider' in accordance with AAVE docs
        // For AAVE Polygon: 0xd05e3E715d945B59290df0ae8eF85c1BdB684744
        sRouter = ISwapRouter(_sRouter); // Sushiswap
        uRouter = ISwapRouter(_uRouter); // Uniswap   
    }

    function executeTrade(
        bool _startOnUniswap,
        address _token0,
        address _token1,
        uint256 _flashAmount
    ) external {
        uint256 balanceBefore = IERC20(_token0).balanceOf(address(this));

        bytes memory data = abi.encode(
            _startOnUniswap,
            _token0,
            _token1,
            _flashAmount,
            balanceBefore
        );

        flashloan(_token0, _flashAmount, data); // execution goes to `callFunction`
    }

    /**
        This function is called after your contract has received the flash loaned amount
     */
    function executeOperation(
        address _reserve,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _params
    )
        external
        override
    {
        require(_amount <= getBalanceInternal(address(this), _reserve), "Invalid balance, was the flashLoan successful?");

        //-------BEGIN CUSTOM LOGIC-------\\
        (
            bool startOnUniswap,
            address token0,
            address token1,
            uint256 flashAmount,
            uint256 balanceBefore
        ) = abi.decode(_params, (bool, address, address, uint256, uint256));


        // Use the money here!
        address[] memory path = new address[](2);

        path[0] = token0;
        path[1] = token1;

        if (startOnUniswap) {
            _swapOnUniswap(path, flashAmount, 0);

            path[0] = token1;
            path[1] = token0;

            _swapOnSushiswap(
                path,
                IERC20(token1).balanceOf(address(this)),
                (flashAmount + 1)
            );
        } else {
            _swapOnSushiswap(path, flashAmount, 0);

            path[0] = token1;
            path[1] = token0;

            _swapOnUniswap(
                path,
                IERC20(token1).balanceOf(address(this)),
                (flashAmount + 1)
            );
        }

    

        //-------END CUSTOM LOGIC-------\\
        //
        // Your logic goes here.
        // !! Ensure that *this contract* has enough of `_reserve` funds to payback the `_fee` !!
        //

        uint totalDebt = _amount.add(_fee);
        transferFundsBackToPoolInternal(_reserve, totalDebt);
    }

    
    function flashloan(address _asset, uint256 _amount, bytes memory _params) public onlyOwner {

        ILendingPool lendingPool = ILendingPool(addressesProvider.getLendingPool());
        lendingPool.flashLoan(address(this), _asset, _amount, _params);
    }


    // -- INTERNAL FUNCTIONS -- //

    function _swapOnUniswap(
        address[] memory _path,
        uint256 _amountIn,
        uint256 _amountOut
    ) internal {
        require(
            IERC20(_path[0]).approve(address(uRouter), _amountIn),
            "Uniswap approval failed."
        );

        /*

        struct ExactInputParams {
            bytes path;
            address recipient;
            uint256 deadline;
            uint256 amountIn;
            uint256 amountOutMinimum;
        }

        */

        uRouter.exactInput(
            ISwapRouter.ExactInputParams({
                path: abi.encodePacked(_path),
                recipient: address(this),
                deadline: (block.timestamp + 1200),
                amountIn: _amountIn,
                amountOutMinimum: _amountOut 
            })
        );
    }

    function _swapOnSushiswap(
        address[] memory _path,
        uint256 _amountIn,
        uint256 _amountOut
    ) internal {
        require(
            IERC20(_path[0]).approve(address(sRouter), _amountIn),
            "Sushiswap approval failed."
        );

        sRouter.exactInput(
            ISwapRouter.ExactInputParams({
                path: abi.encodePacked(_path),
                recipient: address(this),
                deadline: (block.timestamp + 1200),
                amountIn: _amountIn,
                amountOutMinimum: _amountOut 
            })
        );
    }

}
