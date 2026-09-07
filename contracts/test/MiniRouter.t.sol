// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {MiniFactory} from "../src/MiniFactory.sol";
import {MiniPair} from "../src/MiniPair.sol";
import {MiniRouter} from "../src/MiniRouter.sol";

/// @notice Covers the swap path the demo's buy/sell flow depends on: quote math
/// matching UniswapV2's formula, the on-chain slippage guard, the k invariant,
/// deadlines, and round-tripping cNGN → AAPLc → cNGN.
contract MiniRouterTest is Test {
    MockERC20 internal cngn;
    MockERC20 internal aaplc;
    MiniFactory internal factory;
    MiniRouter internal router;

    address internal lp = address(0xA11CE);
    address internal trader = address(0xB0B);

    // Pool at genesis: 5,000 AAPLc against ₦1,851,200,000
    // (5,000 shares × $231.40 × ₦1,600/$1).
    uint256 internal constant STOCK_LIQUIDITY = 5_000 ether;
    uint256 internal constant CNGN_LIQUIDITY = 1_851_200_000 ether;

    function setUp() public {
        cngn = new MockERC20("Compliant Naira", "cNGN", 18, address(this));
        aaplc = new MockERC20("Apple Inc. (tokenized)", "AAPLc", 18, address(this));
        factory = new MiniFactory();
        router = new MiniRouter(address(factory));

        cngn.mint(lp, CNGN_LIQUIDITY);
        aaplc.mint(lp, STOCK_LIQUIDITY);

        vm.startPrank(lp);
        cngn.approve(address(router), type(uint256).max);
        aaplc.approve(address(router), type(uint256).max);
        router.addLiquidity(address(cngn), address(aaplc), CNGN_LIQUIDITY, STOCK_LIQUIDITY, lp);
        vm.stopPrank();
    }

    function _path(address from, address to) private pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = from;
        path[1] = to;
    }

    function test_poolMidPriceMatchesSeedPrice() public view {
        (uint256 reserveCngn, uint256 reserveStock) = router.getReserves(address(cngn), address(aaplc));
        // ₦1,851,200,000 / 5,000 = ₦370,240 per share = $231.40 at ₦1,600/$1.
        assertEq((reserveCngn / reserveStock), 370_240);
    }

    function test_getAmountOutMatchesUniswapV2Formula() public view {
        uint256 amountIn = 1_000_000 ether; // ₦1m
        (uint256 reserveIn, uint256 reserveOut) = router.getReserves(address(cngn), address(aaplc));

        uint256 amountInWithFee = amountIn * 9_970;
        uint256 expected = (amountInWithFee * reserveOut) / (reserveIn * 10_000 + amountInWithFee);

        assertEq(router.getAmountOut(amountIn, reserveIn, reserveOut), expected);
    }

    function test_getAmountInIsInverseOfGetAmountOut() public view {
        (uint256 reserveIn, uint256 reserveOut) = router.getReserves(address(cngn), address(aaplc));
        uint256 desiredOut = 2 ether;

        uint256 requiredIn = router.getAmountIn(desiredOut, reserveIn, reserveOut);
        uint256 actualOut = router.getAmountOut(requiredIn, reserveIn, reserveOut);

        // The +1 rounding in getAmountIn means actualOut lands at or just above target.
        assertGe(actualOut, desiredOut);
        assertLe(actualOut - desiredOut, 1e12);
    }

    function test_buyDeliversTokensToTraderWallet() public {
        uint256 amountIn = 1_000_000 ether;
        cngn.mint(trader, amountIn);

        uint256[] memory quoted = router.getAmountsOut(amountIn, _path(address(cngn), address(aaplc)));

        vm.startPrank(trader);
        cngn.approve(address(router), amountIn);
        uint256[] memory amounts = router.swapExactTokensForTokens(
            amountIn, quoted[1], _path(address(cngn), address(aaplc)), trader, block.timestamp + 600
        );
        vm.stopPrank();

        assertEq(amounts[1], quoted[1]);
        // Self-custody proof: the tokens sit at the trader's own address.
        assertEq(aaplc.balanceOf(trader), quoted[1]);
        assertEq(cngn.balanceOf(trader), 0);
        // ₦1m at ₦370,240/share ≈ 2.7 shares, less the 30 bps fee.
        assertApproxEqRel(quoted[1], 2.7e18, 0.01e18);
    }

    function test_slippageGuardRevertsWhenMinOutExceedsCurve() public {
        uint256 amountIn = 1_000_000 ether;
        cngn.mint(trader, amountIn);

        uint256[] memory quoted = router.getAmountsOut(amountIn, _path(address(cngn), address(aaplc)));

        vm.startPrank(trader);
        cngn.approve(address(router), amountIn);
        vm.expectRevert("MiniRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        router.swapExactTokensForTokens(
            amountIn, quoted[1] + 1, _path(address(cngn), address(aaplc)), trader, block.timestamp + 600
        );
        vm.stopPrank();

        // A rejected swap must leave the trader's funds untouched.
        assertEq(cngn.balanceOf(trader), amountIn);
        assertEq(aaplc.balanceOf(trader), 0);
    }

    /// @dev Simulates the race the slippage tolerance exists for: another trade
    /// lands between quote and execution, so the quoted output is no longer
    /// achievable. The 1% default absorbs a small move and rejects a large one.
    function test_frontRunMovesPriceAndSlippageBoundHolds() public {
        uint256 amountIn = 1_000_000 ether;
        cngn.mint(trader, amountIn);
        uint256[] memory quoted = router.getAmountsOut(amountIn, _path(address(cngn), address(aaplc)));
        uint256 minOut = quoted[1] - (quoted[1] * 100) / 10_000; // 1% tolerance

        // Someone buys ₦20m of AAPLc first, pushing the price up ~1.1%.
        address frontRunner = address(0xF00D);
        uint256 frontRunAmount = 20_000_000 ether;
        cngn.mint(frontRunner, frontRunAmount);
        vm.startPrank(frontRunner);
        cngn.approve(address(router), frontRunAmount);
        router.swapExactTokensForTokens(
            frontRunAmount, 0, _path(address(cngn), address(aaplc)), frontRunner, block.timestamp + 600
        );
        vm.stopPrank();

        vm.startPrank(trader);
        cngn.approve(address(router), amountIn);
        vm.expectRevert("MiniRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        router.swapExactTokensForTokens(
            amountIn, minOut, _path(address(cngn), address(aaplc)), trader, block.timestamp + 600
        );

        // With a tolerance wide enough for the observed move, the same trade fills.
        uint256[] memory afterMove = router.getAmountsOut(amountIn, _path(address(cngn), address(aaplc)));
        uint256[] memory amounts = router.swapExactTokensForTokens(
            amountIn, afterMove[1], _path(address(cngn), address(aaplc)), trader, block.timestamp + 600
        );
        vm.stopPrank();

        assertEq(aaplc.balanceOf(trader), amounts[1]);
        assertLt(amounts[1], quoted[1]);
    }

    function test_expiredDeadlineReverts() public {
        uint256 amountIn = 1_000 ether;
        cngn.mint(trader, amountIn);

        vm.warp(1_000_000);
        vm.startPrank(trader);
        cngn.approve(address(router), amountIn);
        vm.expectRevert("MiniRouter: EXPIRED");
        router.swapExactTokensForTokens(amountIn, 0, _path(address(cngn), address(aaplc)), trader, block.timestamp - 1);
        vm.stopPrank();
    }

    function test_sellRoundTripLosesOnlyFeesAndImpact() public {
        uint256 amountIn = 1_000_000 ether;
        cngn.mint(trader, amountIn);

        vm.startPrank(trader);
        cngn.approve(address(router), type(uint256).max);
        aaplc.approve(address(router), type(uint256).max);

        uint256[] memory buy = router.swapExactTokensForTokens(
            amountIn, 0, _path(address(cngn), address(aaplc)), trader, block.timestamp + 600
        );
        uint256[] memory sell = router.swapExactTokensForTokens(
            buy[1], 0, _path(address(aaplc), address(cngn)), trader, block.timestamp + 600
        );
        vm.stopPrank();

        assertEq(aaplc.balanceOf(trader), 0);
        assertEq(cngn.balanceOf(trader), sell[1]);
        // Two 30 bps fees plus negligible impact ≈ 0.6% round-trip cost.
        assertLt(sell[1], amountIn);
        assertGt(sell[1], (amountIn * 9_930) / 10_000);
    }

    function test_swapWithoutApprovalReverts() public {
        uint256 amountIn = 1_000 ether;
        cngn.mint(trader, amountIn);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(MockERC20.InsufficientAllowance.selector, 0, amountIn));
        router.swapExactTokensForTokens(amountIn, 0, _path(address(cngn), address(aaplc)), trader, block.timestamp + 600);
    }

    function test_swapWithInsufficientBalanceReverts() public {
        uint256 amountIn = 1_000 ether;
        cngn.mint(trader, amountIn - 1);

        vm.startPrank(trader);
        cngn.approve(address(router), amountIn);
        vm.expectRevert(abi.encodeWithSelector(MockERC20.InsufficientBalance.selector, amountIn - 1, amountIn));
        router.swapExactTokensForTokens(amountIn, 0, _path(address(cngn), address(aaplc)), trader, block.timestamp + 600);
        vm.stopPrank();
    }

    function test_unknownPairReverts() public {
        MockERC20 orphan = new MockERC20("Orphan", "ORPH", 18, address(this));
        vm.expectRevert("MiniRouter: PAIR_NOT_FOUND");
        router.getReserves(address(cngn), address(orphan));
    }

    function test_pairRejectsOutputExceedingCurve() public {
        // Direct pair call with no input transferred in: the k invariant must
        // reject it, which is what makes amountOutMin trustworthy.
        address pair = router.pairFor(address(cngn), address(aaplc));
        vm.expectRevert(MiniPair.InsufficientInputAmount.selector);
        MiniPair(pair).swap(0, 1 ether, trader);
    }

    /// @dev Price impact must rise monotonically with size — the property the UI's
    /// impact warning relies on. Bounded to trades of at least ₦1,000: below that
    /// the per-unit comparison is dominated by the 1-wei truncation in
    /// getAmountOut rather than by curve movement, so the property is about real
    /// trade sizes, not dust.
    function testFuzz_priceImpactGrowsWithSize(uint96 rawAmount) public view {
        uint256 small = bound(uint256(rawAmount), 1_000 ether, 10_000_000 ether);
        uint256 large = small * 10;

        (uint256 reserveIn, uint256 reserveOut) = router.getReserves(address(cngn), address(aaplc));
        uint256 outSmall = router.getAmountOut(small, reserveIn, reserveOut);
        uint256 outLarge = router.getAmountOut(large, reserveIn, reserveOut);

        // Per-unit output is strictly worse for the larger trade.
        assertLt((outLarge * 1e18) / large, (outSmall * 1e18) / small);
    }

    /// @dev Upper bound reflects MiniPair's uint112 reserve ceiling, inherited
    /// from UniswapV2Pair. Larger inputs are rejected outright — see
    /// test_reserveOverflowReverts.
    function testFuzz_swapNeverDrainsPool(uint128 rawAmount) public {
        uint256 amountIn = bound(uint256(rawAmount), 1e15, 1e30);
        cngn.mint(trader, amountIn);

        vm.startPrank(trader);
        cngn.approve(address(router), amountIn);
        router.swapExactTokensForTokens(amountIn, 0, _path(address(cngn), address(aaplc)), trader, block.timestamp + 600);
        vm.stopPrank();

        (, uint256 reserveStock) = router.getReserves(address(cngn), address(aaplc));
        assertGt(reserveStock, 0);
    }

    /// @dev A trade so large it would push reserves past uint112 reverts rather
    /// than silently truncating the pool's accounting.
    function test_reserveOverflowReverts() public {
        uint256 amountIn = uint256(type(uint112).max);
        cngn.mint(trader, amountIn);

        vm.startPrank(trader);
        cngn.approve(address(router), amountIn);
        vm.expectRevert(MiniPair.Overflow.selector);
        router.swapExactTokensForTokens(amountIn, 0, _path(address(cngn), address(aaplc)), trader, block.timestamp + 600);
        vm.stopPrank();
    }
}
