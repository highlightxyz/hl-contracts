// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

/**
 * @title Highlight permissions registry interface
 * @author ishan@highlight.xyz
 */
interface IPermissionsRegistry {
    /**
     * @notice Emitted when the platform executor is swapped
     */
    event PlatformExecutorSwapped(address indexed oldExecutor, address indexed newExecutor);

    /**
     * @notice Emitted when the platform executor is deprecated
     */
    event PlatformExecutorDeprecated(address indexed oldExecutor);

    /**
     * @notice Initialize the registry with the platform executor
     */
    function initialize(address initialExecutor, address _platformVault) external;

    /**
     * @dev Swap the platform executor. Expected to be protected by a smart contract wallet.
     */
    function swapPlatformExecutor(address newExecutor) external;

    /**
     * @dev Deprecate the platform executor.
     */
    function deprecatePlatformExecutor() external;

    /**
     * @dev Returns true if executor is the platform executor
     */
    function isPlatformExecutor(address executor) external view returns (bool);

    /**
     * @dev Returns the platform executor
     */
    function platformExecutor() external view returns (address);

    /**
     * @dev Returns the platform vault
     */
    function platformVault() external view returns (address);
}
