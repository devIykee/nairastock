// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Multicall3 `aggregate3` subset.
///
/// Base mainnet and Base Sepolia both have the canonical Multicall3 at
/// 0xcA11bde05977b3631167028862bE2a173976CA11; a fresh anvil does not. The API
/// batches every ERC20 `balanceOf` and every feed read through this ABI, so the
/// balances endpoint is one RPC round-trip regardless of how many tokens are
/// whitelisted. Deployed locally, address-overridden on real networks.
contract Multicall3 {
    struct Call3 {
        address target;
        bool allowFailure;
        bytes callData;
    }

    struct Result {
        bool success;
        bytes returnData;
    }

    function aggregate3(Call3[] calldata calls) external payable returns (Result[] memory returnData) {
        uint256 length = calls.length;
        returnData = new Result[](length);
        for (uint256 i; i < length; i++) {
            Result memory result = returnData[i];
            Call3 calldata call = calls[i];
            (result.success, result.returnData) = call.target.call(call.callData);
            if (!result.success && !call.allowFailure) {
                // Bubble the callee's revert data so the API can read the real
                // reason instead of a generic "multicall failed".
                bytes memory returned = result.returnData;
                if (returned.length == 0) revert("Multicall3: call failed");
                assembly {
                    revert(add(returned, 0x20), mload(returned))
                }
            }
        }
    }

    function getBlockNumber() external view returns (uint256) {
        return block.number;
    }

    function getCurrentBlockTimestamp() external view returns (uint256) {
        return block.timestamp;
    }
}
