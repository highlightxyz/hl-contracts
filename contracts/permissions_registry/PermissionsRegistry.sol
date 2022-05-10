// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "./IPermissionsRegistry.sol";
import "../utils/OwnableUpgradeable.sol";
import "../utils/ERC165/ERC165Upgradeable.sol";

/**
 * @title Highlight permissions registry
 * @author ishan@highlight.xyz
 * @dev Allows for O(1) swapping of the platform executor.
 */
contract PermissionsRegistry is IPermissionsRegistry, OwnableUpgradeable, ERC165Upgradeable {
    /**
     * @dev Flexible platform transaction executor
     */
    address public platformExecutor;

    /**
     * @dev Platform vault
     */
    address public platformVault;

    /**
     * @notice Initialize the registry with the platform executorn and the platform vault
     */
    function initialize(address _initialExecutor, address _platformVault) external initializer {
        __Ownable_init();
        __ERC165_init();
        platformExecutor = _initialExecutor;
        platformVault = _platformVault;
    }

    /**
     * @dev Swap the platform executor. Expected to be protected by a smart contract wallet.
     */
    function swapPlatformExecutor(address newExecutor) external onlyOwner {
        require(newExecutor != address(0), "Cannot set to null address");
        emit PlatformExecutorSwapped(platformExecutor, newExecutor);
        platformExecutor = newExecutor;
    }

    /**
     * @dev Deprecate the platform executor.
     */
    function deprecatePlatformExecutor() external onlyOwner {
        emit PlatformExecutorDeprecated(platformExecutor);
        platformExecutor = address(0);
    }

    /**
     * @dev Returns true if executor is the platform executor
     */
    function isPlatformExecutor(address executor) external view returns (bool) {
        return executor == platformExecutor;
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IPermissionsRegistry).interfaceId || super.supportsInterface(interfaceId);
    }
}
