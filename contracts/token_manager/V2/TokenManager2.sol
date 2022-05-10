// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../../utils/IAccessControlUpgradeable.sol";
import "../../utils/ERC1155/IERC1155Upgradeable.sol";
import "./interfaces/ITokenManager2.sol";
import "../../community/interfaces/ICommunity.sol";
import "../../community/interfaces/ICommunityAdmin.sol";

/**
 * @title Highlight token manager
 * @author ishan@highlight.xyz
 * @dev Highlight token managers must extend this
 */
abstract contract TokenManager2 is ITokenManager2, ERC165, ReentrancyGuard {
    using Address for address;
    using ERC165Checker for address;

    /**
     * @dev Associated community
     */
    address public community;

    /**
     * @dev Ensures caller is platform
     */
    modifier onlyPlatform() {
        require(ICommunityAdmin(community).hasPlatformRole(msg.sender), "Unauthorized");
        _;
    }

    /**
     * @dev Ensures caller is associated community
     */
    modifier onlyCommunity() {
        require(msg.sender == community, "Unauthorized");
        _;
    }

    /**
     * @dev Sets associated community, after ensuring that it implements the expected interfaces.
     * @param _community Associated community
     */
    constructor(address _community) {
        require(_community.isContract(), "Not a contract");
        bytes4[] memory interfaceIds = new bytes4[](4);
        interfaceIds[0] = type(ICommunity).interfaceId;
        interfaceIds[1] = type(IAccessControlUpgradeable).interfaceId;
        interfaceIds[2] = type(ICommunityAdmin).interfaceId;
        interfaceIds[3] = type(IERC1155Upgradeable).interfaceId;
        require(_community.supportsAllInterfaces(interfaceIds), "Interface not implemented");
        community = _community;
    }

    /**
     * @dev See {IERC165-supportsInterface}
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165) returns (bool) {
        return interfaceId == type(ITokenManager2).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @dev See {ITokenManager-mintNewTokensToOne}
     */
    function _mintNewTokensToOne(
        address to,
        uint256[] memory amounts,
        string[] memory uris,
        bool[] memory isMembership
    ) internal returns (uint256[] memory tokenIds) {
        tokenIds = ICommunity(community).managerMintNewToOne(to, amounts, uris, isMembership);
        emit MintedNewTokensToOne(tokenIds, to, msg.sender);
        return tokenIds;
    }

    /**
     * @dev See {ITokenManager-mintNewTokenToMultiple}
     */
    function _mintNewTokenToMultiple(
        address[] memory to,
        uint256[] memory amounts,
        string memory uri,
        bool isMembership
    ) internal returns (uint256 tokenId) {
        tokenId = ICommunity(community).managerMintNewToMultiple(to, amounts, uri, isMembership);
        emit MintedNewTokenToMultiple(tokenId, to, msg.sender);
        return tokenId;
    }
}
