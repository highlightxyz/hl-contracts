// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v4.4.0 (utils/Context.sol)

pragma solidity 0.8.10;
import "./Initializable.sol";

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 * Slightly modified by ishan @ highlight.xyz to save space in inheritance trees of descendant contracts.
 */
abstract contract ContextUpgradeable is Initializable {
    function isTrustedForwarder(address forwarder) public view virtual returns (bool) {
        return false;
    }

    function __Context_init() internal onlyInitializing {
        __Context_init_unchained();
    }

    function __Context_init_unchained() internal onlyInitializing {}

    function _msgSender() internal view virtual returns (address) {
        if (isTrustedForwarder(msg.sender)) {
            address sender;
            // The assembly code is more direct than the Solidity version using `abi.decode`.
            /* solhint-disable no-inline-assembly */
            assembly {
                sender := shr(96, calldataload(sub(calldatasize(), 20)))
            }
            /* solhint-enable no-inline-assembly */

            return sender;
        } else {
            return msg.sender;
        }
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        if (isTrustedForwarder(msg.sender)) {
            return msg.data[:msg.data.length - 20];
        } else {
            return msg.data;
        }
    }

    uint256[50] private __gap;
}
