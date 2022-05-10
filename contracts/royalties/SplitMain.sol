// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

import {ISplitMain} from "./interfaces/ISplitMain.sol";
import {SplitWallet} from "./SplitWallet.sol";
import {Clones} from "./Clones.sol";
import "../metatx/ERC2771ContextUpgradeable.sol";

import {ERC20} from "@rari-capital/solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "@rari-capital/solmate/src/utils/SafeTransferLib.sol";

/**
 * ERRORS
 */

/// @notice Unauthorized sender `sender`
/// @param sender Transaction sender
error Unauthorized(address sender);

/// @notice Invalid number of accounts `accountsLength`, must have at least 2
/// @param accountsLength Length of accounts array
error InvalidSplit__TooFewAccounts(uint256 accountsLength);

/// @notice Array lengths of accounts & percentAllocations don't match (`accountsLength` != `allocationsLength`)
/// @param accountsLength Length of accounts array
/// @param allocationsLength Length of percentAllocations array
error InvalidSplit__AccountsAndAllocationsMismatch(uint256 accountsLength, uint256 allocationsLength);

/// @notice Invalid percentAllocations sum `allocationsSum` must equal `PERCENTAGE_SCALE`
/// @param allocationsSum Sum of percentAllocations array
error InvalidSplit__InvalidAllocationsSum(uint32 allocationsSum);

/// @notice Invalid accounts ordering at `index`
/// @param index Index of out-of-order account
error InvalidSplit__AccountsOutOfOrder(uint256 index);

/// @notice Invalid percentAllocation of zero at `index`
/// @param index Index of zero percentAllocation
error InvalidSplit__AllocationMustBePositive(uint256 index);

/// @notice Invalid distributorFee `distributorFee` cannot be greater than 10% (1e5)
/// @param distributorFee Invalid distributorFee amount
error InvalidSplit__InvalidDistributorFee(uint32 distributorFee);

/// @notice Invalid hash `hash` from split data (accounts, percentAllocations, distributorFee)
/// @param hash Invalid hash
error InvalidSplit__InvalidHash(bytes32 hash);

/// @notice Invalid new controlling address `newController` for mutable split
/// @param newController Invalid new controller
error InvalidNewController(address newController);

/// @notice Invalid removed secondary controller (is not a current secondary controller)
/// @param removedSecondaryController Secondary controller that was attempted to be removed
error InvalidRemovedSecondaryController(address removedSecondaryController);

/// @notice Invalid new secondary controller (is already a current secondary controller)
/// @param newSecondaryController Secondary controller that was attempted to be added
error InvalidNewSecondaryController(address newSecondaryController);

/**
 * @title SplitMain
 * @author 0xSplits <will@0xSplits.xyz>, Highlight <ishan@highlight.xyz>
 * @notice This contract is a variation of the original 0xSplits contract, as edited by Highlight. A composable and gas-efficient protocol for deploying splitter contracts.
 * @dev Split recipients, ownerships, and keeper fees are stored onchain as calldata & re-passed as args / validated
 * via hashing when needed. Each split gets its own address & proxy for maximum composability with other contracts onchain.
 * For these proxies, we extended EIP-1167 Minimal Proxy Contract to avoid `DELEGATECALL` inside `receive()` to accept
 * hard gas-capped `sends` & `transfers`.
 */
contract SplitMain is ISplitMain, ERC2771ContextUpgradeable {
    using SafeTransferLib for address;
    using SafeTransferLib for ERC20;

    /**
     * STORAGE
     */

    /**
     * STORAGE - CONSTANTS & IMMUTABLES
     */

    /* solhint-disable var-name-mixedcase */
    /// @notice constant to scale uints into percentages (1e6 == 100%)
    uint256 public PERCENTAGE_SCALE; // make available to read

    /// @notice maximum distributor fee; 1e5 = 10% * PERCENTAGE_SCALE
    uint256 internal constant _MAX_DISTRIBUTOR_FEE = 1e5;
    /* solhint-enable var-name-mixedcase */

    /// @notice address of wallet implementation for split proxies
    address public override walletImplementation;

    /**
     * STORAGE - VARIABLES - PRIVATE & INTERNAL
     */

    /// @notice mapping to account ETH balances
    mapping(address => uint256) internal _ethBalances;
    /// @notice mapping to account ERC20 balances
    mapping(ERC20 => mapping(address => uint256)) internal _erc20Balances;
    /// @notice mapping to Split metadata
    mapping(address => Split) internal _splits;

    /**
     * MODIFIERS
     */

    /** @notice Reverts if the split with recipients represented by `secondaryAccounts`, `primaryAllocation` and `secondaryAllocations` is malformed
     *  @param primaryAllocation Amount allocated to primary recipient
     *  @param secondaryAccounts Secondary recipients
     *  @param secondaryAllocations Amounts allocated to each secondary recipient
     *  @param distributorFee Amount given to distributor
     */
    modifier validSplit(
        uint32 primaryAllocation,
        address[] calldata secondaryAccounts,
        uint32[] calldata secondaryAllocations,
        uint32 distributorFee
    ) {
        if (secondaryAccounts.length < 1) revert InvalidSplit__TooFewAccounts(secondaryAccounts.length);
        if (secondaryAccounts.length != secondaryAllocations.length)
            revert InvalidSplit__AccountsAndAllocationsMismatch(secondaryAccounts.length, secondaryAllocations.length);
        // _getSum should overflow if any percentAllocation[i] < 0
        if (_getSum(secondaryAllocations, primaryAllocation) != 1e6)
            // 1e6 = PERCENTAGE_SCALE, upgradeable contract, so hardcoding for gas efficiency
            revert InvalidSplit__InvalidAllocationsSum(_getSum(secondaryAllocations, primaryAllocation));
        unchecked {
            // overflow should be impossible in for-loop index
            // cache accounts length to save gas
            uint256 loopLength = secondaryAccounts.length - 1;
            for (uint256 i = 0; i < loopLength; ++i) {
                // overflow should be impossible in array access math
                if (secondaryAccounts[i] >= secondaryAccounts[i + 1]) revert InvalidSplit__AccountsOutOfOrder(i);
                if (secondaryAllocations[i] == uint32(0)) revert InvalidSplit__AllocationMustBePositive(i);
            }
            // overflow should be impossible in array access math with validated equal array lengths
            if (secondaryAllocations[loopLength] == uint32(0))
                revert InvalidSplit__AllocationMustBePositive(loopLength);
            if (primaryAllocation == uint32(0)) revert InvalidSplit__AllocationMustBePositive(loopLength + 1);
        }
        if (distributorFee > 1e5) revert InvalidSplit__InvalidDistributorFee(distributorFee); // // 1e5 = _MAX_DISTRIBUTOR_FEE, upgradeable contract, so hardcoding for gas efficiency
        _;
    }

    /** @notice Reverts if `newController` is the zero address
     *  @param newController Proposed new controlling address
     */
    modifier validNewController(address newController) {
        if (newController == address(0)) revert InvalidNewController(newController);
        _;
    }

    /** @notice Reverts if the sender cannot update the split
     *  @param split Split that is to be updated
     *  @param primaryAllocation New allocation for primary recipient
     */
    modifier canUpdateSplit(address split, uint32 primaryAllocation) {
        Split memory _split = _splits[split];
        address msgSender = _msgSender();
        // if primary allocation is being changed, ensure that msg sender is primaryController
        if (primaryAllocation != _split.primaryAllocation) {
            if (msgSender != _split.primaryController) {
                revert Unauthorized(msgSender);
            }
        } else if ((!_isSecondaryController(_split, msgSender) && msgSender != _split.primaryController)) {
            // if primary allocation isn't being changed, ensure that msg sender is a secondaryController OR primary controller
            revert Unauthorized(msgSender);
        }
        _;
    }

    /**
     * FUNCTIONS
     */

    /**
     * FUNCTIONS - PUBLIC & EXTERNAL
     */

    /** @notice Receive ETH
     *  @dev Used by split proxies in `distributeETH` to transfer ETH to `SplitMain`
     *  Funds sent outside of `distributeETH` will be unrecoverable
     */
    receive() external payable {}

    /**
     * INITIALIZER
     */

    /**
     * @dev See {ISplitMain-initialize}
     */
    function initialize(address trustedForwarder) external override initializer {
        __ERC2771ContextUpgradeable__init__(trustedForwarder);
        walletImplementation = address(new SplitWallet());
        PERCENTAGE_SCALE = 1e6;
    }

    /** @notice Creates a new split with recipients `secondaryAccounts` + `primaryController` with ownerships `secondaryAllocations` + `primaryAllocation`, a keeper fee for splitting of `distributorFee` and the controlling addresses
     *  @param split New split with variables mentioned above
     *  @return splitAddress Address of newly created split
     */
    function createSplit(Split calldata split, address community)
        external
        override
        validSplit(split.primaryAllocation, split.secondaryAccounts, split.secondaryAllocations, split.distributorFee)
        returns (address splitAddress)
    {
        bytes32 splitHash = _hashSplit(split, community);

        splitAddress = Clones.cloneDeterministic(walletImplementation, splitHash);
        _splits[splitAddress] = split;
        _splits[splitAddress].set = 1;
        emit CreateSplit(splitAddress);
    }

    /** @notice Updates an existing split
     *  @param split Address of split to update
     *  @param newSplit Split instance with updated values
     */
    function updateSplit(address split, Split calldata newSplit)
        external
        override
        canUpdateSplit(split, newSplit.primaryAllocation)
        validSplit(
            newSplit.primaryAllocation,
            newSplit.secondaryAccounts,
            newSplit.secondaryAllocations,
            newSplit.distributorFee
        )
    {
        _updateSplit(split, newSplit);
    }

    /** @notice Transfer primary controller mutable split `split` to `newPrimaryController`
     *  @param split Address of split to transfer control for
     *  @param newPrimaryController Address to transfer control to
     */
    function grantPrimaryController(address split, address newPrimaryController)
        external
        override
        validNewController(newPrimaryController)
    {
        address msgSender = _msgSender();
        if (msgSender != _splits[split].primaryController) {
            revert Unauthorized(msgSender);
        }
        emit NewPrimaryController(split, _splits[split].primaryController, newPrimaryController);
        _splits[split].primaryController = newPrimaryController;
    }

    /** @notice Grants secondary controller of split corresponding to `split` to `newSecondaryController`
     *  @param split Address of split to grant secondary controller for
     *  @param newSecondaryController Address to grant secondary controller abilities
     */
    function grantSecondaryController(address split, address newSecondaryController)
        external
        override
        validNewController(newSecondaryController)
    {
        Split memory _split = _splits[split];
        address msgSender = _msgSender();
        if (!_isSecondaryController(_split, msgSender)) {
            revert Unauthorized(msgSender);
        }
        if (_isSecondaryController(_split, newSecondaryController)) {
            revert InvalidNewSecondaryController(newSecondaryController);
        }
        _splits[split].secondaryControllers.push(newSecondaryController);
        emit NewSecondaryController(split, newSecondaryController);
    }

    /** @notice Renounces primary controller rights over split
     *  @param split Address of split to renounce rights over
     */
    function renouncePrimaryController(address split) external override {
        address msgSender = _msgSender();
        if (msgSender != _splits[split].primaryController) {
            revert Unauthorized(msgSender);
        }
        emit NewPrimaryController(split, _splits[split].primaryController, address(0));
        _splits[split].primaryController = address(0);
    }

    /** @notice Revokes secondary controller rights over split
     *  @param split Address of split to revoke rights over
     *  @param removedSecondaryController Secondary controller to remove
     */
    function revokeSecondaryController(address split, address removedSecondaryController) external override {
        Split memory _split = _splits[split];
        address msgSender = _msgSender();
        if (!_isSecondaryController(_split, msgSender)) {
            revert Unauthorized(msgSender);
        }
        _removeSecondaryController(split, _split, removedSecondaryController);
        emit SecondaryControllerRemoved(split, removedSecondaryController);
    }

    /** @notice Distributes the ETH balance for split `split`
     *  @param split Address of split to distribute balance for
     *  @param distributorAddress Address to pay `distributorFee` to
     */
    function distributeETH(address split, address distributorAddress) external override {
        Split memory _split = _splits[split];

        // cannot simply append on to _split.secondaryAccounts and _split.secondaryAllocations
        address[] memory accounts = new address[](_split.secondaryAccounts.length + 1);
        uint32[] memory percentages = new uint32[](_split.secondaryAccounts.length + 1);
        for (uint256 i = 0; i < _split.secondaryAccounts.length; i++) {
            accounts[i] = _split.secondaryAccounts[i];
            percentages[i] = _split.secondaryAllocations[i];
        }
        accounts[_split.secondaryAccounts.length] = _split.primaryController;
        percentages[_split.secondaryAccounts.length] = _split.primaryAllocation;

        _distributeETH(split, accounts, percentages, _split.distributorFee, distributorAddress);
    }

    /** @notice Distributes the ERC20 `token` balance for split `split`
     *  @dev pernicious ERC20s may cause overflow in this function inside
     *  _scaleAmountByPercentage, but results do not affect ETH & other ERC20 balances
     *  @param split Address of split to distribute balance for
     *  @param token Address of ERC20 to distribute balance for
     *  @param distributorAddress Address to pay `distributorFee` to
     */
    function distributeERC20(
        address split,
        ERC20 token,
        address distributorAddress
    ) external override {
        Split memory _split = _splits[split];

        // cannot simply append on to _split.secondaryAccounts and _split.secondaryAllocations
        address[] memory accounts = new address[](_split.secondaryAccounts.length + 1);
        uint32[] memory percentages = new uint32[](_split.secondaryAccounts.length + 1);
        for (uint256 i = 0; i < _split.secondaryAccounts.length; i++) {
            accounts[i] = _split.secondaryAccounts[i];
            percentages[i] = _split.secondaryAllocations[i];
        }
        accounts[_split.secondaryAccounts.length] = _split.primaryController;
        percentages[_split.secondaryAccounts.length] = _split.primaryAllocation;

        _distributeERC20(split, token, accounts, percentages, _split.distributorFee, distributorAddress);
    }

    /** @notice Withdraw ETH &/ ERC20 balances for account `account`
     *  @param account Address to withdraw on behalf of
     *  @param withdrawETH Withdraw all ETH if nonzero
     *  @param tokens Addresses of ERC20s to withdraw
     */
    function withdraw(
        address account,
        uint256 withdrawETH,
        ERC20[] calldata tokens
    ) external override {
        uint256[] memory tokenAmounts = new uint256[](tokens.length);
        uint256 ethAmount;
        if (withdrawETH != 0) {
            ethAmount = _withdraw(account);
        }
        unchecked {
            // overflow should be impossible in for-loop index
            for (uint256 i = 0; i < tokens.length; ++i) {
                // overflow should be impossible in array length math
                tokenAmounts[i] = _withdrawERC20(account, tokens[i]);
            }
            emit Withdrawal(account, ethAmount, tokens, tokenAmounts);
        }
    }

    /**
     * FUNCTIONS - VIEWS
     */

    /** @notice Predicts the address for a split created.
     *  @param split New split
     *  @return splitAddress Predicted address of such a split
     */
    function predictSplitAddress(Split calldata split, address community)
        external
        view
        override
        validSplit(split.primaryAllocation, split.secondaryAccounts, split.secondaryAllocations, split.distributorFee)
        returns (address splitAddress)
    {
        bytes32 splitHash = _hashSplit(split, community);
        splitAddress = Clones.predictDeterministicAddress(walletImplementation, splitHash);
    }

    /** @notice Returns the Split corresponding to `split`
     *  @param split Address of split to retrieve
     *  @return The Split at address `split`
     */
    function getSplit(address split) external view returns (Split memory) {
        return _splits[split];
    }

    /** @notice Returns the current ETH balance of account `account`
     *  @param account Account to return ETH balance for
     *  @return Account's balance of ETH
     */
    function getETHBalance(address account) external view returns (uint256) {
        return _ethBalances[account] + (_splits[account].set != 0 ? account.balance : 0);
    }

    /** @notice Returns the ERC20 balance of token `token` for account `account`
     *  @param account Account to return ERC20 `token` balance for
     *  @param token Token to return balance for
     *  @return Account's balance of `token`
     */
    function getERC20Balance(address account, ERC20 token) external view returns (uint256) {
        return _erc20Balances[token][account] + (_splits[account].set != 0 ? token.balanceOf(account) : 0);
    }

    /**
     * FUNCTIONS - PRIVATE & INTERNAL
     */

    /** @notice Internal function to update an existing split
     *  @param split Address of split to update
     *  @param newSplit Split instance with updated values
     */
    function _updateSplit(address split, Split calldata newSplit) internal {
        Split memory _split = _splits[split];
        _split.primaryAllocation = newSplit.primaryAllocation;
        _split.secondaryAccounts = newSplit.secondaryAccounts;
        _split.secondaryAllocations = newSplit.secondaryAllocations;
        _split.distributorFee = newSplit.distributorFee;
        _splits[split] = _split;
        emit UpdateSplit(split);
    }

    /** @notice Distributes the ETH balance for split `split`
     *  @dev `accounts`, `percentAllocations`, and `distributorFee` must be verified before calling
     *  @param split Address of split to distribute balance for
     *  @param accounts Ordered, unique list of addresses with ownership in the split
     *  @param percentAllocations Percent allocations associated with each address
     *  @param distributorFee Keeper fee paid by split to cover gas costs of distribution
     *  @param distributorAddress Address to pay `distributorFee` to
     */
    function _distributeETH(
        address split,
        address[] memory accounts,
        uint32[] memory percentAllocations,
        uint32 distributorFee,
        address distributorAddress
    ) internal {
        uint256 mainBalance = _ethBalances[split];
        uint256 proxyBalance = split.balance;
        // if mainBalance is positive, leave 1 in SplitMain for gas efficiency
        uint256 amountToSplit;
        unchecked {
            // underflow should be impossible
            if (mainBalance > 0) mainBalance -= 1;
            // overflow should be impossible
            amountToSplit = mainBalance + proxyBalance;
        }
        if (mainBalance > 0) _ethBalances[split] = 1;
        // emit event with gross amountToSplit (before deducting distributorFee)
        emit DistributeETH(split, amountToSplit, distributorAddress);
        if (distributorFee != 0) {
            // given `amountToSplit`, calculate keeper fee
            uint256 distributorFeeAmount = _scaleAmountByPercentage(amountToSplit, distributorFee);
            unchecked {
                // credit keeper with fee
                // overflow should be impossible with validated distributorFee
                _ethBalances[
                    distributorAddress != address(0) ? distributorAddress : _msgSender()
                ] += distributorFeeAmount;
                // given keeper fee, calculate how much to distribute to split recipients
                // underflow should be impossible with validated distributorFee
                amountToSplit -= distributorFeeAmount;
            }
        }
        unchecked {
            // distribute remaining balance
            // overflow should be impossible in for-loop index
            // cache accounts length to save gas
            uint256 accountsLength = accounts.length;
            for (uint256 i = 0; i < accountsLength; ++i) {
                // overflow should be impossible with validated allocations
                _ethBalances[accounts[i]] += _scaleAmountByPercentage(amountToSplit, percentAllocations[i]);
            }
        }
        // flush proxy ETH balance to SplitMain
        // split proxy should be guaranteed to exist at this address
        // (attacker can't deploy own contract to address with high balance & empty sendETHToMain
        // to drain ETH from SplitMain)
        // could technically check if (change in proxy balance == change in SplitMain balance)
        // before/after external call, but seems like extra gas for no practical benefit
        if (proxyBalance > 0) SplitWallet(split).sendETHToMain(proxyBalance);
    }

    /** @notice Distributes the ERC20 `token` balance for split `split`
     *  @dev `accounts`, `percentAllocations`, and `distributorFee` must be verified before calling
     *  @dev pernicious ERC20s may cause overflow in this function inside
     *  _scaleAmountByPercentage, but results do not affect ETH & other ERC20 balances
     *  @param split Address of split to distribute balance for
     *  @param token Address of ERC20 to distribute balance for
     *  @param accounts Ordered, unique list of addresses with ownership in the split
     *  @param percentAllocations Percent allocations associated with each address
     *  @param distributorFee Keeper fee paid by split to cover gas costs of distribution
     *  @param distributorAddress Address to pay `distributorFee` to
     */
    function _distributeERC20(
        address split,
        ERC20 token,
        address[] memory accounts,
        uint32[] memory percentAllocations,
        uint32 distributorFee,
        address distributorAddress
    ) internal {
        uint256 amountToSplit;
        uint256 mainBalance = _erc20Balances[token][split];
        uint256 proxyBalance = token.balanceOf(split);
        unchecked {
            // if mainBalance &/ proxyBalance are positive, leave 1 for gas efficiency
            // underflow should be impossible
            if (proxyBalance > 0) proxyBalance -= 1;
            // underflow should be impossible
            if (mainBalance > 0) {
                mainBalance -= 1;
            }
            // overflow should be impossible
            amountToSplit = mainBalance + proxyBalance;
        }
        if (mainBalance > 0) _erc20Balances[token][split] = 1;
        // emit event with gross amountToSplit (before deducting distributorFee)
        emit DistributeERC20(split, token, amountToSplit, distributorAddress);
        if (distributorFee != 0) {
            // given `amountToSplit`, calculate keeper fee
            uint256 distributorFeeAmount = _scaleAmountByPercentage(amountToSplit, distributorFee);
            // overflow should be impossible with validated distributorFee
            unchecked {
                // credit keeper with fee
                _erc20Balances[token][
                    distributorAddress != address(0) ? distributorAddress : _msgSender()
                ] += distributorFeeAmount;
                // given keeper fee, calculate how much to distribute to split recipients
                amountToSplit -= distributorFeeAmount;
            }
        }
        // distribute remaining balance
        // overflows should be impossible in for-loop with validated allocations
        unchecked {
            // cache accounts length to save gas
            uint256 accountsLength = accounts.length;
            for (uint256 i = 0; i < accountsLength; ++i) {
                _erc20Balances[token][accounts[i]] += _scaleAmountByPercentage(amountToSplit, percentAllocations[i]);
            }
        }
        // split proxy should be guaranteed to exist at this address after validating splitHash
        // (attacker can't deploy own contract to address with high ERC20 balance & empty
        // sendERC20ToMain to drain ERC20 from SplitMain)
        // doesn't support rebasing or fee-on-transfer tokens
        // flush extra proxy ERC20 balance to SplitMain
        if (proxyBalance > 0) SplitWallet(split).sendERC20ToMain(token, proxyBalance);
    }

    /** @notice Withdraw ETH for account `account`
     *  @param account Account to withdrawn ETH for
     *  @return withdrawn Amount of ETH withdrawn
     */
    function _withdraw(address account) internal returns (uint256 withdrawn) {
        // leave balance of 1 for gas efficiency
        // underflow if ethBalance is 0
        withdrawn = _ethBalances[account] - 1;
        _ethBalances[account] = 1;
        account.safeTransferETH(withdrawn);
    }

    /** @notice Withdraw ERC20 `token` for account `account`
     *  @param account Account to withdrawn ERC20 `token` for
     *  @return withdrawn Amount of ERC20 `token` withdrawn
     */
    function _withdrawERC20(address account, ERC20 token) internal returns (uint256 withdrawn) {
        // leave balance of 1 for gas efficiency
        // underflow if erc20Balance is 0
        withdrawn = _erc20Balances[token][account] - 1;
        _erc20Balances[token][account] = 1;
        token.safeTransfer(account, withdrawn);
    }

    /** @notice Removes account as a secondary controller from split, and if account isn't found in secondary controllers, revert
     *  @param split The split address
     *  @param _split The split data (used to save gas by not accessing storage constantly)
     *  @param account The account to remove as a secondary controller
     */
    function _removeSecondaryController(
        address split,
        Split memory _split,
        address account
    ) internal {
        uint256 secondaryControllersLength = _split.secondaryControllers.length;
        for (uint256 i = 0; i < secondaryControllersLength; i++) {
            if (_split.secondaryControllers[i] == account) {
                _splits[split].secondaryControllers[i] = _split.secondaryControllers[secondaryControllersLength - 1]; // fill in spot with last element
                _splits[split].secondaryControllers.pop(); // remove last element
                return;
            }
        }

        // execution arriving here means account isn't a secondary controller
        revert InvalidRemovedSecondaryController(account);
    }

    /** @notice Sums array of uint32s
     *  @param numbers Array of uint32s to sum
     *  @return sum Sum of `numbers`.
     */
    function _getSum(uint32[] memory numbers, uint32 finalNumber) internal pure returns (uint32 sum) {
        // overflow should be impossible in for-loop index
        uint256 numbersLength = numbers.length;
        for (uint256 i = 0; i < numbersLength; ) {
            sum += numbers[i];
            unchecked {
                // overflow should be impossible in for-loop index
                ++i;
            }
        }
        sum += finalNumber;
    }

    /** @notice Hashes a split
     *  @param split Split instance whose values are to be hashed, besides the set value
     *  @return Hash of the split.
     */
    function _hashSplit(Split calldata split, address community) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    split.primaryAllocation,
                    split.distributorFee,
                    split.secondaryAllocations,
                    split.primaryController,
                    split.secondaryControllers,
                    split.secondaryAccounts,
                    community
                )
            );
    }

    /** @notice Multiplies an amount by a scaled percentage
     *  @param amount Amount to get `scaledPercentage` of
     *  @param scaledPercent Percent scaled by PERCENTAGE_SCALE
     *  @return scaledAmount Percent of `amount`.
     */
    function _scaleAmountByPercentage(uint256 amount, uint256 scaledPercent)
        internal
        pure
        returns (uint256 scaledAmount)
    {
        // use assembly to bypass checking for overflow & division by 0
        // scaledPercent has been validated to be < PERCENTAGE_SCALE)
        // & PERCENTAGE_SCALE will never be 0
        // pernicious ERC20s may cause overflow, but results do not affect ETH & other ERC20 balances

        /* solhint-disable no-inline-assembly */
        assembly {
            /* eg (100 * 2*1e4) / (1e6) */
            scaledAmount := div(mul(amount, scaledPercent), 1000000) // 1e6 = PERCENTAGE_SCALE, upgradeable contract, so hardcoding for gas efficiency
        }
        /* solhint-enable no-inline-assembly */
    }

    /** @notice Returns true if account is a secondary controller of the split
     *  @param _split The split data
     *  @param account The account to query secondary controller ownership over
     *  @return If account is secondary controller in split
     */
    function _isSecondaryController(Split memory _split, address account) internal pure returns (bool) {
        for (uint256 i = 0; i < _split.secondaryControllers.length; i++) {
            if (_split.secondaryControllers[i] == account) {
                return true;
            }
        }
        return false;
    }
}
