// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

/**
 * @title Interface all token managers are expected to implement
 * @author ishan@highlight.xyz
 */
interface ITokenManager2 {
    /**
     * @notice Emitted when new token(s) are minted by this token manager, to one receiver
     * @param tokenIds Newly minted tokens
     * @param to Recipient of newly minted tokens
     * @param sender Minter
     */
    event MintedNewTokensToOne(uint256[] tokenIds, address indexed to, address indexed sender);

    /**
     * @notice Emitted when new token is minted by this token manager, to multiple receivers
     * @param tokenId Newly minted token
     * @param to Recipients of newly minted tokens
     * @param sender Minter
     */
    event MintedNewTokenToMultiple(uint256 indexed tokenId, address[] to, address indexed sender);

    /**
     * @dev Mints new token(s) on community to one receiver.
     *      Emits {MintedNewTokensToOne}.
     * @param to Recipient of newly minted token(s)
     * @param amounts Amounts minted per token
     * @param uris Token uris
     * @param isMembership Booleans denoting token type of each minted token
     */
    function mintNewTokensToOne(
        address to,
        uint256[] calldata amounts,
        string[] calldata uris,
        bool[] calldata isMembership
    ) external returns (uint256[] memory);

    /**
     * @dev Mints new token on community to multiple receivers.
     *      Emits {MintedNewTokensToMultiple}.
     * @param to Recipients of newly minted token
     * @param amounts Amounts of token given to each recipient
     * @param uri Token uri
     * @param isMembership Boolean denoting token type of minted token
     */
    function mintNewTokenToMultiple(
        address[] calldata to,
        uint256[] calldata amounts,
        string calldata uri,
        bool isMembership
    ) external returns (uint256);

    /**
     * @dev Returns whether metadata updater is allowed to update
     * @param sender Updater
     * @param tokenId Token who's uri is being updated
     * @param oldTokenUri Token's old uri
     * @param newTokenUri Token's new uri
     * @return If invocation can update metadata
     */
    function canUpdateMetadata(
        address sender,
        uint256 tokenId,
        string calldata oldTokenUri,
        string calldata newTokenUri
    ) external view returns (bool);

    /**
     * @dev Returns whether token manager can be swapped for another one by invocator
     * @param sender Swapper
     * @param newTokenManager New token manager being swapped to
     * @return If invocation can swap token managers
     */
    function canSwap(address sender, address newTokenManager) external view returns (bool);

    /**
     * @dev Returns whether mint invoker can mint more of an existing token
     * @param sender Minter
     * @param tokenId Id of the token to mint
     * @param to Array of receiver addresses
     * @param amounts Array of token amounts
     * @param data Arbitrary data
     * @return If invocation can mint existing tokens
    */
    function canMintExisting(address sender, uint256 tokenId, address[] calldata to, uint256[] calldata amounts, bytes memory data) external view returns (bool);
}
