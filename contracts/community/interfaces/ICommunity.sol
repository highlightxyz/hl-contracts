// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "../../royalties/interfaces/ISplitMain.sol";

/**
 * @title Highlight community interface
 * @author ishan@highlight.xyz
 */
interface ICommunity {
    /**
     * @notice Emitted when token manager is registered
     * @param tokenManager The registered token manager
     * @param sender The registrar
     */
    event TokenManagerRegistered(address indexed tokenManager, address sender);

    /**
     * @notice Emitted when token manager is unregistered
     * @param tokenManager The unregistered token manager
     * @param sender The registrar
     */
    event TokenManagerUnregistered(address indexed tokenManager, address sender);

    /**
     * @notice Emitted when token manager of a token is set
     * @param tokenId The token who's manager was set
     * @param tokenManager The set token manager
     * @param sender The transaction caller
     */
    event TokenManagerSet(uint256 indexed tokenId, address indexed tokenManager, address sender);

    /**
     * @notice Emitted when the community read manager is set
     * @param communityManager The new community manager
     * @param sender The setter of the community manager
     */
    event CommunityReadManagerSet(address indexed communityManager, address sender);

    /**
     * @notice Emitted when "ownership" of contract is transferred
     * @param previousOwner The previous "owner" of the contract
     * @param newOwner The new "owner" of the contract
     */
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @notice Emitted when default total royalty cut of contract is set
     * @param oldRoyaltyCut The previous total royalty cut
     * @param newRoyaltyCut The new total royalty cut
     */
    event RoyaltyCutSet(uint32 indexed oldRoyaltyCut, uint32 indexed newRoyaltyCut);

    /**
     * @notice Emitted when the community level metadata is set
     * @param sender The setter
     * @param setContractUri Whether contract uri is set to new contract uri
     * @param setName Whether contract name is set to new contract name
     * @param newContractUri New contract uri
     * @param newName New name
     */
    event ContractMetadataSet(
        address indexed sender,
        string newContractUri,
        string newName,
        bool setContractUri,
        bool setName
    );

    /**
     * @dev Calls ERC1155 and CommunityAdmin constructors
     * @param creatorAdmin Top level creator managing community
     * @param defaultAdmin The default admin
     * @param permissionsRegistry The system permissions registry
     * @param owner "Owner" of community, used to administrate collections on external marketplaces
     * @param communityName The community's name
     * @param trustedForwarder Trusted meta tx relayer
     */
    function initialize(
        address creatorAdmin,
        address defaultAdmin,
        address permissionsRegistry,
        address owner,
        string calldata communityName,
        address trustedForwarder
    ) external;

    /**
     * @dev Set the royalty splitter contract for the community
     * @param splitMain The main royalty registry
     * @param secondaryAccounts Recipients of the secondary royalties
     * @param primaryAllocation Amount given to primary controller
     * @param royaltyDistributorFee Amount that royalty distributor is compensated
     * @param primaryController Primary controller of royalty split
     * @param secondaryControllers Secondary controllers of royalty split
     * @param totalRoyaltyCut The total cut of sales that the platform + the creators will take
     */
    function setRoyaltySplit(
        ISplitMain splitMain,
        address[] calldata secondaryAccounts,
        uint32 primaryAllocation,
        uint32[] calldata secondaryAllocations,
        uint32 royaltyDistributorFee,
        address primaryController,
        address[] calldata secondaryControllers,
        uint32 totalRoyaltyCut
    ) external;

    /**
     * @notice Registers a token manager
     * @dev Can only be called by platform.
     *      Token manager address must point to a contract implementing ITokenManager.
     *      Emits {TokenManagerRegistered}.
     * @param _tokenManager Registered token manager
     */
    function registerTokenManager(address _tokenManager) external;

    /**
     * @notice Unregisters a token manager
     * @dev Can only be called by platform.
     *      Is prevented if there are still tokens that this token manager manages.
     *      Emits {TokenManagerUnregistered}
     * @param _tokenManager Unregistered token manager
     */
    function unregisterTokenManager(address _tokenManager) external;

    /**
     * @notice Sets the manager of a given token.
     * @dev Registers token manager it it has not been registered.
     *      The new token manager does not have operator approvals over the token holders.
     * @param tokenId The token who's manager is being set
     * @param _tokenManager The set token manager
     */
    function setTokenManager(uint256 tokenId, address _tokenManager) external;

    /**
     * @notice Set the uri of a token.
     * @dev Can only be called by platform / tokenManager managing the modified token.
     * @param tokenId The token who's uri is set
     * @param _uri Set uri
     */
    function setTokenURI(uint256 tokenId, string calldata _uri) external;

    /**
     * @dev Mint tokens from a token manager, to one receiver.
     *      Can only be called by a registered token manager.
     *      Emits {ERC1155-TransferSingle} event or {ERC1155-TransferBatch} event.
     * @param to Receiver of minted token(s)
     * @param amounts Amounts of each minted token
     * @param uris Uris of each minted token
     * @param isMembership Booleans denoting if each token is a membership token
     */
    function managerMintNewToOne(
        address to,
        uint256[] calldata amounts,
        string[] calldata uris,
        bool[] calldata isMembership
    ) external returns (uint256[] memory);

    /**
     * @dev Mint a single token from a token manager, to multiple receivers.
     *      Can only be called by a registered token manager. Emits {ERC1155-TransferSingle} event.
     * @param to Receivers of minted token
     * @param amounts Amounts each receiver will receive of the same token
     * @param _uri Uri of minted token
     * @param isMembership Boolean denoting if newly minted token is a membership token
     */
    function managerMintNewToMultiple(
        address[] calldata to,
        uint256[] calldata amounts,
        string calldata _uri,
        bool isMembership
    ) external returns (uint256);

    /**
     * @dev Mint more of a single token from a token manager, to a single receiver.
     *      Can only be called by a registered token manager. Emits {ERC1155-TransferSingle} event.
     * @param to Receiver of minted token
     * @param tokenId Id of token
     * @param amount Amount more to be minted
     */
    function managerMintExistingMinimized(
        address to,
        uint256 tokenId,
        uint256 amount
    ) external;

    /**
     * @dev Calls safeBatchTransferFrom in a loop over array of to addresses
     * @param from Address tokens are sent from
     * @param to Addresses tokens are sent to
     * @param ids Tokens transferred
     * @param amounts Amounts of transferred tokens
     * @param data Arbitrary data
     */
    function safeBatchTransferFromMultipleRecipients(
        address from,
        address[] calldata to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes memory data
    ) external;

    /**
     * @dev Sets CommunityReadManager address
     * @param _communityManager New community manager
     */
    function setCommunityReadManager(address _communityManager) external;

    /**
     * @dev Sets contract level metadata
     * @param setContractUri Whether contract uri is set to new contract uri
     * @param setName Whether contract name is set to new contract name
     * @param newContractUri New contract uri
     * @param newName New name
     */
    function setContractMetadata(
        bool setContractUri,
        bool setName,
        string calldata newContractUri,
        string calldata newName
    ) external;

    /**
     * @dev Set total royalty cut
     * @param newRoyaltyCut New total royalty cut
     */
    function setRoyaltyCut(uint32 newRoyaltyCut) external;

    /**
     * @param tokenId The token who's token type is checked
     * @return True if token is a membership token
     */
    function isMembershipToken(uint256 tokenId) external view returns (bool);

    /**
     * @notice Gets numbers of minted tokens
     * @return (membership token count, membership token limit, benefit token count)
     */
    function tokenTypeCount()
        external
        view
        returns (
            uint128,
            uint128,
            uint256
        );

    /**
     * @return All token managers
     */
    function tokenManagers() external view returns (address[] memory);

    /**
     * @param tokenIds The tokens who's token managers are returned
     * @return The managers of the given tokens
     */
    function tokenManagerBatch(uint256[] calldata tokenIds) external view returns (address[] memory);

    /**
     * @param tokenId The token who's total supply is returned
     * @return The total supply of the given token
     */
    function totalSupply(uint256 tokenId) external view returns (uint256);

    /**
     * @param tokenIds The tokens who's total supplies are returned
     * @return The total supplies of the given tokens
     */
    function totalSupplyBatch(uint256[] calldata tokenIds) external view returns (uint256[] memory);

    /**
     * @param tokenIds The tokens who's uris are returned
     * @return The uris of the given tokens
     */
    function uriBatch(uint256[] calldata tokenIds) external view returns (string[] memory);

    /**
     * @notice Community name
     */
    function name() external view returns (string memory);

    /**
     * @notice Contract URI
     */
    function contractURI() external view returns (string memory);

    /**
     * @dev See {IERC2981Upgradeable-royaltyInfo}
     */
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external
        view
        returns (address receiver, uint256 royaltyAmount);

    /**
     * @dev Returns royalty split for contract
     */
    function royaltySplit() external view returns (address);

    /**
     * @dev Returns true if account is platform executor
     */
    function isPlatformExecutor(address account) external view returns (bool);

    /**
     * @dev Swappable contract that manages permissions and other contract-wide related functionality
     */
    function communityManager() external view returns (address);
}
