// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "../../../utils/ERC1155/IERC1155Upgradeable.sol";
import "../../interfaces/IGlobalTokenManager.sol";
import "../../../community/interfaces/ICommunity.sol";
import "../../../community/interfaces/ICommunityAdmin.sol";

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @author ishan@highlight.xyz
 * @notice Basic implementation of token manager, but one instance for system
 * @dev Adds no additional functionality to IGlobalBasicTokenManager
 */
contract GlobalBasicTokenManager is IGlobalTokenManager, ERC165, ReentrancyGuard {
    /**
     * @dev Ensures caller is platform
     */
    modifier onlyPlatform(address community) {
        require(ICommunityAdmin(community).hasPlatformRole(msg.sender), "Unauthorized");
        _;
    }

    /**
     * @dev See {ITokenManager-mintNewTokensToOne}
     */
    function mintNewTokensToOne(
        address community,
        address to,
        uint256[] calldata amounts,
        string[] calldata uris,
        bool[] calldata isMembership
    ) external override nonReentrant onlyPlatform(community) returns (uint256[] memory tokenIds) {
        tokenIds = ICommunity(community).managerMintNewToOne(to, amounts, uris, isMembership);
        emit MintedNewTokensToOne(tokenIds, to, msg.sender, community);
        return tokenIds;
    }

    /**
     * @dev See {ITokenManager-mintNewTokenToMultiple}
     */
    function mintNewTokenToMultiple(
        address community,
        address[] calldata to,
        uint256[] calldata amounts,
        string calldata uri,
        bool isMembership
    ) external override nonReentrant onlyPlatform(community) returns (uint256 tokenId) {
        tokenId = ICommunity(community).managerMintNewToMultiple(to, amounts, uri, isMembership);
        emit MintedNewTokenToMultiple(tokenId, to, msg.sender, community);
        return tokenId;
    }
    
    /* solhint-disable no-unused-vars */
    /**
     * @dev See {ITokenManager-canUpdateMetadata}
     */
    function canUpdateMetadata(
        address community,
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
    function canSwap(address community, address sender, address newTokenManager) external view returns (bool) {
        return ICommunity(community).isPlatformExecutor(sender);
    }

    /**
     * @dev See {ITokenManager2-canMintExisting}
     */
    function canMintExisting(address community, address sender, uint256 tokenId, address[] calldata to, uint256[] calldata amounts, bytes calldata data) external view returns (bool) {
        return ICommunityAdmin(community).hasPlatformRole(sender);
    }
    /* solhint-enable no-unused-vars */

    /**
     * @dev See {IERC165-supportsInterface}
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165) returns (bool) {
        return interfaceId == type(IGlobalTokenManager).interfaceId || super.supportsInterface(interfaceId);
    }
}
