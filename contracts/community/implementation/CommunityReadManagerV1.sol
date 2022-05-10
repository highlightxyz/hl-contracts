// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "../interfaces/ICommunityAdmin.sol";
import "../interfaces/ICommunity.sol";
import "../interfaces/ICommunityReadManager.sol";
import "../../utils/IAccessControlUpgradeable.sol";
import "../../utils/ERC1155/IERC1155Upgradeable.sol";
import "../../utils/ERC165/ERC165CheckerUpgradeable.sol";
import "../../utils/ERC165/ERC165Upgradeable.sol";

/**
 * @title Highlight community manager V1
 * @author ishan@highlight.xyz
 */
contract CommunityReadManagerV1 is ICommunityReadManager, ERC165Upgradeable {
    using ERC165CheckerUpgradeable for address;

    /**
     * @notice Address of associated community
     */
    address public community;

    /**
     * @dev Sets associated community, ensuring it adheres to specified interfaces
     * @param _community Community to set
     */
    constructor(address _community) {
        bytes4[] memory interfaceIds = new bytes4[](4);
        interfaceIds[0] = type(ICommunity).interfaceId;
        interfaceIds[1] = type(IAccessControlUpgradeable).interfaceId;
        interfaceIds[2] = type(ICommunityAdmin).interfaceId;
        interfaceIds[3] = type(IERC1155Upgradeable).interfaceId;
        require(_community.supportsAllInterfaces(interfaceIds), "Interface not implemented");
        community = _community;
    }

    /**
     * @dev See {ICommunityReadManager-canSwap}
     */
    /* solhint-disable no-unused-vars */
    function canSwap(address sender, address newCommunityReadManager) external view returns (bool) {
        return ICommunity(community).isPlatformExecutor(sender);
    }

    /**
     * @dev See {ICommunityReadManager-canSetContractMetadata}
     */
    function canSetContractMetadata(
        address sender,
        bool setContractUri,
        bool setName,
        string calldata newContractUri,
        string calldata newName
    ) external view returns (bool) {
        // is platform executor or has default admin role
        return
            ICommunity(community).isPlatformExecutor(sender) ||
            IAccessControlUpgradeable(community).hasRole(0x00, sender);
    }

    /**
     * @dev See {ICommunityReadManager-canSetRoyaltyCut}
     */
    function canSetRoyaltyCut(address sender, uint32 newRoyaltyCut) external view returns (bool) {
        // has default admin role
        return IAccessControlUpgradeable(community).hasRole(0x00, sender);
    }

    /* solhint-enable no-unused-vars */

    /**
     * @dev See {IERC165-supportsInterface}
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(IERC165Upgradeable, ERC165Upgradeable)
        returns (bool)
    {
        return
            interfaceId == type(ICommunityReadManager).interfaceId || ERC165Upgradeable.supportsInterface(interfaceId);
    }
}
