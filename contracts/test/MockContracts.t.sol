// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {MockAggregatorV3} from "../src/MockAggregatorV3.sol";
import {MockERC20} from "../src/MockERC20.sol";

contract MockAggregatorV3Test is Test {
    MockAggregatorV3 internal feed;
    address internal updater = address(0xDEFEED);

    function setUp() public {
        feed = new MockAggregatorV3(8, "AAPLc / USD", 231_40000000, updater);
    }

    function test_reportsChainlinkShapedRound() public view {
        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            feed.latestRoundData();
        assertEq(roundId, 1);
        assertEq(answer, 231_40000000);
        assertEq(startedAt, block.timestamp);
        assertEq(updatedAt, block.timestamp);
        assertEq(answeredInRound, 1);
        assertEq(feed.decimals(), 8);
        assertEq(feed.description(), "AAPLc / USD");
    }

    function test_pushAnswerAdvancesRoundAndTimestamp() public {
        vm.warp(block.timestamp + 30);
        vm.prank(updater);
        uint80 roundId = feed.pushAnswer(232_10000000);

        (uint80 latest, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        assertEq(roundId, 2);
        assertEq(latest, 2);
        assertEq(answer, 232_10000000);
        assertEq(updatedAt, block.timestamp);
    }

    function test_historicalRoundsRemainReadable() public {
        vm.prank(updater);
        feed.pushAnswer(240_00000000);

        (, int256 firstAnswer,,,) = feed.getRoundData(1);
        assertEq(firstAnswer, 231_40000000);
    }

    function test_onlyUpdaterCanPush() public {
        vm.expectRevert(MockAggregatorV3.NotUpdater.selector);
        feed.pushAnswer(1);
    }

    function test_rejectsNonPositiveAnswer() public {
        vm.prank(updater);
        vm.expectRevert(MockAggregatorV3.NonPositiveAnswer.selector);
        feed.pushAnswer(0);
    }

    function test_unknownRoundReverts() public {
        vm.expectRevert(MockAggregatorV3.NoData.selector);
        feed.getRoundData(99);
    }
}

contract MockERC20Test is Test {
    MockERC20 internal token;
    address internal minter = address(0x1111);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        token = new MockERC20("Compliant Naira", "cNGN", 18, minter);
    }

    function test_metadataMatchesMainnetCounterpart() public view {
        assertEq(token.name(), "Compliant Naira");
        assertEq(token.symbol(), "cNGN");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), 0);
        assertEq(token.minter(), minter);
    }

    function test_onlyMinterMints() public {
        vm.expectRevert(MockERC20.NotMinter.selector);
        token.mint(alice, 1 ether);

        vm.prank(minter);
        token.mint(alice, 1_000 ether);
        assertEq(token.balanceOf(alice), 1_000 ether);
        assertEq(token.totalSupply(), 1_000 ether);
    }

    function test_transferMovesBalance() public {
        vm.prank(minter);
        token.mint(alice, 100 ether);

        vm.prank(alice);
        token.transfer(bob, 40 ether);

        assertEq(token.balanceOf(alice), 60 ether);
        assertEq(token.balanceOf(bob), 40 ether);
    }

    function test_transferBeyondBalanceReverts() public {
        vm.prank(minter);
        token.mint(alice, 10 ether);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MockERC20.InsufficientBalance.selector, 10 ether, 11 ether));
        token.transfer(bob, 11 ether);
    }

    function test_infiniteAllowanceIsNotDecremented() public {
        vm.prank(minter);
        token.mint(alice, 100 ether);

        vm.prank(alice);
        token.approve(bob, type(uint256).max);

        vm.prank(bob);
        token.transferFrom(alice, bob, 30 ether);

        assertEq(token.allowance(alice, bob), type(uint256).max);
        assertEq(token.balanceOf(bob), 30 ether);
    }

    function test_finiteAllowanceIsDecremented() public {
        vm.prank(minter);
        token.mint(alice, 100 ether);

        vm.prank(alice);
        token.approve(bob, 50 ether);

        vm.prank(bob);
        token.transferFrom(alice, bob, 30 ether);
        assertEq(token.allowance(alice, bob), 20 ether);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(MockERC20.InsufficientAllowance.selector, 20 ether, 30 ether));
        token.transferFrom(alice, bob, 30 ether);
    }

    /// @dev The mocked naira off-ramp burns cNGN on payout.
    function test_burnReducesSupply() public {
        vm.prank(minter);
        token.mint(alice, 100 ether);

        vm.prank(alice);
        token.burn(40 ether);

        assertEq(token.balanceOf(alice), 60 ether);
        assertEq(token.totalSupply(), 60 ether);
    }

    function test_rejectsZeroAddressRecipient() public {
        vm.prank(minter);
        vm.expectRevert(MockERC20.ZeroAddress.selector);
        token.mint(address(0), 1 ether);
    }
}
