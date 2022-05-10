// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "../royalties/SplitMain.sol";

/**
 * @title SplitMain V2 test contract for upgrades
 * @author ishan@highlight.xyz
 * @dev SplitMain implementation
 */
contract SplitMainV2Test is SplitMain {
    /**
     * @dev Function to test upgradeability
     */
    function version() public pure returns (string memory) {
        return "v2Test";
    }
}
