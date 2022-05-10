// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;
import "../../utils/IAccessControlUpgradeable.sol";

/**
 * @title Highlight community admin interface
 * @author ishan@highlight.xyz
 */
interface ICommunityAdmin {
    /**
     * @notice Used by default admin account that wants to swap ownership of / cut ties with this community
     * @param newDefaultAdmin New admin receiving ownership
     */
    function swapDefaultAdmin(address newDefaultAdmin) external;

    /**
     * @dev Swaps a platform role holder's ownership of platform role
     * @param account New account to grant top level roles to
     */
    function swapPlatform(address account) external;

    /**
     * @notice Pause the community
     * @dev Callable by default admin
     */
    function pause() external;

    /**
     * @notice Unpause the community
     * @dev Callable by default admin
     */
    function unpause() external;

    /**
     * @param account Account to check role ownership over
     * @return True if account has community admin role
     */
    function hasCommunityAdminRole(address account) external view returns (bool);

    /**
     * @param account Account to check role ownership over
     * @return True if account has platform role
     */
    function hasPlatformRole(address account) external view returns (bool);
}
