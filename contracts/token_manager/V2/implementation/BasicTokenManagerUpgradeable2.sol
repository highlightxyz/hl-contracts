// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "../../../utils/ERC1155/IERC1155Upgradeable.sol";

import "../TokenManagerUpgradeable2.sol";
import "../../interfaces/IPostSafeTransfer.sol";
import "../../../community/interfaces/ICommunity.sol";

/**
 * @author ishan@highlight.xyz
 * @notice Basic implementation of token manager
 * @dev Adds no additional functionality to ITokenManager interface
 */
contract BasicTokenManagerUpgradeable2 is TokenManagerUpgradeable2 {
    /**
     * @dev See {ITokenManager-mintNewTokensToOne}
     */
    function mintNewTokensToOne(
        address to,
        uint256[] calldata amounts,
        string[] calldata uris,
        bool[] calldata isMembership
    ) external override nonReentrant onlyPlatform returns (uint256[] memory tokenIds) {
        tokenIds = _mintNewTokensToOne(to, amounts, uris, isMembership);
        return tokenIds;
    }

    /**
     * @dev See {ITokenManager-mintNewTokenToMultiple}
     */
    function mintNewTokenToMultiple(
        address[] calldata to,
        uint256[] calldata amounts,
        string calldata uri,
        bool isMembership
    ) external override nonReentrant onlyPlatform returns (uint256 tokenId) {
        tokenId = _mintNewTokenToMultiple(to, amounts, uri, isMembership);
        return tokenId;
    }

    /* solhint-disable no-unused-vars */
    /**
     * @dev See {ITokenManager-canUpdateMetadata}
     */
    function canUpdateMetadata(
        address sender,
        uint256 tokenId,
        string calldata oldTokenUri,
        string calldata newTokenUri
    ) external view override returns (bool) {
        return ICommunityAdmin(community).hasPlatformRole(sender);
    }

    /**
     * @dev See {ITokenManager-canSwap}
     */
    function canSwap(address sender, address newTokenManager) external view returns (bool) {
        return ICommunity(community).isPlatformExecutor(sender);
    }

    /**
     * @dev See {ITokenManager2-canMintExisting}
     */
    function canMintExisting(address sender, uint256 tokenId, address[] calldata to, uint256[] calldata amounts, bytes calldata data) external view returns (bool) {
        return ICommunityAdmin(community).hasPlatformRole(sender);
    }

    /* solhint-enable no-unused-vars */
}
