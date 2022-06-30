// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "../utils/ReentrancyGuardUpgradeable.sol";
import "../utils/ERC165/ERC165Upgradeable.sol";
import "../utils/ERC165/ERC165CheckerUpgradeable.sol";
import "../utils/EnumerableSetUpgradeable.sol";
import "../utils/SafeMathUpgradeable.sol";

import "./interfaces/ICommunity.sol";
import "../token_manager/V2/interfaces/ITokenManager2.sol";
import "../token_manager/interfaces/IGlobalTokenManager.sol";

/**
 * @title Highlight community
 * @author ishan@highlight.xyz
 * @dev Highlight communities must extend this
 */
abstract contract Community is ERC165Upgradeable, ICommunity, ReentrancyGuardUpgradeable {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using AddressUpgradeable for address;
    using ERC165CheckerUpgradeable for address;

    /**
     * @notice Community name
     */
    string public name;

    /**
     * @dev Tracks registered token managers
     */
    EnumerableSetUpgradeable.AddressSet internal _tokenManagers;

    /**
     * @dev Tracks which token managers manage what tokens
     */
    mapping(uint256 => address) internal _tokenToManager;

    /**
     * @dev Tracks tokens' uris
     */
    mapping(uint256 => string) internal _tokenURI;

    /**
     * @dev Tracks number of membership token types
     */
    uint128 internal _membershipTokenCount;

    /**
     * @dev Number of tokens allotted before alternating scheme
     */
    uint128 internal constant _MEMBERSHIP_TOKEN_LIMIT = 100;

    /**
     * @dev Tracks number of benefit token types
     */
    uint256 internal _benefitTokenCount;

    /**
     * @dev Only allows registered token managers to perform action
     * @param tokenManager Requesting token manager
     */
    modifier tokenManagerRequired(address tokenManager) {
        require(_tokenManagers.contains(tokenManager), "Unregistered token manager");
        _;
    }

    /**
     * @dev See {ICommunity-tokenManagers}.
     */
    function tokenManagers() external view override returns (address[] memory) {
        return _tokenManagers.values();
    }

    /**
     * @dev See {ICommunity-tokenManagerBatch}
     */
    function tokenManagerBatch(uint256[] calldata tokenIds) external view override returns (address[] memory) {
        // cache length
        uint256 idLength = tokenIds.length;
        address[] memory tokenManagersBatch = new address[](idLength);

        for (uint256 i = 0; i < idLength; i++) {
            tokenManagersBatch[i] = _tokenToManager[tokenIds[i]];
        }

        return tokenManagersBatch;
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165Upgradeable) returns (bool) {
        return interfaceId == type(ICommunity).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @dev Registers a token manager.
     *      Emits {TokenManagerRegistered}.
     * @param tokenManager Registered token manager
     */
    function _registerTokenManager(address tokenManager, address sender) internal {
        require(tokenManager != address(this), "Invalid address");
        require(tokenManager.isContract(), "Not contract");
        require(
            tokenManager.supportsInterface(type(ITokenManager2).interfaceId) ||
                tokenManager.supportsInterface(type(IGlobalTokenManager).interfaceId),
            "Not token manager"
        );

        // registration happens here
        require(_tokenManagers.add(tokenManager), "Already registered");

        emit TokenManagerRegistered(tokenManager, sender);
    }

    /**
     * @dev Set a token's manager
     *      Emits {TokenManagerSet}.
     * @param tokenId Token who's manager is set
     * @param _tokenManager Set token manager
     */
    function _setTokenManager(
        uint256 tokenId,
        address _tokenManager,
        address sender
    ) internal {
        _tokenToManager[tokenId] = _tokenManager;
        emit TokenManagerSet(tokenId, _tokenManager, sender);
    }

    /**
     * @dev Returns true if the token manager is a global one
     * @param tokenManager The token manager being checked
     */
    function _isGlobalTokenManager(address tokenManager) internal view returns (bool) {
        return IERC165Upgradeable(tokenManager).supportsInterface(type(IGlobalTokenManager).interfaceId);
    }
}
