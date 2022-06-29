// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "../../../utils/ERC1155/IERC1155Upgradeable.sol";

import "../TokenManager2.sol";
import "../../interfaces/IPostSafeTransfer.sol";
import "../../../community/interfaces/ICommunity.sol";

/**
 * @author ishan@highlight.xyz
 * @notice Test implementation of token manager
 * @dev Used to test implementation of IPostSafeTransfer
 */
contract TransferHooksTokenManager2 is TokenManager2, IPostSafeTransfer {
    /**
     * @dev Used to test IPostSafeTransfer implementation. Transferring is stopped after n transfers.
     */
    uint256 public postTransfers;

    /**
     * @dev See {TokenManager-constructor}
     */
    constructor(address _community) TokenManager2(_community) {}

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
     * @dev Used to test implementation of IPostSafeTransfer. Reverts transfers if there have been > n transfers.
     *      Otherwise, see {IPostSafeTransfer-postSafeTransferFrom}.
     */
    function postSafeTransferFrom(
        address operator,
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata data
    ) external override nonReentrant onlyCommunity {
        postTransfers++;
        require(postTransfers < 5, "Too many transfers on token");
    }

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

    /**
     * @dev See {IERC165-supportsInterface}
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(TokenManager2) returns (bool) {
        return interfaceId == type(IPostSafeTransfer).interfaceId || super.supportsInterface(interfaceId);
    }
}
