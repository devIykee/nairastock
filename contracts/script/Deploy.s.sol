// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {MockAggregatorV3} from "../src/MockAggregatorV3.sol";
import {MiniFactory} from "../src/MiniFactory.sol";
import {MiniRouter} from "../src/MiniRouter.sol";
import {Multicall3} from "../src/Multicall3.sol";

/// @notice Stands up the full testnet demo venue: mock cNGN, four mock tokenized
/// stocks, a Chainlink-shaped aggregator per stock, a V2-style factory/router,
/// and a seeded cNGN pool per stock.
///
/// Pool sizing: each pool holds STOCK_LIQUIDITY_UNITS shares priced at the
/// stock's seed price, paired with the naira equivalent at NGN_USD_RATE. The pool
/// mid-price therefore equals the Chainlink price at genesis, so the demo's first
/// quote agrees with the displayed price, and 5k shares of depth keeps price
/// impact on a ₦2m trade well under 1%.
///
/// Writes ./deployments/<chainid>.json, which `scripts/deploy.ts` folds into the
/// repo-root .env.
///
/// Note: state lives in storage rather than `run()` locals because solc's
/// stack-slot limit is easy to blow with this many addresses in one frame.
contract Deploy is Script {
    uint8 constant FEED_DECIMALS = 8;
    uint256 constant STOCK_LIQUIDITY_UNITS = 5_000;
    /// Faucet float for the mocked naira on-ramp: 20bn cNGN (~$12.5m at ₦1600/$1).
    uint256 constant FAUCET_FLOAT = 20_000_000_000 ether;

    struct StockSpec {
        string symbol;
        string name;
        /// USD price × 100, keeps the config free of decimal literals.
        uint256 seedPriceCents;
    }

    StockSpec[] internal specs;

    address internal deployer;
    uint256 internal ngnUsdRate;

    Multicall3 internal multicall;
    MiniFactory internal factory;
    MiniRouter internal router;
    MockERC20 internal cngn;

    address[] internal stockTokens;
    address[] internal stockFeeds;
    uint256[] internal poolCngn;

    function run() external {
        _loadSpecs();

        uint256 deployerKey = vm.envUint("FAUCET_PRIVATE_KEY");
        deployer = vm.addr(deployerKey);
        ngnUsdRate = vm.envOr("NGN_USD_RATE", uint256(1600));

        console.log("deployer:", deployer);
        console.log("chainId: ", block.chainid);
        console.log("ngn/usd: ", ngnUsdRate);

        vm.startBroadcast(deployerKey);
        _deployVenue();
        for (uint256 i; i < specs.length; i++) {
            _deployStock(i);
        }
        vm.stopBroadcast();

        _writeDeployment();
    }

    function _loadSpecs() private {
        specs.push(StockSpec("AAPLc", "Apple Inc. (tokenized)", 23_140));
        specs.push(StockSpec("NVDAc", "NVIDIA Corporation (tokenized)", 17_860));
        specs.push(StockSpec("METAc", "Meta Platforms, Inc. (tokenized)", 61_275));
        specs.push(StockSpec("GOOGLc", "Alphabet Inc. Class A (tokenized)", 19_630));
    }

    function _deployVenue() private {
        multicall = new Multicall3();
        factory = new MiniFactory();
        router = new MiniRouter(address(factory));
        cngn = new MockERC20("Compliant Naira", "cNGN", 18, deployer);
        cngn.mint(deployer, FAUCET_FLOAT);

        console.log("multicall3:", address(multicall));
        console.log("factory:   ", address(factory));
        console.log("router:    ", address(router));
        console.log("cNGN:      ", address(cngn));
    }

    function _deployStock(uint256 index) private {
        StockSpec memory spec = specs[index];

        MockERC20 token = new MockERC20(spec.name, spec.symbol, 18, deployer);
        MockAggregatorV3 feed = new MockAggregatorV3(
            FEED_DECIMALS,
            string.concat(spec.symbol, " / USD"),
            int256((spec.seedPriceCents * (10 ** FEED_DECIMALS)) / 100),
            deployer
        );

        uint256 stockAmount = STOCK_LIQUIDITY_UNITS * 1 ether;
        // naira side = shares × (seedPriceCents / 100) × rate
        uint256 cngnAmount = (STOCK_LIQUIDITY_UNITS * spec.seedPriceCents * ngnUsdRate * 1 ether) / 100;

        token.mint(deployer, stockAmount);
        cngn.mint(deployer, cngnAmount);
        token.approve(address(router), stockAmount);
        cngn.approve(address(router), cngnAmount);
        router.addLiquidity(address(cngn), address(token), cngnAmount, stockAmount, deployer);

        stockTokens.push(address(token));
        stockFeeds.push(address(feed));
        poolCngn.push(cngnAmount);

        console.log(spec.symbol);
        console.log("  token:", address(token));
        console.log("  feed: ", address(feed));
    }

    function _writeDeployment() private {
        string memory json = "deployment";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeAddress(json, "deployer", deployer);
        vm.serializeUint(json, "ngnUsdRate", ngnUsdRate);
        vm.serializeAddress(json, "multicall3", address(multicall));
        vm.serializeAddress(json, "factory", address(factory));
        vm.serializeAddress(json, "router", address(router));
        vm.serializeAddress(json, "cngn", address(cngn));

        string[] memory symbols = new string[](specs.length);
        for (uint256 i; i < specs.length; i++) {
            symbols[i] = specs[i].symbol;
        }
        vm.serializeString(json, "symbols", symbols);
        vm.serializeAddress(json, "tokens", stockTokens);
        vm.serializeAddress(json, "feeds", stockFeeds);
        string memory finalJson = vm.serializeUint(json, "poolCngn", poolCngn);

        string memory path = string.concat("./deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(finalJson, path);
        console.log("wrote", path);
    }
}
