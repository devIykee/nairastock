// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "./interfaces/IERC20.sol";
import {MiniFactory} from "./MiniFactory.sol";
import {MiniPair} from "./MiniPair.sol";

/// @notice UniswapV2Router02-compatible router, the surface the API trades
/// through. Aerodrome (and every V2-style DEX on Base) exposes the same
/// `swapExactTokensForTokens(uint,uint,address[],address,uint)` signature, so
/// pointing `DEX_ROUTER_ADDRESS` at a mainnet router requires no API change.
///
/// Revert reasons use UniswapV2Router02's exact strings, because the API
/// pattern-matches them to map an on-chain failure onto a user-facing error code
/// (INSUFFICIENT_OUTPUT_AMOUNT → SLIPPAGE_EXCEEDED, and so on). Keeping the
/// strings identical means that mapping still works against a real router.
contract MiniRouter {
    uint256 public constant FEE_BPS = 30;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    address public immutable factory;

    constructor(address factory_) {
        require(factory_ != address(0), "MiniRouter: ZERO_FACTORY");
        factory = factory_;
    }

    modifier ensure(uint256 deadline) {
        // A deadline is the point of the check; block.timestamp is the right clock here.
        // forge-lint: disable-next-line(block-timestamp)
        require(deadline >= block.timestamp, "MiniRouter: EXPIRED");
        _;
    }

    // ─── Quoting (view) ──────────────────────────────────────────────────────

    function sortTokens(address tokenA, address tokenB) public pure returns (address token0, address token1) {
        require(tokenA != tokenB, "MiniRouter: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "MiniRouter: ZERO_ADDRESS");
    }

    function pairFor(address tokenA, address tokenB) public view returns (address pair) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = MiniFactory(factory).getPair(token0, token1);
    }

    /// @return reserveA reserves of tokenA, reserveB reserves of tokenB
    function getReserves(address tokenA, address tokenB) public view returns (uint256 reserveA, uint256 reserveB) {
        address pair = pairFor(tokenA, tokenB);
        require(pair != address(0), "MiniRouter: PAIR_NOT_FOUND");
        (address token0,) = sortTokens(tokenA, tokenB);
        (uint112 reserve0, uint112 reserve1) = MiniPair(pair).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (uint256(reserve0), uint256(reserve1)) : (uint256(reserve1), uint256(reserve0));
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) public pure returns (uint256) {
        require(amountIn > 0, "MiniRouter: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "MiniRouter: INSUFFICIENT_LIQUIDITY");
        uint256 amountInWithFee = amountIn * (BPS_DENOMINATOR - FEE_BPS);
        return (amountInWithFee * reserveOut) / (reserveIn * BPS_DENOMINATOR + amountInWithFee);
    }

    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) public pure returns (uint256) {
        require(amountOut > 0, "MiniRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > amountOut, "MiniRouter: INSUFFICIENT_LIQUIDITY");
        uint256 numerator = reserveIn * amountOut * BPS_DENOMINATOR;
        uint256 denominator = (reserveOut - amountOut) * (BPS_DENOMINATOR - FEE_BPS);
        return numerator / denominator + 1;
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts) {
        return _getAmountsOut(amountIn, path);
    }

    function getAmountsIn(uint256 amountOut, address[] calldata path) external view returns (uint256[] memory amounts) {
        require(path.length >= 2, "MiniRouter: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;
        for (uint256 i = path.length - 1; i > 0; i--) {
            (uint256 reserveIn, uint256 reserveOut) = getReserves(path[i - 1], path[i]);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
        }
    }

    // ─── Liquidity ───────────────────────────────────────────────────────────

    /// @dev Seeding path used by the deploy script. Amounts are taken as given
    /// (no optimal-ratio solving) because the script always creates the pool it
    /// funds, which is the only caller.
    function addLiquidity(address tokenA, address tokenB, uint256 amountA, uint256 amountB, address to)
        external
        returns (address pair, uint256 liquidity)
    {
        pair = pairFor(tokenA, tokenB);
        if (pair == address(0)) {
            pair = MiniFactory(factory).createPair(tokenA, tokenB);
        }
        _safeTransferFrom(tokenA, msg.sender, pair, amountA);
        _safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = MiniPair(pair).mint(to);
    }

    // ─── Swapping ────────────────────────────────────────────────────────────

    /// @dev The core of the demo. `amountOutMin` is enforced here, on-chain, so
    /// the minimum-received figure the UI showed is a real guarantee rather than
    /// a server-side promise.
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = _getAmountsOut(amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "MiniRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        _safeTransferFrom(path[0], msg.sender, pairFor(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(path.length >= 2, "MiniRouter: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;
        for (uint256 i = path.length - 1; i > 0; i--) {
            (uint256 reserveIn, uint256 reserveOut) = getReserves(path[i - 1], path[i]);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
        }
        require(amounts[0] <= amountInMax, "MiniRouter: EXCESSIVE_INPUT_AMOUNT");
        _safeTransferFrom(path[0], msg.sender, pairFor(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function _getAmountsOut(uint256 amountIn, address[] calldata path) private view returns (uint256[] memory amounts) {
        require(path.length >= 2, "MiniRouter: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i; i < path.length - 1; i++) {
            (uint256 reserveIn, uint256 reserveOut) = getReserves(path[i], path[i + 1]);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    function _swap(uint256[] memory amounts, address[] calldata path, address to) private {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) =
                input == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
            address recipient = i < path.length - 2 ? pairFor(output, path[i + 2]) : to;
            MiniPair(pairFor(input, output)).swap(amount0Out, amount1Out, recipient);
        }
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) private {
        require(IERC20(token).transferFrom(from, to, value), "MiniRouter: TRANSFER_FROM_FAILED");
    }
}
