// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

/**
 * @author ishan@highlight.xyz
 * @dev If token managers implement this, transfer actions via the community contract will call
 *      postSafeTranferFrom on the token manager.
 */
interface IPostSafeTransfer {
    /**
     * @dev Hook called by community after transfers, if token manager of transferred token implements this interface.
     * @param operator Operator transferring tokens
     * @param from Token(s) sender
     * @param to Token(s) recipient
     * @param id Transferred token's id
     * @param amount Amount transferred of token
     * @param data Arbitrary data
     */
    function postSafeTransferFrom(
        address operator,
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external;
}
