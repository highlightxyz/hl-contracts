// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "../permissions_registry/PermissionsRegistry.sol";

/**
 * @title PermissionsRegistry V2 test contract for upgrades
 * @author ishan@highlight.xyz
 * @dev PermissionsRegistry implementation
 */
contract PermissionsRegistryV2Test is PermissionsRegistry {
    /**
     * @dev Function to test upgradeability
     */
    function version() public pure returns (string memory) {
        return "v2Test";
    }
}
