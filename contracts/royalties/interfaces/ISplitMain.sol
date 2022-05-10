// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

import {ERC20} from "@rari-capital/solmate/src/tokens/ERC20.sol";

/**
 * @title ISplitMain
 * @author 0xSplits <will@0xSplits.xyz>, Highlight <ishan@highlight.xyz>
 * @dev This contract is a slightly modified version of ISplitMain as per the 0xSplits protocol
 */
interface ISplitMain {
    /**
     * STRUCTS
     */

    /// @notice holds Split metadata
    struct Split {
        uint32 set;
        uint32 primaryAllocation;
        uint32 distributorFee;
        uint32[] secondaryAllocations;
        address primaryController;
        address[] secondaryControllers;
        address[] secondaryAccounts;
    }

    /**
     * EVENTS
     */

    /** @notice emitted after each successful split creation
     *  @param split Address of the created split
     */
    event CreateSplit(address indexed split);

    /** @notice emitted after each successful split update
     *  @param split Address of the updated split
     */
    event UpdateSplit(address indexed split);

    /** @notice emitted after each successful transfer of primary controller of a split
     *  @param split Address of the split control was transferred for
     *  @param previousController Address of the split's previous primary controller
     *  @param newController Address of the split's new primary controller
     */
    event NewPrimaryController(
        address indexed split,
        address indexed previousController,
        address indexed newController
    );

    /** @notice Emitted after new secondary controller added
     *  @param split Address of the split control for which the secondary controller was added
     *  @param newController Address of the split's new secondary controller
     */
    event NewSecondaryController(address indexed split, address indexed newController);

    /** @notice Emitted after secondary controller removed
     *  @param split Address of the split control for which the secondary controller was removed
     *  @param newController Address of the split's removed secondary controller
     */
    event SecondaryControllerRemoved(address indexed split, address indexed newController);

    /** @notice emitted after each successful ETH balance split
     *  @param split Address of the split that distributed its balance
     *  @param amount Amount of ETH distributed
     *  @param distributorAddress Address to credit distributor fee to
     */
    event DistributeETH(address indexed split, uint256 amount, address indexed distributorAddress);

    /** @notice emitted after each successful ERC20 balance split
     *  @param split Address of the split that distributed its balance
     *  @param token Address of ERC20 distributed
     *  @param amount Amount of ERC20 distributed
     *  @param distributorAddress Address to credit distributor fee to
     */
    event DistributeERC20(
        address indexed split,
        ERC20 indexed token,
        uint256 amount,
        address indexed distributorAddress
    );

    /** @notice emitted after each successful withdrawal
     *  @param account Address that funds were withdrawn to
     *  @param ethAmount Amount of ETH withdrawn
     *  @param tokens Addresses of ERC20s withdrawn
     *  @param tokenAmounts Amounts of corresponding ERC20s withdrawn
     */
    event Withdrawal(address indexed account, uint256 ethAmount, ERC20[] tokens, uint256[] tokenAmounts);

    /**
     * FUNCTIONS
     */

    function initialize(address trustedForwarder) external;

    function createSplit(Split calldata split, address community) external returns (address);

    function updateSplit(address split, Split calldata newSplit) external;

    function grantPrimaryController(address split, address newPrimaryController) external;

    function grantSecondaryController(address split, address newSecondaryController) external;

    function renouncePrimaryController(address split) external;

    function revokeSecondaryController(address split, address removedSecondaryController) external;

    function distributeETH(address split, address distributorAddress) external;

    function distributeERC20(
        address split,
        ERC20 token,
        address distributorAddress
    ) external;

    function withdraw(
        address account,
        uint256 withdrawETH,
        ERC20[] calldata tokens
    ) external;

    function walletImplementation() external view returns (address);

    function predictSplitAddress(Split calldata split, address community) external view returns (address);

    function getSplit(address split) external view returns (Split memory);

    function getETHBalance(address account) external view returns (uint256);

    function getERC20Balance(address account, ERC20 token) external view returns (uint256);
}
