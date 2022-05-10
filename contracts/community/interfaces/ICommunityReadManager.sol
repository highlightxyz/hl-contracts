// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/interfaces/IERC165Upgradeable.sol";

/**
 * @title Highlight community manager interface
 * @author ishan@highlight.xyz
 */
interface ICommunityReadManager is IERC165Upgradeable {
    /**
     * @notice Determines if message sender can swap Community Manager
     * @param sender Address sending message
     * @param newCommunityReadManager Address of new community manager being swapped to
     */
    function canSwap(address sender, address newCommunityReadManager) external view returns (bool);

    /**
     * @notice Determines if message sender can set community contract uri
     * @param sender Address sending message
     * @param setContractUri Whether contract uri is set to new contract uri
     * @param setName Whether contract name is set to new contract name
     * @param newContractUri New contract uri
     * @param newName New name
     */
    function canSetContractMetadata(
        address sender,
        bool setContractUri,
        bool setName,
        string calldata newContractUri,
        string calldata newName
    ) external view returns (bool);

    /**
     * @notice Determines if message sender can set total royalty cut on contract
     * @param sender Address sending message
     * @param newRoyaltyCut New total royalty cut
     */
    function canSetRoyaltyCut(address sender, uint32 newRoyaltyCut) external view returns (bool);

    /**
     * @notice Gets associated community
     */
    function community() external view returns (address);
}
