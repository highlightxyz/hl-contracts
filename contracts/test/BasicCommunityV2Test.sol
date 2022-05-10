// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "../community/implementation/BasicCommunityV1.sol";

/**
 * @title Basic Higlight community V2 test contract for upgrades
 * @author ishan@highlight.xyz
 * @dev Community implementation
 */
contract BasicCommunityV2Test is BasicCommunityV1 {
    /**
     * @dev Function to test upgradeability
     */
    function version() public pure returns (string memory) {
        return "v2Test";
    }
}
