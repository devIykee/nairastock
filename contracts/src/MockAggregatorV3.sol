// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

/// @notice Chainlink-shaped price feed for testnet.
///
/// Chainlink does not publish equity feeds on Base Sepolia, and the underlying
/// market is closed most of the hours a demo gets recorded. This contract exposes
/// the exact `latestRoundData()` ABI the API consumes, and lets the pricing job
/// push a small random walk so the chart moves during a demo. On Base mainnet
/// the address in `.env` becomes the real Chainlink aggregator and no API code
/// changes.
contract MockAggregatorV3 is IAggregatorV3 {
    uint8 private immutable _decimals;
    string private _description;
    address public updater;

    struct Round {
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
    }

    uint80 public latestRound;
    mapping(uint80 => Round) private _rounds;

    error NotUpdater();
    error NonPositiveAnswer();
    error NoData();

    event AnswerUpdated(int256 indexed current, uint80 indexed roundId, uint256 updatedAt);
    event UpdaterChanged(address indexed previousUpdater, address indexed newUpdater);

    constructor(uint8 decimals_, string memory description_, int256 initialAnswer, address updater_) {
        if (initialAnswer <= 0) revert NonPositiveAnswer();
        _decimals = decimals_;
        _description = description_;
        updater = updater_ == address(0) ? msg.sender : updater_;
        latestRound = 1;
        _rounds[1] = Round({answer: initialAnswer, startedAt: block.timestamp, updatedAt: block.timestamp});
        emit AnswerUpdated(initialAnswer, 1, block.timestamp);
    }

    modifier onlyUpdater() {
        if (msg.sender != updater) revert NotUpdater();
        _;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function description() external view returns (string memory) {
        return _description;
    }

    function version() external pure returns (uint256) {
        return 4;
    }

    function setUpdater(address newUpdater) external onlyUpdater {
        emit UpdaterChanged(updater, newUpdater);
        updater = newUpdater;
    }

    /// @dev Called by the pricing job every poll interval when simulation is on.
    function pushAnswer(int256 answer) external onlyUpdater returns (uint80 roundId) {
        if (answer <= 0) revert NonPositiveAnswer();
        roundId = latestRound + 1;
        latestRound = roundId;
        _rounds[roundId] = Round({answer: answer, startedAt: block.timestamp, updatedAt: block.timestamp});
        emit AnswerUpdated(answer, roundId, block.timestamp);
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        roundId = latestRound;
        Round memory round = _rounds[roundId];
        if (round.updatedAt == 0) revert NoData();
        return (roundId, round.answer, round.startedAt, round.updatedAt, roundId);
    }

    function getRoundData(uint80 roundId_)
        external
        view
        returns (uint80 id, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        Round memory round = _rounds[roundId_];
        if (round.updatedAt == 0) revert NoData();
        return (roundId_, round.answer, round.startedAt, round.updatedAt, roundId_);
    }
}
