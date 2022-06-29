// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "../royalties/interfaces/ISplitMain.sol";
import "../community/interfaces/ICommunity.sol";
import "../utils/EnumerableSetUpgradeable.sol";
import {ERC20} from "@rari-capital/solmate/src/tokens/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/IERC1155MetadataURI.sol";

/**
 * @title Onchain API used by Highlight
 * @author ishan@highlight.xyz
 */
contract APIProxy {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using SafeMath for uint256;

    /**
     * @dev System royalty manager
     */
    address private immutable _splitMain;

    /**
     * @dev Representation of 100% on royalty manager
     */
    uint256 private constant _ROYALTY_PERCENTAGE_SCALE = 1e6;

    /**
     * @dev Sets the royalty manager
     */
    constructor(address splitMain) {
        _splitMain = splitMain;
    }

    /**
     * @dev Distributes royalties accrued by a community, and withdraws after for a user.
     *      Note - This will distribute / allocate royalties for all recipients. Also, it will withdraw
     *             amounts that may have been allocated for the user from other communities. Invoking this function
     *             enumerated over a couple uses is not an efficient use of the royalty protocol, but serves as the simplest UX for the end user.
     * @param community Community accruing royalties
     * @param account The user to also withdraw royalties for, past allocation
     * @param currencies Currencies to withdraw royalties for (royalties for native gas token will also be pulled)
     */
    function withdrawRoyaltiesOwedForUserOnCommunity(
        address community,
        address account,
        ERC20[] calldata currencies
    ) external {
        // distribute to allocations
        address splitWallet = ICommunity(community).royaltySplit();
        uint256 currenciesLength = currencies.length;
        for (uint256 i = 0; i < currenciesLength; i++) {
            ISplitMain(_splitMain).distributeERC20(splitWallet, currencies[i], msg.sender);
        }
        if (splitWallet.balance > 0) {
            ISplitMain(_splitMain).distributeETH(splitWallet, msg.sender);
        }

        // withdraw
        ISplitMain(_splitMain).withdraw(account, ISplitMain(_splitMain).getETHBalance(account), currencies);
    }

    /**
     * @dev Distributes royalties accrued by a community, and withdraws after for all recipients.
     *      Note - This will distribute / allocate royalties for all recipients. Also, it will withdraw
     *             amounts that may have been allocated for all recipients from other communities. Invoking this function
     *             enumerated over a couple uses is not an efficient use of the royalty protocol, but serves as the simplest UX for the end user.
     * @param community Community accruing royalties
     * @param currencies Currencies to withdraw royalties for (royalties for native gas token will also be pulled)
     */
    function withdrawRoyaltiesOwedForAllRecipientsOnCommunity(address community, ERC20[] calldata currencies) external {
        address splitWallet = ICommunity(community).royaltySplit();
        uint256 currenciesLength = currencies.length;
        for (uint256 i = 0; i < currenciesLength; i++) {
            ISplitMain(_splitMain).distributeERC20(splitWallet, currencies[i], msg.sender);
        }
        if (splitWallet.balance > 0) {
            ISplitMain(_splitMain).distributeETH(splitWallet, msg.sender);
        }

        ISplitMain.Split memory split = ISplitMain(_splitMain).getSplit(splitWallet);
        // do not use _getUniqueRecipients as it would be less gas efficient, and is mostly useful for unlikely edge cases
        ISplitMain(_splitMain).withdraw(
            split.primaryController,
            ISplitMain(_splitMain).getETHBalance(split.primaryController),
            currencies
        );
        uint256 secondaryAccountsLength = split.secondaryAccounts.length;
        for (uint256 i = 0; i < secondaryAccountsLength; i++) {
            ISplitMain(_splitMain).withdraw(
                split.secondaryAccounts[i],
                ISplitMain(_splitMain).getETHBalance(split.secondaryAccounts[i]),
                currencies
            );
        }
    }

    /**
     * @dev Gets the royalties accrued by a user on a community in a particular currency
     *      + total royalties already distributed to them in that currency from all other communities.
     * @param community Community accruing royalties
     * @param currency Currencies to read royalties owed for
     * @param account User accruing royalties within community
     * @return allocatedOnSplitMain Portion of royaltyies accrued by community that is expected to go to account
     * @return splitWalletShare Royalties already distributed to account (from all communities), waiting to be withdrawn
     */
    function getERC20RoyaltiesOwedForUserOnCommunity(
        address community,
        ERC20 currency,
        address account
    ) external view returns (uint256 allocatedOnSplitMain, uint256 splitWalletShare) {
        allocatedOnSplitMain = ISplitMain(_splitMain).getERC20Balance(account, currency);
        // due to how SplitMain works
        if (allocatedOnSplitMain == 1) {
            allocatedOnSplitMain = 0;
        }

        address splitWallet = ICommunity(community).royaltySplit();
        ISplitMain.Split memory split = ISplitMain(_splitMain).getSplit(splitWallet);
        uint32 percentageOwedToUser = _getAccountSplitTotalPercentage(split, account);
        splitWalletShare = currency.balanceOf(splitWallet).mul(percentageOwedToUser).div(_ROYALTY_PERCENTAGE_SCALE);
    }

    /**
     * @dev Gets the royalties accrued by a user on a community in the native gas token of the chain
     *      + total royalties already distributed to them in the native gas token from all other communities.
     * @param community Community accruing royalties
     * @param account User accruing royalties within community
     * @return allocatedOnSplitMain Portion of royalties accrued by community that is expected to go to account
     * @return splitWalletShare Royalties already distributed to account (from all communities), waiting to be withdrawn
     */
    function getNativeRoyaltiesOwedForUserOnCommunity(address community, address account)
        external
        view
        returns (uint256 allocatedOnSplitMain, uint256 splitWalletShare)
    {
        allocatedOnSplitMain = ISplitMain(_splitMain).getETHBalance(account);
        // due to how SplitMain works
        if (allocatedOnSplitMain == 1) {
            allocatedOnSplitMain = 0;
        }

        address splitWallet = ICommunity(community).royaltySplit();
        ISplitMain.Split memory split = ISplitMain(_splitMain).getSplit(splitWallet);
        uint32 percentageOwedToUser = _getAccountSplitTotalPercentage(split, account);
        splitWalletShare = splitWallet.balance.mul(percentageOwedToUser).div(_ROYALTY_PERCENTAGE_SCALE);
    }

    /**
     * @dev Gets the royalties accrued by all royalty recipients on a community in a particular currency
     *      + total royalties already distributed to them in that currency from all other communities.
     * @param community Community accruing royalties
     * @param currency Currencies to read royalties owed for
     * @return recipients Unique set of royalty recipients for community
     * @return allocationsOnSplitMain Portions of royalties accrued by community that is expected to go to recipients, indexed as recipients
     * @return splitWalletShares Royalties already distributed to recipients (from all communities), waiting to be withdrawn, indexed as recipients
     */
    function getERC20RoyaltiesOwedForAllRecipientsOnCommunity(address community, ERC20 currency)
        external
        view
        returns (
            address[] memory,
            uint256[] memory,
            uint256[] memory
        )
    {
        address splitWallet = ICommunity(community).royaltySplit();
        ISplitMain.Split memory split = ISplitMain(_splitMain).getSplit(splitWallet);
        uint256 splitWalletCurrencyBalance = currency.balanceOf(splitWallet);

        address[] memory recipients = _getUniqueRecipients(split);
        // not caching recipients length due to stack depth
        uint32[] memory recipientsPercentageOwed = new uint32[](recipients.length);
        uint256[] memory allocationsOnSplitMain = new uint256[](recipients.length);
        uint256[] memory splitWalletShares = new uint256[](recipients.length);
        for (uint256 i = 0; i < recipients.length; i++) {
            recipientsPercentageOwed[i] = _getAccountSplitTotalPercentage(split, recipients[i]);
        }

        for (uint256 i = 0; i < recipients.length; i++) {
            allocationsOnSplitMain[i] = ISplitMain(_splitMain).getERC20Balance(recipients[i], currency);
            if (allocationsOnSplitMain[i] == 1) {
                allocationsOnSplitMain[i] = 0;
            }
            splitWalletShares[i] = splitWalletCurrencyBalance.mul(recipientsPercentageOwed[i]).div(
                _ROYALTY_PERCENTAGE_SCALE
            );
        }

        return (recipients, allocationsOnSplitMain, splitWalletShares);
    }

    /**
     * @dev Gets the royalties accrued by all royalty recipients on a community in the chain's native gas token
     *      + total royalties already distributed to them in the native gas token from all other communities.
     * @param community Community accruing royalties
     * @return recipients Unique set of royalty recipients for community
     * @return allocationsOnSplitMain Portions of royalties accrued by community that is expected to go to recipients, indexed as recipients
     * @return splitWalletShares Royalties already distributed to recipients (from all communities), waiting to be withdrawn, indexed as recipients
     */
    function getNativeRoyaltiesOwedForAllRecipientsOnCommunity(address community)
        external
        view
        returns (
            address[] memory,
            uint256[] memory,
            uint256[] memory
        )
    {
        address splitWallet = ICommunity(community).royaltySplit();
        ISplitMain.Split memory split = ISplitMain(_splitMain).getSplit(splitWallet);
        uint256 splitWalletBalance = splitWallet.balance;

        address[] memory recipients = _getUniqueRecipients(split);
        uint256 recipientsLength = recipients.length;
        uint32[] memory recipientsPercentageOwed = new uint32[](recipientsLength);
        uint256[] memory allocationsOnSplitMain = new uint256[](recipientsLength);
        uint256[] memory splitWalletShares = new uint256[](recipientsLength);
        for (uint256 i = 0; i < recipientsLength; i++) {
            recipientsPercentageOwed[i] = _getAccountSplitTotalPercentage(split, recipients[i]);
        }

        for (uint256 i = 0; i < recipientsLength; i++) {
            allocationsOnSplitMain[i] = ISplitMain(_splitMain).getETHBalance(recipients[i]);
            if (allocationsOnSplitMain[i] == 1) {
                allocationsOnSplitMain[i] = 0;
            }
            splitWalletShares[i] = splitWalletBalance.mul(recipientsPercentageOwed[i]).div(_ROYALTY_PERCENTAGE_SCALE);
        }

        return (recipients, allocationsOnSplitMain, splitWalletShares);
    }

    /**
     * @dev Gets all uris on a community for an input set of tokens.
     * @param community Community with the tokens
     * @param tokenIds Token ids to grab uris for
     */
    function uriBatch(address community, uint256[] calldata tokenIds) external view returns (string[] memory) {
        uint256 tokenIdsLength = tokenIds.length;
        string[] memory uris = new string[](tokenIdsLength);
        for (uint256 i = 0; i < tokenIdsLength; i++) {
            uris[i] = IERC1155MetadataURI(community).uri(tokenIds[i]);
        }
        return uris;
    }

    /**
     * @dev Gets all token supplies on a community for an input set of tokens.
     * @param community Community with the tokens
     * @param tokenIds Token ids to grab supplies for
     */
    function totalSupplyBatch(address community, uint256[] calldata tokenIds) external view returns (uint256[] memory) {
        uint256 tokenIdsLength = tokenIds.length;
        uint256[] memory supplies = new uint256[](tokenIdsLength);
        for (uint256 i = 0; i < tokenIdsLength; i++) {
            supplies[i] = ICommunity(community).totalSupply(tokenIds[i]);
        }
        return supplies;
    }

    /**
     * @dev Gets the total percentage expected to be owed to a royalty recipient on a community
     */
    function _getAccountSplitTotalPercentage(ISplitMain.Split memory split, address account)
        private
        view
        returns (uint32 totalPercentage)
    {
        if (split.primaryController == account) {
            totalPercentage += split.primaryAllocation;
        }

        uint256 secondaryAllocationsLength = split.secondaryAllocations.length;
        for (uint256 i = 0; i < secondaryAllocationsLength; i++) {
            if (split.secondaryAccounts[i] == account) {
                totalPercentage += split.secondaryAllocations[i];
            }
        }
    }

    /**
     * @dev Gets the unique set of royalty recipients for a community
     */
    function _getUniqueRecipients(ISplitMain.Split memory split) private view returns (address[] memory) {
        // secondaryAccounts have to be unique, primary account could be duplicated among secondary controllers
        // cannot use set in memory so have to do in O(n^2)
        uint256 secondaryAccountsLength = split.secondaryAccounts.length;
        bool primaryAccountDuplicated = false;
        for (uint256 i = 0; i < secondaryAccountsLength; i++) {
            if (split.secondaryAccounts[i] == split.primaryController) {
                primaryAccountDuplicated = true;
            }
        }

        if (primaryAccountDuplicated) {
            return split.secondaryAccounts;
        } else {
            address[] memory uniqueRecipients = new address[](secondaryAccountsLength + 1);
            for (uint256 i = 0; i < secondaryAccountsLength; i++) {
                uniqueRecipients[i] = split.secondaryAccounts[i];
            }
            uniqueRecipients[secondaryAccountsLength] = split.primaryController;
            return uniqueRecipients;
        }
    }
}
