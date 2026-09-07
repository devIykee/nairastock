// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Chainlink AggregatorV3Interface, reproduced so the demo has no
/// external dependency. The API reads price feeds through exactly this ABI, so
/// swapping a mock aggregator for a real Chainlink feed on Base mainnet is an
/// address change in `.env` and nothing else.
interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    function getRoundData(uint80 roundId)
        external
        view
        returns (uint80 id, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
