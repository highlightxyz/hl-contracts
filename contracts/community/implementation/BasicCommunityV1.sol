// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;
import "../../utils/ERC1155/ERC1155Upgradeable.sol";

import "../CommunityAdmin.sol";
import "../Community.sol";
import "../../token_manager/interfaces/IPostSafeTransfer.sol";
import "../interfaces/ICommunityReadManager.sol";
import "../../utils/ERC165/ERC165CheckerUpgradeable.sol";
import "../../royalties/SplitWallet.sol";
import "../../permissions_registry/IPermissionsRegistry.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC2981Upgradeable.sol";

/**
 * @title Basic Higlight community V1
 * @author ishan@highlight.xyz
 * @dev Community implementation
 */
contract BasicCommunityV1 is CommunityAdmin, Community, ERC1155Upgradeable {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using SafeMathUpgradeable for uint256;
    using SafeMathUpgradeable for uint128;
    using ERC165CheckerUpgradeable for address;

    /**
     * @dev Tracks the total supply of every token on the community
     */
    mapping(uint256 => uint256) private _totalSupply;

    /**
     * @notice Community contract uri
     */
    string public contractURI;

    /**
     * @notice Community read manager
     */
    address public communityManager;

    /**
     * @notice Royalty split
     */
    address public royaltySplit;

    /**
     * @notice Max bps
     */
    uint256 private constant _MAX_BPS = 10000;

    /**
     * @notice Default total royalty percentage taken by royalty recipients.
     */
    uint32 private _defaultTotalRoyaltyPercentage;

    /**
     * @notice Default marketplace to have approval for transfers
     */
    address private constant _DEFAULT_APPROVED_MARKETPLACE_ADDRESS = 0x207Fa8Df3a17D96Ca7EA4f2893fcdCb78a304101;

    /**
     * @notice "Owner" of contract, used for editing collections
     */
    address private _owner;

    /**
     * @notice Permissions registry
     * @dev Used to validate platform executor
     */
    address private _permissionsRegistry;

    /**
     * @notice Permitted meta tx relayer
     */
    address private _trustedForwarder;

    /**
     * @dev Only platform accounts or token managers of a particular token
     * @param account The account attempting to be authorized
     * @param tokenId The id of the affected token
     */
    modifier platformOrTokenManager(address account, uint256 tokenId) {
        require(hasRole(PLATFORM_ROLE, account) || _tokenToManager[tokenId] == account, "Unauthorized");
        _;
    }

    /**
     * @dev Reverts if royaltySplit has been set
     */
    modifier royaltySplitNotSet() {
        require(royaltySplit == address(0), "Already set");
        _;
    }

    /**
     * @dev Throws if called by any account other than the owner, or if uninitialized, owner is not default admin.
     */
    modifier onlyOwner() {
        require(_owner == _msgSender(), "Unauthorized");
        _;
    }

    /**
     * @dev See {ICommunity-initialize}
     */
    function initialize(
        address creatorAdmin,
        address defaultAdmin,
        address permissionsRegistry,
        address owner,
        string calldata communityName,
        address trustedForwarder
    ) external override initializer {
        require(
            permissionsRegistry.supportsInterface(type(IPermissionsRegistry).interfaceId),
            "Invalid permissions registry"
        );
        __CommunityAdmin_init(creatorAdmin, defaultAdmin);
        __ERC1155_init();
        __Context_init();
        name = communityName;
        _permissionsRegistry = permissionsRegistry;
        _trustedForwarder = trustedForwarder;
        _transferOwnership(owner);
    }

    /**
     * @dev See {ICommunity-setRoyaltySplit}
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
    ) external override royaltySplitNotSet whenNotPaused onlyRole(DEFAULT_ADMIN_ROLE) {
        require(totalRoyaltyCut <= 10000, "Cut too big");
        royaltySplit = splitMain.createSplit(
            ISplitMain.Split(
                1,
                primaryAllocation,
                royaltyDistributorFee,
                secondaryAllocations,
                primaryController,
                secondaryControllers,
                secondaryAccounts
            ),
            address(this)
        );
        emit RoyaltyCutSet(_defaultTotalRoyaltyPercentage, totalRoyaltyCut);
        _defaultTotalRoyaltyPercentage = totalRoyaltyCut;
    }

    /**
     * @dev See {ICommunity-setRoyaltyCut}
     */
    function setRoyaltyCut(uint32 newRoyaltyCut) external override whenNotPaused {
        require(ICommunityReadManager(communityManager).canSetRoyaltyCut(_msgSender(), newRoyaltyCut), "Unauthorized");
        require(newRoyaltyCut <= 10000, "Cut too big");

        emit RoyaltyCutSet(_defaultTotalRoyaltyPercentage, newRoyaltyCut);
        _defaultTotalRoyaltyPercentage = newRoyaltyCut;
    }

    /**
     * @dev See {ICommunity-managerMintExistingMinimized}
     */
    function managerMintExistingMinimized(
        address to,
        uint256 tokenId,
        uint256 amount
    ) external virtual nonReentrant whenNotPaused nonReentrant tokenManagerRequired(msg.sender) {
        require(_tokenToManager[tokenId] == msg.sender, "Unauthorized tokenManager");
        _mint(msg.sender, to, tokenId, amount, new bytes(0));
    }

    /**
     * @dev Sets CommunityReadManager address
     * @param _communityManager New community manager
     */
    function setCommunityReadManager(address _communityManager) external override whenNotPaused nonReentrant {
        address msgSender = _msgSender();
        if (communityManager == address(0)) {
            // default to platform role if not set
            require(hasPlatformRole(msgSender), "Unauthorized");
        } else {
            require(ICommunityReadManager(communityManager).canSwap(msgSender, _communityManager), "Unauthorized");
        }
        require(
            _communityManager.supportsInterface(type(ICommunityReadManager).interfaceId),
            "Not a community manager"
        );
        require(_communityManager != communityManager, "Already set");
        require(ICommunityReadManager(_communityManager).community() == address(this), "Wrong community's manager");

        communityManager = _communityManager;
        emit CommunityReadManagerSet(_communityManager, msgSender);
    }

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
    ) external override whenNotPaused {
        address msgSender = _msgSender();
        require(communityManager != address(0), "Community manager not set");
        require(setContractUri || setName, "One has to be set");
        require(
            ICommunityReadManager(communityManager).canSetContractMetadata(
                msgSender,
                setContractUri,
                setName,
                newContractUri,
                newName
            ),
            "Unauthorized"
        );

        if (setContractUri) {
            contractURI = newContractUri;
        }

        if (setName) {
            name = newName;
        }

        emit ContractMetadataSet(msgSender, newContractUri, newName, setContractUri, setName);
    }

    /**
     * @dev See {ICommunity-registerTokenManager}.
     */
    function registerTokenManager(address _tokenManager) external override whenNotPaused {
        address msgSender = _msgSender();
        require(hasPlatformRole(msgSender), "Unauthorized");
        _registerTokenManager(_tokenManager, msgSender);
    }

    /**
     * @dev See {ICommunity-unregisterTokenManager}.
     */
    function unregisterTokenManager(address _tokenManager) external override whenNotPaused {
        address msgSender = _msgSender();
        require(hasPlatformRole(msgSender), "Unauthorized");
        require(_tokenManagers.contains(_tokenManager), "Not registered");
        _tokenManagers.remove(_tokenManager);

        emit TokenManagerUnregistered(_tokenManager, msgSender);
    }

    /**
     * @dev See {ICommunity-setTokenURI}.
     */
    function setTokenURI(uint256 tokenId, string calldata _uri) external override whenNotPaused {
        address tokenManager = _tokenToManager[tokenId];
        require(
            ITokenManager2(tokenManager).canUpdateMetadata(_msgSender(), tokenId, _tokenURI[tokenId], _uri),
            "ITokenManager2: Unauthorized"
        );
        _tokenURI[tokenId] = _uri;
        emit URI(_uri, tokenId);
    }

    /**
     * @dev See {ICommunity-setTokenManager}.
     */
    function setTokenManager(uint256 tokenId, address _tokenManager) external override whenNotPaused nonReentrant {
        address tokenManager = _tokenToManager[tokenId];
        address msgSender = _msgSender();
        require(tokenManager != address(0), "No existing manager");
        require(ITokenManager2(tokenManager).canSwap(msgSender, _tokenManager), "Unauthorized");

        if (!_tokenManagers.contains(_tokenManager)) {
            _registerTokenManager(_tokenManager, msgSender);
        }
        _setTokenManager(tokenId, _tokenManager, msgSender);
    }

    /**
     * @dev See {ICommunity-managerMintNewToOne}
     */
    function managerMintNewToOne(
        address to,
        uint256[] calldata amounts,
        string[] calldata uris,
        bool[] calldata isMembership
    )
        external
        virtual
        override
        whenNotPaused
        nonReentrant
        tokenManagerRequired(msg.sender)
        returns (uint256[] memory tokenIds)
    {
        return _mintNewToOne(msg.sender, to, amounts, uris, isMembership);
    }

    /**
     * @dev See {ICommunity-managerMintNewToMultiple}
     */
    function managerMintNewToMultiple(
        address[] calldata to,
        uint256[] calldata amounts,
        string calldata _uri,
        bool isMembership
    ) external virtual override nonReentrant whenNotPaused tokenManagerRequired(msg.sender) returns (uint256 tokenId) {
        return _mintNewToMultiple(msg.sender, to, amounts, _uri, isMembership);
    }

    /* solhint-enable no-unused-vars */

    /**
     * @dev See {ICommunity-isMembershipToken}
     */
    function isMembershipToken(uint256 tokenId) external view virtual override returns (bool) {
        if (tokenId == 0) {
            return false;
        } else if (tokenId % 100 == 0) {
            return !(tokenId % 200 == 0);
        } else {
            return (tokenId / 100) % 2 == 0;
        }
    }

    /**
     * @dev See {ICommunity-tokenTypeCount}
     */
    function tokenTypeCount()
        external
        view
        virtual
        override
        returns (
            uint128,
            uint128,
            uint256
        )
    {
        return (_membershipTokenCount, _MEMBERSHIP_TOKEN_LIMIT, _benefitTokenCount);
    }

    /**
     * @dev See {ICommunity-totalSupply}
     */
    function totalSupply(uint256 tokenId) external view override returns (uint256) {
        return _totalSupply[tokenId];
    }

    /**
     * @dev See {ICommunity-totalSupplyBatch}
     */
    function totalSupplyBatch(uint256[] calldata tokenIds) external view override returns (uint256[] memory) {
        uint256[] memory totalSuppliesBatch = new uint256[](tokenIds.length);

        for (uint256 i = 0; i < tokenIds.length; i++) {
            totalSuppliesBatch[i] = _totalSupply[tokenIds[i]];
        }

        return totalSuppliesBatch;
    }

    /**
     * @dev See {IERC2981-royaltyInfo}
     */
    /* solhint-disable no-unused-vars */
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external
        view
        virtual
        override
        returns (address receiver, uint256 royaltyAmount)
    {
        receiver = royaltySplit;
        royaltyAmount = (salePrice * uint256(_defaultTotalRoyaltyPercentage)) / 10000; // using hardcoded value instead of available constant due to upgrade bug
    }

    /* solhint-enable no-unused-vars */

    /**
     * @notice Overrides ERC1155-safeTransferFrom
     * @dev Calls token manager's hook if implementing IPostSafeTransfer. Is also never paused, as private key leaks do not compromise transfers.
     * @param from Address tokens are sent from
     * @param to Address tokens are sent to
     * @param id Token transferred
     * @param amount Amount of transferred token
     * @param data Arbitrary data
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public virtual override {
        address msgSender = _msgSender();
        require(from == msgSender || isApprovedForAll(from, msgSender), "ERC1155: caller unauthorized");
        _safeTransferFrom(msgSender, from, to, id, amount, data);

        address manager = _tokenToManager[id];

        if (IERC165Upgradeable(manager).supportsInterface(type(IPostSafeTransfer).interfaceId)) {
            IPostSafeTransfer(manager).postSafeTransferFrom(msgSender, from, to, id, amount, data);
        }
    }

    /**
     * @notice Overrides ERC1155-safeBatchTransferFrom
     * @dev Calls token manager's hook if implementing IPostSafeTransfer. Is also never paused, as private key leaks do not compromise transfers.
     * @param from Address tokens are sent from
     * @param to Address tokens are sent to
     * @param ids Tokens transferred
     * @param amounts Amounts of transferred tokens
     * @param data Arbitrary data
     */
    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes memory data
    ) public virtual override {
        address msgSender = _msgSender();
        require(from == msgSender || isApprovedForAll(from, msgSender), "ERC1155: caller unauthorized");

        _safeBatchTransferFrom(msgSender, from, to, ids, amounts, data);

        if (data.length > 0 && abi.decode(data, (bool)) && hasPlatformRole(msgSender)) {
            _postSafeBatchTransferFrom(msgSender, from, to, ids, amounts, data, true);
        } else {
            _postSafeBatchTransferFrom(msgSender, from, to, ids, amounts, data, false);
        }
    }

    /**
     * @dev See {ICommunity-safeBatchTransferFromMultipleRecipients}
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
    ) public virtual nonReentrant whenNotPaused {
        address msgSender = _msgSender();
        require(from == msgSender || isApprovedForAll(from, msgSender), "ERC1155: caller unauthorized");

        for (uint256 i = 0; i < to.length; i++) {
            _safeBatchTransferFrom(msgSender, from, to[i], ids, amounts, data);
        }

        // We intentionally do not approve marketplace here as the expected use case is to airdrop to community members who will likely have marketplace approved already.
        // Further, it would be malpractice to airdrop tokens to non-members and approve the marketplace for them. We make a distinction here between this and a purchase.

        for (uint256 i = 0; i < ids.length; i++) {
            address manager = _tokenToManager[ids[i]];

            if (IERC165Upgradeable(manager).supportsInterface(type(IPostSafeTransfer).interfaceId)) {
                for (uint256 j = 0; j < to.length; j++) {
                    IPostSafeTransfer(manager).postSafeTransferFrom(msgSender, from, to[j], ids[i], amounts[i], data);
                }
            }
        }
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner whenNotPaused {
        require(newOwner != address(0), "Invalid owner");
        _transferOwnership(newOwner);
    }

    /**
     * @dev See {IERC165Upgradeable-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(Community, ERC1155Upgradeable, CommunityAdmin)
        returns (bool)
    {
        return
            Community.supportsInterface(interfaceId) ||
            ERC1155Upgradeable.supportsInterface(interfaceId) ||
            CommunityAdmin.supportsInterface(interfaceId) ||
            interfaceId == type(IERC2981Upgradeable).interfaceId;
    }

    /**
     * @dev Returns true if forwarder is the trusted meta tx relayer
     */
    function isTrustedForwarder(address forwarder) public view virtual override returns (bool) {
        return forwarder == _trustedForwarder;
    }

    /**
     * @dev See {ICommunity-isPlatformExecutor}
     */
    function isPlatformExecutor(address account) public view override returns (bool) {
        return IPermissionsRegistry(_permissionsRegistry).isPlatformExecutor(account);
    }

    /**
     * @dev See {ICommunityAdmin-hasPlatformRole}
     */
    function hasPlatformRole(address account) public view virtual override returns (bool) {
        return isPlatformExecutor(account) || hasRole(PLATFORM_ROLE, account);
    }

    /**
     * @dev See {IERC1155-isApprovedForAll}.
     */
    function isApprovedForAll(address account, address operator) public view virtual override returns (bool) {
        return
            super.isApprovedForAll(account, operator) ||
            (account == IPermissionsRegistry(_permissionsRegistry).platformVault() &&
                operator == IPermissionsRegistry(_permissionsRegistry).platformExecutor());
    }

    /**
     * @dev See {IERC1155Metadata-uri} and {Community}.
     */
    function uri(uint256 tokenId) public view virtual override returns (string memory) {
        return _tokenURI[tokenId];
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Mints multiple new tokens to one recipient, setting upkeep data in the process.
     *      See {ICommunity-managerMintNewToOne}, {_mint}, {_mintBatch}
     */
    function _mintNewToOne(
        address _tokenManager,
        address to,
        uint256[] memory amounts,
        string[] memory uris,
        bool[] memory isMembership
    ) internal returns (uint256[] memory tokenIds) {
        require(amounts.length > 0 && isMembership.length > 0, "Empty array");
        require(
            (uris.length == 0 && amounts.length == isMembership.length) ||
                (amounts.length == uris.length && amounts.length == isMembership.length),
            "Invalid input"
        );
        tokenIds = new uint256[](amounts.length);

        // reads from storage are expensive
        uint128 tempMembershipTokenCount = _membershipTokenCount;
        uint128 tempMembershipTokenLimit = _MEMBERSHIP_TOKEN_LIMIT;
        uint256 tempBenefitTokenCount = _benefitTokenCount;

        // membershipTokenId = 200*(membershipTokenCount / 100) + (membershipTokenCount % 100) + 1
        // benefitTokenId = 200*(benefitTokenCount / 100) + (benefitTokenCount % 100) + 100 + 101

        uint256 _tokenId;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            if (isMembership[i]) {
                _tokenId = _calculateMembershipTokenId(tempMembershipTokenCount, tempMembershipTokenLimit);
                tokenIds[i] = _tokenId;
                _tokenToManager[_tokenId] = _tokenManager;
                tempMembershipTokenCount++;
            } else {
                _tokenId = _calculateBenefitTokenId(tempBenefitTokenCount, tempMembershipTokenLimit);
                tokenIds[i] = _tokenId;
                _tokenToManager[_tokenId] = _tokenManager;
                tempBenefitTokenCount++;
            }

            if (i < uris.length && bytes(uris[i]).length > 0) {
                _tokenURI[tokenIds[i]] = uris[i];
            }
        }

        _membershipTokenCount = tempMembershipTokenCount;
        _benefitTokenCount = tempBenefitTokenCount;

        if (tokenIds.length == 1) {
            _mint(msg.sender, to, tokenIds[0], amounts[0], new bytes(0));
        } else {
            _mintBatch(msg.sender, to, tokenIds, amounts, new bytes(0));
        }

        return tokenIds;
    }

    /**
     * @dev Mints one new token to multiple recipients, setting upkeep data in the process.
     *      See {ICommunity-managerMintNewToMultiple}, {_mint}.
     */
    function _mintNewToMultiple(
        address _tokenManager,
        address[] memory to,
        uint256[] memory amounts,
        string memory _uri,
        bool isMembership
    ) internal returns (uint256 tokenId) {
        require(to.length > 0 && amounts.length > 0, "Empty array");
        require(amounts.length == 1 || to.length == amounts.length, "Invalid input");

        if (isMembership) {
            tokenId = _calculateMembershipTokenId(_membershipTokenCount, _MEMBERSHIP_TOKEN_LIMIT);
            _membershipTokenCount++;
        } else {
            tokenId = _calculateBenefitTokenId(_benefitTokenCount, _MEMBERSHIP_TOKEN_LIMIT);
            _benefitTokenCount++;
        }

        _tokenURI[tokenId] = _uri;
        _tokenToManager[tokenId] = _tokenManager;

        if (to.length == 1 && amounts.length == 1) {
            _mint(msg.sender, to[0], tokenId, amounts[0], new bytes(0));
        } else {
            if (amounts.length == 1) {
                // Everyone receiving the same amount
                for (uint256 i = 0; i < to.length; i++) {
                    _mint(msg.sender, to[i], tokenId, amounts[0], new bytes(0));
                }
            } else {
                // Everyone receiving different amounts
                for (uint256 i = 0; i < to.length; i++) {
                    _mint(msg.sender, to[i], tokenId, amounts[i], new bytes(0));
                }
            }
        }

        return tokenId;
    }

    /**
     * @dev Updates totalSupply with newly minted tokens.
     *      Otherwise, see {ERC1155-_mint}.
     */
    function _mint(
        address operator,
        address account,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) internal virtual override {
        super._mint(operator, account, id, amount, data);

        _totalSupply[id] = _totalSupply[id].add(amount);
    }

    /**
     * @dev Updates totalSupply with newly minted tokens.
     *      Otherwise, see {ERC1155-_mintBatch}.
     */
    function _mintBatch(
        address operator,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override {
        super._mintBatch(operator, to, ids, amounts, data);
        for (uint256 i = 0; i < ids.length; ++i) {
            _totalSupply[ids[i]] = _totalSupply[ids[i]].add(amounts[i]);
        }
    }

    /**
     * @dev Approves marketplace if requested for recipients, and processes PostSafeTransfer logic if manager of token implements interface.
     */
    function _postSafeBatchTransferFrom(
        address operator,
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes memory data,
        bool approveMarketplace
    ) internal virtual {
        // if the data specifies to approve the default marketplace to transfer on the recipient's tokens and the sender is a platform admin, approve
        if (approveMarketplace) {
            _setApprovalForAll(to, 0x207Fa8Df3a17D96Ca7EA4f2893fcdCb78a304101, true); // using hardcoded value instead of available constant due to upgrade bug
        }

        for (uint256 i = 0; i < ids.length; i++) {
            address manager = _tokenToManager[ids[i]];

            if (IERC165Upgradeable(manager).supportsInterface(type(IPostSafeTransfer).interfaceId)) {
                IPostSafeTransfer(manager).postSafeTransferFrom(operator, from, to, ids[i], amounts[i], data);
            }
        }
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     *      Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    /**
     * @dev Calculate membership token id via this formula:
     *      membershipTokenId = 200*(membershipTokenCount / 100) + (membershipTokenCount % 100) + 1
     */
    function _calculateMembershipTokenId(uint128 membershipTokenCount, uint128 membershipTokenLimit)
        internal
        pure
        returns (uint256)
    {
        return
            membershipTokenLimit
                .mul(2)
                .mul(membershipTokenCount.div(membershipTokenLimit))
                .add(membershipTokenCount.mod(membershipTokenLimit))
                .add(1);
    }

    /**
     * @dev Calculate benefit token id via this formula:
     *      benefitTokenId = 200*(benefitTokenCount / 100) + (benefitTokenCount % 100) + 101
     */
    function _calculateBenefitTokenId(uint256 benefitTokenCount, uint128 membershipTokenLimit)
        internal
        pure
        returns (uint256)
    {
        return
            membershipTokenLimit
                .mul(2)
                .mul(benefitTokenCount.div(membershipTokenLimit))
                .add(benefitTokenCount.mod(membershipTokenLimit))
                .add(101);
    }
}
