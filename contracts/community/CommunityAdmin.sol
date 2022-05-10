// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "../utils/ReentrancyGuardUpgradeable.sol";
import "../utils/PausableUpgradeable.sol";

import "../utils/AccessControlUpgradeable.sol";
import "./interfaces/ICommunityAdmin.sol";

/**
 * @title Highlight community admin
 * @author ishan@highlight.xyz
 * @dev Communities must extend this
 */
abstract contract CommunityAdmin is
    ICommunityAdmin,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    /**
     * @notice Holders of this role are the community's admin, granted by platform role holders
     */
    bytes32 public constant COMMUNITY_ADMIN_ROLE = keccak256("COMMUNITY_ADMIN_ROLE");

    /**
     * @notice Holders of this role are the platform managing the community, and the top level creator
     */
    bytes32 public constant PLATFORM_ROLE = keccak256("PLATFORM_ROLE");

    /**
     * @dev See {ICommunityAdmin-swapDefaultAdmin}
     */
    function swapDefaultAdmin(address newDefaultAdmin) external virtual override onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(DEFAULT_ADMIN_ROLE, newDefaultAdmin);
    }

    /**
     * @dev See {ICommunityAdmin-swapPlatform}
     */
    function swapPlatform(address account) external virtual override onlyRole(PLATFORM_ROLE) {
        AccessControlUpgradeable._revokeRole(PLATFORM_ROLE, _msgSender());
        AccessControlUpgradeable._grantRole(PLATFORM_ROLE, account);
    }

    /**
     * @dev See {ICommunityAdmin-pause}
     */
    function pause() external virtual override onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev See {ICommunityAdmin-unpause}
     */
    function unpause() external virtual override onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev See {ICommunityAdmin-hasCommunityAdminRole}
     */
    function hasCommunityAdminRole(address account) external view virtual override returns (bool) {
        return hasRole(COMMUNITY_ADMIN_ROLE, account);
    }

    /**
     * @dev See {IERC165-supportsInterface}
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControlUpgradeable)
        returns (bool)
    {
        return
            interfaceId == type(ICommunityAdmin).interfaceId || AccessControlUpgradeable.supportsInterface(interfaceId);
    }

    /**
     * @notice Grant initial permissions
     * @param creatorAdmin Top level creator acccount
     */
    function __CommunityAdmin_init(address creatorAdmin, address defaultAdmin) internal onlyInitializing {
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init_unchained();

        _grantRole(PLATFORM_ROLE, creatorAdmin);
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(PLATFORM_ROLE, defaultAdmin);
        _setRoleAdmin(PLATFORM_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(COMMUNITY_ADMIN_ROLE, PLATFORM_ROLE);
    }
}
